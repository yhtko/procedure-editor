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

    const normalSteps    = steps.filter(function (s) { return s.type === "normal"; });
    const irregularSteps = steps.filter(function (s) { return s.type === "irregular"; });
    const errorSteps     = steps.filter(function (s) { return s.type === "error"; });

    function stepItemHtml(step, badgeText, badgeClass, extraClass) {
      const active = step.id === state.store.currentStepId ? " active" : "";
      return [
        '<div class="step-item' + extraClass + active + '" draggable="true" data-sort-step-id="' + utils.escapeAttribute(step.id) + '">',
        '<span class="step-drag-handle no-print" aria-hidden="true">↕</span>',
        '<button type="button" class="step-item-body" data-action="select-step" data-step-id="' + utils.escapeAttribute(step.id) + '">',
        '<span class="step-line">',
        '<span class="' + badgeClass + '">' + badgeText + '</span>',
        '<span class="step-title">' + utils.escapeHtml(step.title || "無題") + '</span>',
        '</span>',
        '<span class="step-meta">' + utils.escapeHtml(step.screen || "画面名なし") + " / ブロック " + (step.blocks || []).length + "件</span>",
        '</button>',
        '<button type="button" class="step-item-delete no-print" data-action="delete-step" data-step-id="' + utils.escapeAttribute(step.id) + '" title="このSTEPを削除">×</button>',
        '</div>'
      ].join("");
    }

    let html = normalSteps.map(function (step, i) {
      return stepItemHtml(step, "STEP " + (i + 1), "badge", "");
    }).join("");

    if (!normalSteps.length) {
      html += '<div class="empty-state">通常STEPがありません。</div>';
    }

    if (irregularSteps.length) {
      html += '<div class="step-list-divider step-list-divider-irregular"><span>非定常業務</span></div>';
      html += irregularSteps.map(function (step, i) {
        return stepItemHtml(step, "非定常 " + (i + 1), "badge badge-irregular", " step-item-irregular");
      }).join("");
    }

    if (errorSteps.length) {
      html += '<div class="step-list-divider"><span>エラー対応手順</span></div>';
      html += errorSteps.map(function (step, i) {
        return stepItemHtml(step, "エラー対応 " + (i + 1), "badge badge-error", " step-item-error");
      }).join("");
    }

    box.innerHTML = html;
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
    const typeSelect = utils.$("stepType");
    if (typeSelect) typeSelect.value = step.type || "normal";

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
    const addBlockBtn = '<div class="block-add-bottom no-print"><button type="button" data-action="add-block">ブロック追加</button></div>';
    box.innerHTML = step.blocks.map(function (block, index) {
      return blockCard(step, block, index);
    }).join("") + addBlockBtn;
  }

  function blockCard(step, block, index) {
    const active = block.id === state.store.currentBlockId ? " active" : "";
    const stepOptions = state.store.project.steps.map(function (targetStep, targetIndex) {
      return '<option value="' + utils.escapeAttribute(targetStep.id) + '"' + (targetStep.id === step.id ? " selected" : "") + '>STEP ' + (targetIndex + 1) + " " + utils.escapeHtml(targetStep.title || "") + "</option>";
    }).join("");

    return [
      '<article class="block' + active + '" data-block-id="' + utils.escapeAttribute(block.id) + '">',
      '<div class="block-head' + (step.type === "error" ? " block-head-error" : step.type === "irregular" ? " block-head-irregular" : "") + '">',
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
      step.type !== "error" ? blockJumpSection(block) : "",
      '</article>'
    ].join("");
  }

  function blockJumpSection(block) {
    const nonNormalSteps = state.store.project.steps.filter(function (s) { return s.type !== "normal"; });
    const jumps = block.jumps || [];
    const jumpedIds = jumps.map(function (j) { return j.targetStepId; });

    const stepNums = {};
    let ec = 0, ic = 0;
    state.store.project.steps.forEach(function (s) {
      if (s.type === "error") { ec += 1; stepNums[s.id] = { label: "エラー対応 " + ec, type: "error" }; }
      else if (s.type === "irregular") { ic += 1; stepNums[s.id] = { label: "非定常 " + ic, type: "irregular" }; }
    });

    const available = nonNormalSteps.filter(function (s) { return !jumpedIds.includes(s.id); });

    const jumpTags = jumps.map(function (jump) {
      const info = stepNums[jump.targetStepId] || { label: "?", type: "error" };
      const isIrregular = info.type === "irregular";
      const icon = isIrregular ? "↗" : "⚠";
      const tagClass = isIrregular ? "jump-tag jump-tag-irregular" : "jump-tag";
      return [
        '<span class="' + tagClass + '">',
        '<span class="jump-icon">' + icon + '</span>',
        ' ' + info.label + ': ' + utils.escapeHtml(jump.label || ""),
        '<button type="button" class="jump-tag-remove" data-action="delete-block-jump"',
        ' data-block-id="' + utils.escapeAttribute(block.id) + '"',
        ' data-jump-id="' + utils.escapeAttribute(jump.id) + '">×</button>',
        '</span>'
      ].join("");
    }).join("");

    let addHtml;
    if (nonNormalSteps.length === 0) {
      addHtml = '<span class="jump-hint">ジャンプ先のSTEPがありません</span>';
    } else if (available.length === 0) {
      addHtml = '<span class="jump-hint">すべてのジャンプ先STEPを追加済みです</span>';
    } else {
      const options = ['<option value="">選択...</option>'].concat(
        available.map(function (s) {
          const info = stepNums[s.id] || { label: s.title || "?", type: s.type };
          return '<option value="' + utils.escapeAttribute(s.id) + '">' + info.label + ': ' + utils.escapeHtml(s.title || "") + '</option>';
        })
      ).join("");
      addHtml = [
        '<select class="jump-select" data-jump-step-select data-block-id="' + utils.escapeAttribute(block.id) + '">' + options + '</select>',
        '<button type="button" class="small secondary" data-action="add-block-jump" data-block-id="' + utils.escapeAttribute(block.id) + '">追加</button>'
      ].join("");
    }

    return [
      '<div class="block-jump-section no-print">',
      '<div class="block-jump-row">',
      '<span class="block-jump-label">↗ ジャンプ設定</span>',
      addHtml,
      '</div>',
      jumps.length ? '<div class="block-jump-list">' + jumpTags + '</div>' : '',
      '</div>'
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
    const allSteps = state.store.project.steps;
    const normalSteps    = allSteps.filter(function (s) { return s.type === "normal"; });
    const irregularSteps = allSteps.filter(function (s) { return s.type === "irregular"; });
    const errorSteps     = allSteps.filter(function (s) { return s.type === "error"; });

    const stepNums = {};
    normalSteps.forEach(function (s, i) { stepNums[s.id] = { label: "STEP " + (i + 1), num: i + 1, type: "normal" }; });
    irregularSteps.forEach(function (s, i) { stepNums[s.id] = { label: "非定常 " + (i + 1), num: "N" + (i + 1), type: "irregular" }; });
    errorSteps.forEach(function (s, i) { stepNums[s.id] = { label: "エラー対応 " + (i + 1), num: "E" + (i + 1), type: "error" }; });

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
    if (!normalSteps.length && !irregularSteps.length && !errorSteps.length) {
      html += '<p class="empty-state">STEPがありません。</p>';
    }
    normalSteps.forEach(function (step, i) {
      html += previewStepHtml(step, "STEP " + (i + 1), i + 1, "normal", stepNums);
    });
    if (irregularSteps.length) {
      html += '<div class="preview-irregular-divider" style="page-break-before:always"><h2>非定常業務手順</h2></div>';
      irregularSteps.forEach(function (step, i) {
        html += previewStepHtml(step, "非定常 " + (i + 1), "N" + (i + 1), "irregular", stepNums);
      });
    }
    if (errorSteps.length) {
      html += '<div class="preview-error-divider" style="page-break-before:always"><h2>エラー対応手順</h2></div>';
      errorSteps.forEach(function (step, i) {
        html += previewStepHtml(step, "エラー対応 " + (i + 1), "E" + (i + 1), "error", stepNums);
      });
    }
    utils.$("previewArea").innerHTML = html;
  }

  function previewStepHtml(step, label, stepNum, stepType, stepNums) {
    const typeClass = stepType === "error" ? " preview-step-error" : stepType === "irregular" ? " preview-step-irregular" : "";
    let html = '<section class="preview-step' + typeClass + '" id="step-' + utils.escapeAttribute(step.id) + '">';
    html += '<h3>' + label + ' ' + utils.escapeHtml(step.title || "") + '</h3>';
    if (step.screen) html += '<p><strong>画面名:</strong> ' + utils.escapeHtml(step.screen) + '</p>';
    if (step.summary) html += '<p>' + utils.textToHtml(step.summary) + '</p>';
    if (step.check) html += '<aside class="preview-callout preview-callout-warning"><h4>注意・確認ポイント</h4><p>' + utils.textToHtml(step.check) + '</p></aside>';
    (step.blocks || []).forEach(function (block, blockIndex) {
      html += '<div class="preview-block">';
      html += '<h4>' + stepNum + '.' + (blockIndex + 1) + ' ' + utils.escapeHtml(block.title || "") + '</h4>';
      if (block.text) html += '<p>' + utils.textToHtml(block.text) + '</p>';
      if ((block.jumps || []).length) {
        html += '<div class="preview-jump-row">';
        block.jumps.forEach(function (jump) {
          const info = stepNums[jump.targetStepId] || { label: "?", type: "error" };
          const isIrregular = info.type === "irregular";
          const btnClass = isIrregular ? " preview-jump-button-irregular" : "";
          const icon = isIrregular ? "↗" : "⚠";
          html += '<a href="#step-' + utils.escapeAttribute(jump.targetStepId) + '" class="preview-jump-button' + btnClass + '">' + icon + ' ' + info.label + ': ' + utils.escapeHtml(jump.label || "") + '</a>';
        });
        html += '</div>';
      }
      if (block.image) html += '<div class="preview-block-image">' + ns.annotations.imageMarkup(block, "preview") + '</div>';
      html += '</div>';
    });
    html += '</section>';
    return html;
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
