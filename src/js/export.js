(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  function coverRows(cover) {
    return [
      ["対象作業", cover.targetWork],
      ["対象者", cover.audience],
      ["使用システム", cover.systemName],
      ["必要な権限・アカウント", cover.account],
      ["版数", cover.revision],
      ["作成日", cover.createdAt],
      ["改訂日", cover.updatedAt],
      ["作成者", cover.author],
      ["承認者", cover.approver]
    ];
  }

  function coverSections(cover) {
    return [
      ["目的", cover.purpose],
      ["事前準備", cover.preparation],
      ["注意事項", cover.notes]
    ];
  }

  function generateMarkdown() {
    const project = state.store.project;
    const cover = project.cover;
    let md = "# " + (cover.title || "PC操作手順書") + "\n\n";

    coverRows(cover).forEach(function (row) {
      md += "- **" + row[0] + "**: " + (row[1] || "") + "\n";
    });
    md += "\n";

    coverSections(cover).forEach(function (section) {
      if (!section[1]) return;
      md += "## " + section[0] + "\n\n" + section[1] + "\n\n";
    });

    md += "## 操作手順\n\n";
    const normalSteps    = project.steps.filter(function (s) { return s.type === "normal"; });
    const irregularSteps = project.steps.filter(function (s) { return s.type === "irregular"; });
    const errorSteps     = project.steps.filter(function (s) { return s.type === "error"; });

    function renderStepMd(step, label, stepNum) {
      md += "### " + label + ": " + (step.title || "") + "\n\n";
      if (step.screen) md += "**画面名**: " + step.screen + "\n\n";
      if (step.summary) md += step.summary + "\n\n";
      if (step.check) md += "**注意・確認ポイント**\n\n" + step.check + "\n\n";
      (step.blocks || []).forEach(function (block, blockIndex) {
        md += "#### " + stepNum + "." + (blockIndex + 1) + " " + (block.title || "") + "\n\n";
        if (block.text) md += block.text + "\n\n";
        if (block.image) md += "![" + (block.imageName || "screenshot") + "](" + block.image + ")\n\n";
        if ((block.annotations || []).length) md += "> 注釈 " + block.annotations.length + "件\n\n";
        if ((block.jumps || []).length) {
          md += "> ↗ ジャンプ設定: " + block.jumps.map(function (j) { return j.label || j.targetStepId; }).join(", ") + "\n\n";
        }
      });
    }

    normalSteps.forEach(function (step, i) {
      renderStepMd(step, "STEP " + (i + 1), i + 1);
    });
    if (irregularSteps.length) {
      md += "## 非定常業務手順\n\n";
      irregularSteps.forEach(function (step, i) {
        renderStepMd(step, "非定常 " + (i + 1), "N" + (i + 1));
      });
    }
    if (errorSteps.length) {
      md += "## エラー対応手順\n\n";
      errorSteps.forEach(function (step, i) {
        renderStepMd(step, "エラー対応 " + (i + 1), "E" + (i + 1));
      });
    }

    return md;
  }

  function exportJson() {
    const project = state.store.project;
    const baseName = utils.sanitizeFileName(project.cover.title, "手順書");
    const fileName = baseName + "_" + utils.timestamp() + ".json";
    utils.downloadText(fileName, JSON.stringify(project, null, 2), "application/json;charset=utf-8");
    state.markClean();
    ns.render.updateDirtyIndicator();
    utils.toast("JSONを保存しました。");
  }

  async function importJsonFile(file) {
    if (!file) return;
    try {
      const text = await utils.readFileAsText(file);
      const data = JSON.parse(text);
      state.setProject(data);
      ns.render.renderAll();
      utils.toast("JSONを読み込みました。");
    } catch (error) {
      alert("JSONを読み込めませんでした: " + error.message);
    }
  }

  async function importHtmlFile(file) {
    if (!file) return;
    try {
      const text = await utils.readFileAsText(file);
      const match = text.match(/<!--\s*PROCEDURE_EDITOR_DATA:([\s\S]*?)-->/);
      if (!match) {
        alert("このHTMLファイルにはProcedure Editorのデータが含まれていません。\n閲覧HTML出力で作成したファイルを選択してください。");
        return;
      }
      const data = JSON.parse(match[1].trim());
      const doc = new DOMParser().parseFromString(text, "text/html");
      (data.steps || []).forEach(function (step) {
        (step.blocks || []).forEach(function (block) {
          if (block.image !== "__IMG__") return;
          const imgEl = doc.querySelector('.annotated-image[data-block-id="' + block.id + '"] img');
          block.image = imgEl ? imgEl.getAttribute("src") : null;
        });
      });
      state.setProject(data);
      ns.render.renderAll();
      utils.toast("閲覧HTMLを読み込みました。");
    } catch (error) {
      alert("閲覧HTMLを読み込めませんでした: " + error.message);
    }
  }

  function downloadMarkdown() {
    const project = state.store.project;
    const baseName = utils.sanitizeFileName(project.cover.title, "手順書");
    utils.downloadText(baseName + "_" + utils.timestamp() + ".md", generateMarkdown(), "text/markdown;charset=utf-8");
    utils.toast("Markdownを保存しました。");
  }

  async function copyMarkdown() {
    const markdown = generateMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
      utils.toast("Markdownをコピーしました。");
    } catch (error) {
      const output = utils.$("markdownOutput");
      output.value = markdown;
      output.focus();
      output.select();
      document.execCommand("copy");
      utils.toast("Markdownをコピーしました。");
    }
  }

  let pendingImportSteps = null;
  let pendingImportData = null;

  async function openStepImportModal(file) {
    if (!file) return;
    try {
      const text = await utils.readFileAsText(file);
      const match = text.match(/<!--\s*PROCEDURE_EDITOR_DATA:([\s\S]*?)-->/);
      if (!match) {
        alert("このHTMLファイルにはProcedure Editorのデータが含まれていません。\n閲覧HTML出力で作成したファイルを選択してください。");
        return;
      }
      const data = JSON.parse(match[1].trim());
      const doc = new DOMParser().parseFromString(text, "text/html");
      (data.steps || []).forEach(function (step) {
        (step.blocks || []).forEach(function (block) {
          if (block.image !== "__IMG__") return;
          const imgEl = doc.querySelector('.annotated-image[data-block-id="' + block.id + '"] img');
          block.image = imgEl ? imgEl.getAttribute("src") : null;
        });
      });
      pendingImportData = data;
      pendingImportSteps = data.steps || [];
      if (!pendingImportSteps.length) {
        utils.toast("インポートするSTEPが見つかりませんでした。");
        return;
      }
      showStepImportModal(pendingImportSteps);
    } catch (error) {
      alert("閲覧HTMLを読み込めませんでした: " + error.message);
    }
  }

  function showStepImportModal(steps) {
    const modal = document.getElementById("stepImportModal");
    const list = document.getElementById("stepImportList");
    const selectAll = document.getElementById("stepImportSelectAll");
    if (!modal || !list || !selectAll) return;

    const typeLabel = { normal: "通常", irregular: "非定常", error: "エラー" };
    const typeClass = { normal: "", irregular: "badge-irregular", error: "badge-error" };

    list.innerHTML = steps.map(function (step, i) {
      const type = step.type || "normal";
      const label = utils.escapeHtml(step.title || ("STEP " + (i + 1)));
      const badgeCls = "badge" + (typeClass[type] ? " " + typeClass[type] : "");
      return '<li><label><input type="checkbox" class="step-import-cb" data-step-id="' +
        utils.escapeAttribute(step.id) + '" checked><span class="' + badgeCls + '">' +
        utils.escapeHtml(typeLabel[type] || type) + '</span><span class="step-import-title">' + label + '</span></label></li>';
    }).join("");

    selectAll.checked = true;
    selectAll.indeterminate = false;

    selectAll.onchange = function () {
      list.querySelectorAll(".step-import-cb").forEach(function (cb) {
        cb.checked = selectAll.checked;
      });
    };

    list.onchange = function () {
      const all = list.querySelectorAll(".step-import-cb");
      const checked = list.querySelectorAll(".step-import-cb:checked");
      if (checked.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      } else if (checked.length === all.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
      } else {
        selectAll.indeterminate = true;
      }
    };

    modal.hidden = false;
  }

  function confirmStepImport() {
    if (!pendingImportSteps) return;
    const list = document.getElementById("stepImportList");
    if (!list) return;

    const checkedIds = Array.from(list.querySelectorAll(".step-import-cb:checked")).map(function (cb) {
      return cb.dataset.stepId;
    });
    if (!checkedIds.length) {
      utils.toast("STEPが選択されていません。");
      return;
    }

    const selected = pendingImportSteps.filter(function (s) { return checkedIds.includes(s.id); });

    const stepIdMap = {};
    selected.forEach(function (s) { stepIdMap[s.id] = utils.uid("step"); });

    const remapped = selected.map(function (step) {
      return Object.assign({}, step, {
        id: stepIdMap[step.id],
        blocks: (step.blocks || []).map(function (block) {
          return Object.assign({}, block, {
            id: utils.uid("blk"),
            annotations: (block.annotations || []).map(function (a) {
              return Object.assign({}, a, { id: utils.uid("ann") });
            }),
            jumps: (block.jumps || []).map(function (j) {
              const nj = Object.assign({}, j, { id: utils.uid("jump") });
              if (nj.targetStepId && stepIdMap[nj.targetStepId]) {
                nj.targetStepId = stepIdMap[nj.targetStepId];
              }
              return nj;
            })
          });
        })
      });
    });

    const steps = state.store.project.steps;
    remapped.forEach(function (step) {
      if (step.type === "normal") {
        const idx = steps.findIndex(function (s) { return s.type !== "normal"; });
        if (idx === -1) steps.push(step); else steps.splice(idx, 0, step);
      } else if (step.type === "irregular") {
        const idx = steps.findIndex(function (s) { return s.type === "error"; });
        if (idx === -1) steps.push(step); else steps.splice(idx, 0, step);
      } else {
        steps.push(step);
      }
    });

    state.markDirty();
    ns.render.renderAll();
    cancelStepImport();
    utils.toast(remapped.length + " 件のSTEPを追加しました。");
  }

  function replaceAllImport() {
    if (!pendingImportData) return;
    if (state.store.dirty && !confirm("未保存の変更があります。このHTMLで上書きしますか？")) return;
    state.setProject(pendingImportData);
    ns.render.renderAll();
    cancelStepImport();
    utils.toast("閲覧HTMLを読み込みました。");
  }

  function cancelStepImport() {
    const modal = document.getElementById("stepImportModal");
    if (modal) modal.hidden = true;
    pendingImportSteps = null;
    pendingImportData = null;
  }

  function printDocument() {
    ns.render.showTab("preview");
    ns.render.renderPreview();
    setTimeout(function () {
      window.print();
    }, 50);
  }

  ns.exporter = {
    coverRows,
    coverSections,
    generateMarkdown,
    exportJson,
    importJsonFile,
    importHtmlFile,
    openStepImportModal,
    confirmStepImport,
    replaceAllImport,
    cancelStepImport,
    downloadMarkdown,
    copyMarkdown,
    printDocument
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
