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
    downloadMarkdown,
    copyMarkdown,
    printDocument
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
