(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  function renderAll() {
    renderCover();
    renderStepList();
    renderEditor();
    renderSortList();
    renderPreview();
    renderMarkdown();
    updateDirtyIndicator();
    syncTabVisibility();
  }

  function renderCover() {
    const cover = state.store.project.cover;
    utils.$$("[data-cover-field]").forEach(function (field) {
      const key = field.dataset.coverField;
      field.value = cover[key] || "";
    });
  }

  function renderStepList() {
    const box = utils.$("stepList");
    const steps = state.store.project.steps;
    if (!steps.length) {
      box.innerHTML = '<div class="empty-state">STEPがありません。</div>';
      return;
    }
    box.innerHTML = steps.map(function (step, index) {
      const active = step.id === state.store.currentStepId ? " active" : "";
      return [
        '<button type="button" class="step-item' + active + '" data-action="select-step" data-step-id="' + utils.escapeAttribute(step.id) + '">',
        '<span class="step-line">',
        '<span class="badge">STEP ' + (index + 1) + '</span>',
        '<span class="step-title">' + utils.escapeHtml(step.title || "無題") + '</span>',
        '</span>',
        '<span class="step-meta">' + utils.escapeHtml(step.screen || "画面名なし") + " / ブロック " + (step.blocks || []).length + "件</span>",
        '</button>'
      ].join("");
    }).join("");
  }

  function renderEditor() {
    const step = state.getCurrentStep();
    const noStep = utils.$("noStep");
    const editor = utils.$("stepEditor");
    noStep.classList.toggle("hidden", !!step);
    editor.classList.toggle("hidden", !step);
    if (!step) {
      utils.$("blockList").innerHTML = "";
      renderSortList();
      return;
    }

    utils.$("stepTitle").value = step.title || "";
    utils.$("screenName").value = step.screen || "";
    utils.$("stepSummary").value = step.summary || "";
    utils.$("stepCheck").value = step.check || "";
    renderBlocks();
    renderSortList();
  }

  function renderBlocks() {
    const step = state.getCurrentStep();
    const box = utils.$("blockList");
    if (!step) {
      box.innerHTML = "";
      return;
    }
    step.blocks = step.blocks || [];
    if (!step.blocks.length) {
      box.innerHTML = '<div class="empty-state">説明ブロックがありません。</div>';
      return;
    }
    box.innerHTML = step.blocks.map(function (block, index) {
      return blockCard(step, block, index);
    }).join("");
  }

  function blockCard(step, block, index) {
    const active = block.id === state.store.currentBlockId ? " active" : "";
    const stepOptions = state.store.project.steps.map(function (targetStep, targetIndex) {
      return '<option value="' + utils.escapeAttribute(targetStep.id) + '"' + (targetStep.id === step.id ? " selected" : "") + '>STEP ' + (targetIndex + 1) + " " + utils.escapeHtml(targetStep.title || "") + "</option>";
    }).join("");

    return [
      '<article class="block' + active + '" data-block-id="' + utils.escapeAttribute(block.id) + '">',
      '<div class="block-head">',
      '<strong>ブロック ' + (index + 1) + '</strong>',
      '<div class="block-tools no-print">',
      '<button type="button" class="small secondary" data-action="move-block" data-block-id="' + utils.escapeAttribute(block.id) + '" data-dir="-1">上へ</button>',
      '<button type="button" class="small secondary" data-action="move-block" data-block-id="' + utils.escapeAttribute(block.id) + '" data-dir="1">下へ</button>',
      '<button type="button" class="small danger" data-action="delete-block" data-block-id="' + utils.escapeAttribute(block.id) + '">削除</button>',
      '</div>',
      '</div>',
      '<div class="block-body">',
      '<div class="block-grid">',
      '<div>',
      '<label class="field"><span>見出し</span><input type="text" value="' + utils.escapeAttribute(block.title || "") + '" data-block-field="title" data-block-id="' + utils.escapeAttribute(block.id) + '"></label>',
      '<div class="field">',
      '<div class="field-label-row"><span>説明</span><button type="button" class="small secondary" data-action="insert-block-link" data-block-id="' + utils.escapeAttribute(block.id) + '">リンク埋め込み</button></div>',
      '<textarea data-block-field="text" data-block-id="' + utils.escapeAttribute(block.id) + '">' + utils.escapeHtml(block.text || "") + '</textarea>',
      '</div>',
      '<label class="field no-print"><span>帰属STEP</span><select data-action="move-block-step" data-block-id="' + utils.escapeAttribute(block.id) + '">' + stepOptions + '</select></label>',
      '</div>',
      '<div>',
      '<div class="field"><span>スクリーンショット</span>' + imageEditor(block) + '</div>',
      '</div>',
      '</div>',
      '</div>',
      '</article>'
    ].join("");
  }

  function imageEditor(block) {
    if (!block.image) {
      return [
        '<label class="dropzone" data-dropzone-block-id="' + utils.escapeAttribute(block.id) + '">',
        'ここに画像をドロップ<br>またはクリックして選択',
        '<input type="file" accept="image/*" data-action="block-image-input" data-block-id="' + utils.escapeAttribute(block.id) + '">',
        '</label>'
      ].join("");
    }

    return [
      ns.annotations.imageMarkup(block, "editor"),
      '<div class="annotation-toolbar no-print">',
      '<button type="button" class="small secondary" data-action="open-annotation-modal" data-block-id="' + utils.escapeAttribute(block.id) + '">注釈編集</button>',
      '<span class="annotation-count">注釈 ' + (block.annotations || []).length + '件</span>',
      '</div>',
      '<div class="image-actions no-print">',
      '<span class="image-name">' + utils.escapeHtml(block.imageName || "画像") + '</span>',
      '<div class="block-tools">',
      '<label class="button small secondary file-button">画像変更<input type="file" accept="image/*" data-action="block-image-input" data-block-id="' + utils.escapeAttribute(block.id) + '"></label>',
      '<button type="button" class="small danger" data-action="clear-block-image" data-block-id="' + utils.escapeAttribute(block.id) + '">画像削除</button>',
      '</div>',
      '</div>'
    ].join("");
  }

  function renderSortList() {
    const box = utils.$("sortList");
    const step = state.getCurrentStep();
    if (!step) {
      box.innerHTML = '<div class="empty-state">STEPを選択してください。</div>';
      return;
    }
    if (!step.blocks || !step.blocks.length) {
      box.innerHTML = '<div class="empty-state">並び替えるブロックがありません。</div>';
      return;
    }
    box.innerHTML = step.blocks.map(function (block, index) {
      const active = block.id === state.store.currentBlockId ? " active" : "";
      return [
        '<div class="sort-item' + active + '" draggable="true" data-sort-block-id="' + utils.escapeAttribute(block.id) + '">',
        '<div class="sort-line">',
        '<span class="drag-handle" aria-hidden="true">↕</span>',
        '<span class="badge">' + (index + 1) + '</span>',
        '<span class="sort-title">' + utils.escapeHtml(block.title || "無題") + '</span>',
        '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderPreview() {
    const cover = state.store.project.cover;
    const rows = ns.exporter.coverRows(cover).map(function (row) {
      return '<tr><th>' + utils.escapeHtml(row[0]) + '</th><td>' + utils.textToHtml(row[1] || "") + '</td></tr>';
    }).join("");
    let html = '<h1>' + utils.escapeHtml(cover.title || "PC操作手順書") + '</h1>';
    html += '<table class="cover-table">' + rows + '</table>';
    ns.exporter.coverSections(cover).forEach(function (section) {
      if (!section[1]) return;
      const highlight = section[0] === "注意事項" ? ' class="preview-callout preview-callout-warning"' : "";
      html += '<section' + highlight + '><h2>' + utils.escapeHtml(section[0]) + '</h2><p>' + utils.textToHtml(section[1]) + '</p></section>';
    });
    html += '<div style="page-break-before:always"></div><h2>操作手順</h2>';
    if (!state.store.project.steps.length) {
      html += '<p class="empty-state">STEPがありません。</p>';
    }
    state.store.project.steps.forEach(function (step, stepIndex) {
      html += '<section class="preview-step">';
      html += '<h3>STEP ' + (stepIndex + 1) + ' ' + utils.escapeHtml(step.title || "") + '</h3>';
      if (step.screen) html += '<p><strong>画面名:</strong> ' + utils.escapeHtml(step.screen) + '</p>';
      if (step.summary) html += '<p>' + utils.textToHtml(step.summary) + '</p>';
      if (step.check) html += '<aside class="preview-callout preview-callout-warning"><h4>注意・確認ポイント</h4><p>' + utils.textToHtml(step.check) + '</p></aside>';
      (step.blocks || []).forEach(function (block, blockIndex) {
        html += '<div class="preview-block">';
        html += '<h4>' + (stepIndex + 1) + '.' + (blockIndex + 1) + ' ' + utils.escapeHtml(block.title || "") + '</h4>';
        if (block.text) html += '<p>' + utils.textToHtml(block.text) + '</p>';
        if (block.image) html += ns.annotations.imageMarkup(block, "preview");
        html += '</div>';
      });
      html += '</section>';
    });
    utils.$("previewArea").innerHTML = html;
  }

  function renderMarkdown() {
    const output = utils.$("markdownOutput");
    output.value = ns.exporter.generateMarkdown();
  }

  function showTab(name) {
    if (!["cover", "steps", "preview", "markdown"].includes(name)) return;
    state.store.activeTab = name;
    syncTabVisibility();
    if (name === "preview") renderPreview();
    if (name === "markdown") renderMarkdown();
  }

  function syncTabVisibility() {
    const active = state.store.activeTab;
    utils.$$("[data-tab]").forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.tab === active);
    });
    ["cover", "steps", "preview", "markdown"].forEach(function (name) {
      const panel = utils.$(name + "Tab");
      if (panel) panel.classList.toggle("hidden", name !== active);
    });
  }

  function updateDirtyIndicator() {
    const node = utils.$("dirtyState");
    if (!node) return;
    node.textContent = state.store.dirty ? "未保存" : "保存済み";
    node.classList.toggle("dirty", state.store.dirty);
  }

  ns.render = {
    renderAll,
    renderCover,
    renderStepList,
    renderEditor,
    renderBlocks,
    renderSortList,
    renderPreview,
    renderMarkdown,
    showTab,
    syncTabVisibility,
    updateDirtyIndicator
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
