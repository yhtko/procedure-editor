(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  function exportViewerHtml() {
    const project = state.store.project;
    const baseName = utils.sanitizeFileName(project.cover.title, "手順書");
    const html = buildViewerHtml(project);
    utils.downloadText(baseName + "_viewer_" + utils.timestamp() + ".html", html, "text/html;charset=utf-8");
    utils.toast("閲覧用HTMLを出力しました。");
  }

  function buildViewerHtml(project) {
    const cover = project.cover;
    const toc = project.steps.map(function (step, index) {
      const id = "step-" + (index + 1);
      return '<li><a href="#' + id + '">STEP ' + (index + 1) + ' ' + utils.escapeHtml(step.title || "") + "</a></li>";
    }).join("");

    const steps = project.steps.map(function (step, stepIndex) {
      const blocks = (step.blocks || []).map(function (block, blockIndex) {
        return [
          '<article class="viewer-block">',
          '<h4>' + (stepIndex + 1) + "." + (blockIndex + 1) + " " + utils.escapeHtml(block.title || "") + "</h4>",
          block.text ? '<p>' + utils.textToHtml(block.text) + "</p>" : "",
          block.image ? viewerImageMarkup(block) : "",
          "</article>"
        ].join("");
      }).join("");

      return [
        '<section id="step-' + (stepIndex + 1) + '" class="viewer-step">',
        '<h3>STEP ' + (stepIndex + 1) + " " + utils.escapeHtml(step.title || "") + "</h3>",
        step.screen ? '<p><strong>画面名:</strong> ' + utils.escapeHtml(step.screen) + "</p>" : "",
        step.summary ? '<p>' + utils.textToHtml(step.summary) + "</p>" : "",
        step.check ? '<p><strong>注意・確認ポイント</strong><br>' + utils.textToHtml(step.check) + "</p>" : "",
        blocks,
        "</section>"
      ].join("");
    }).join("");

    const coverRows = ns.exporter.coverRows(cover).map(function (row) {
      return '<tr><th>' + utils.escapeHtml(row[0]) + '</th><td>' + utils.textToHtml(row[1] || "") + "</td></tr>";
    }).join("");

    const coverSections = ns.exporter.coverSections(cover).map(function (section) {
      if (!section[1]) return "";
      return '<section class="cover-section"><h2>' + utils.escapeHtml(section[0]) + '</h2><p>' + utils.textToHtml(section[1]) + "</p></section>";
    }).join("");

    const css = viewerCss();
    const js = viewerScript().replace(/<\/script/gi, "<\\/script");

    return [
      "<!DOCTYPE html>",
      '<html lang="ja">',
      "<head>",
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      "<title>" + utils.escapeHtml(cover.title || "PC操作手順書") + "</title>",
      "<style>" + css + "</style>",
      "</head>",
      "<body>",
      '<header class="viewer-header">',
      '<div><h1>' + utils.escapeHtml(cover.title || "PC操作手順書") + '</h1><p>閲覧用手順書</p></div>',
      '<input id="searchBox" type="search" placeholder="検索">',
      "</header>",
      '<main class="viewer-main">',
      '<aside class="toc"><h2>目次</h2><ol>' + toc + "</ol></aside>",
      '<article class="content">',
      '<section class="cover"><h2>表紙情報</h2><table>' + coverRows + "</table></section>",
      coverSections,
      '<h2>操作手順</h2>',
      steps || '<p class="empty">STEPがありません。</p>',
      "</article>",
      "</main>",
      '<div id="imageModal" class="image-modal" aria-hidden="true"><button type="button" class="modal-close" aria-label="閉じる">×</button><div class="modal-body"></div></div>',
      "<script>" + js + "</script>",
      "</body>",
      "</html>"
    ].join("");
  }

  function viewerImageMarkup(block) {
    const annotations = (block.annotations || []).map(function (annotation) {
      return viewerAnnotationMarkup(annotation);
    }).join("");
    return [
      '<figure class="viewer-image-frame" tabindex="0" role="button" aria-label="画像を拡大">',
      '<div class="annotated-image">',
      '<img src="' + utils.escapeAttribute(block.image) + '" alt="' + utils.escapeAttribute(block.imageName || "スクリーンショット") + '">',
      annotations,
      "</div>",
      block.imageName ? '<figcaption>' + utils.escapeHtml(block.imageName) + "</figcaption>" : "",
      "</figure>"
    ].join("");
  }

  function viewerAnnotationMarkup(annotation) {
    const style = ns.annotations.positionStyle(annotation);
    const color = utils.escapeAttribute(annotation.color || "#ef4444");
    if (annotation.type === "arrow") {
      const markerId = "viewer_arrow_" + annotation.id;
      return [
        '<div class="annotation annotation-arrow" style="' + style + '">',
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
        '<defs><marker id="' + utils.escapeAttribute(markerId) + '" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">',
        '<path d="M0,0 L8,4 L0,8 Z" fill="' + color + '"></path>',
        '</marker></defs>',
        '<line x1="8" y1="88" x2="92" y2="12" stroke="' + color + '" stroke-width="6" stroke-linecap="round" marker-end="url(#' + utils.escapeAttribute(markerId) + ')"></line>',
        '</svg></div>'
      ].join("");
    }
    if (annotation.type === "number") {
      return '<div class="annotation annotation-number" style="' + style + '"><span>' + utils.escapeHtml(annotation.label || "1") + "</span></div>";
    }
    return '<div class="annotation annotation-' + utils.escapeAttribute(annotation.type) + '" style="' + style + '"></div>';
  }

  function viewerCss() {
    return [
      "body{margin:0;background:#f4f6f9;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;font-size:15px;line-height:1.6}",
      "a{color:#1d4ed8}",
      ".viewer-header{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 22px;border-bottom:1px solid #d7dee8;background:rgba(255,255,255,.96);backdrop-filter:blur(10px)}",
      ".viewer-header h1{margin:0;font-size:22px}.viewer-header p{margin:2px 0 0;color:#667085;font-size:12px}",
      "#searchBox{width:min(360px,42vw);border:1px solid #d7dee8;border-radius:6px;padding:9px 10px;font:inherit}",
      ".viewer-main{display:grid;grid-template-columns:260px minmax(0,980px);gap:18px;max-width:1280px;margin:18px auto 40px;padding:0 18px;align-items:start}",
      ".toc{position:sticky;top:86px;border:1px solid #d7dee8;border-radius:8px;background:#fff;padding:14px}.toc h2{font-size:16px;margin:0 0 8px}.toc ol{margin:0;padding-left:22px}.toc li{margin:6px 0}",
      ".content{border:1px solid #d7dee8;border-radius:8px;background:#fff;padding:28px;box-shadow:0 10px 24px rgba(15,23,42,.08)}",
      ".cover table{width:100%;border-collapse:collapse}.cover th,.cover td{border:1px solid #cbd5e1;padding:9px;text-align:left;vertical-align:top}.cover th{width:28%;background:#f1f5f9}",
      ".viewer-step{margin-top:30px;padding-top:16px;border-top:3px solid #1e293b}.viewer-block{margin:18px 0 24px}.viewer-block h4{margin:0 0 8px}",
      ".viewer-image-frame{display:inline-block;max-width:100%;margin:10px 0 0;cursor:zoom-in}.viewer-image-frame figcaption{margin-top:4px;color:#667085;font-size:12px}.annotated-image{position:relative;display:inline-block;line-height:0;max-width:100%}.annotated-image img{display:block;max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:#fff}",
      ".annotation{position:absolute;min-width:14px;min-height:14px;color:#ef4444;line-height:1}.annotation-circle{border:3px solid currentColor;border-radius:999px;background:rgba(255,255,255,.02)}.annotation-marker{border:2px solid rgba(180,83,9,.75);background:rgba(250,204,21,.38)}.annotation-number{display:flex;align-items:center;justify-content:center;border:3px solid #fff;border-radius:999px;background:currentColor;box-shadow:0 1px 6px rgba(15,23,42,.3)}.annotation-number span{color:#fff;font-weight:900;font-size:clamp(12px,2.6vw,28px);line-height:1}.annotation-arrow svg{display:block;width:100%;height:100%;overflow:visible}",
      ".image-modal{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;padding:40px;background:rgba(15,23,42,.78)}.image-modal.open{display:flex}.modal-body{max-width:96vw;max-height:92vh;overflow:auto}.modal-body .viewer-image-frame{cursor:default}.modal-body img{max-width:92vw;max-height:86vh}.modal-close{position:absolute;right:18px;top:14px;border:0;border-radius:6px;background:#fff;color:#172033;font-size:28px;line-height:1;padding:4px 11px;cursor:pointer}",
      ".empty{color:#667085}",
      "@media(max-width:820px){.viewer-header{align-items:flex-start;flex-direction:column}.viewer-main{grid-template-columns:1fr}.toc{position:static}#searchBox{width:100%}.content{padding:18px}}",
      "@media print{.viewer-header,#searchBox,.toc{display:none}.viewer-main{display:block;max-width:none;margin:0;padding:0}.content{border:0;box-shadow:none;padding:0}.viewer-step,.viewer-block{break-inside:avoid}}"
    ].join("");
  }

  function viewerScript() {
    return [
      "(function(){",
      "var search=document.getElementById('searchBox');",
      "if(search){search.addEventListener('input',function(){var q=search.value.trim().toLowerCase();document.querySelectorAll('.viewer-step').forEach(function(step){step.hidden=q&&!step.textContent.toLowerCase().includes(q);});});}",
      "var modal=document.getElementById('imageModal');var body=modal.querySelector('.modal-body');",
      "function openModal(frame){body.innerHTML=frame.outerHTML;modal.classList.add('open');modal.setAttribute('aria-hidden','false');}",
      "function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');body.innerHTML='';}",
      "document.addEventListener('click',function(e){var frame=e.target.closest('.viewer-image-frame');if(frame&&frame.closest('.content'))openModal(frame);if(e.target===modal||e.target.closest('.modal-close'))closeModal();});",
      "document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('viewer-image-frame')){e.preventDefault();openModal(e.target);}});",
      "})();"
    ].join("");
  }

  ns.viewerExport = {
    exportViewerHtml,
    buildViewerHtml
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
