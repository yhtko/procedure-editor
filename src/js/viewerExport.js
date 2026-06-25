(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  function exportViewerHtml() {
    const project = state.store.project;
    const baseName = utils.sanitizeFileName(project.cover.title, "手順書");
    const html = buildViewerHtml(project);
    utils.downloadText(baseName + "_" + utils.timestamp() + ".html", html, "text/html;charset=utf-8");
    state.markClean();
    ns.render.updateDirtyIndicator();
    utils.toast("HTMLを保存しました。");
  }

  function buildViewerHtml(project) {
    const cover = project.cover;
    const allSteps = project.steps;
    const normalSteps    = allSteps.filter(function (s) { return s.type === "normal"; });
    const irregularSteps = allSteps.filter(function (s) { return s.type === "irregular"; });
    const errorSteps     = allSteps.filter(function (s) { return s.type === "error"; });

    const stepNums = {};
    normalSteps.forEach(function (s, i) { stepNums[s.id] = { label: "STEP " + (i + 1), type: "normal" }; });
    irregularSteps.forEach(function (s, i) { stepNums[s.id] = { label: "非定常 " + (i + 1), type: "irregular" }; });
    errorSteps.forEach(function (s, i) { stepNums[s.id] = { label: "エラー対応 " + (i + 1), type: "error" }; });

    const normalToc = normalSteps.map(function (step, i) {
      return '<li><a href="#step-' + utils.escapeAttribute(step.id) + '">STEP ' + (i + 1) + " " + utils.escapeHtml(step.title || "") + "</a></li>";
    }).join("");
    const irregularToc = irregularSteps.length
      ? '<li class="toc-section-label toc-irregular-label">非定常業務手順</li>' + irregularSteps.map(function (step, i) {
          return '<li><a href="#step-' + utils.escapeAttribute(step.id) + '">非定常 ' + (i + 1) + " " + utils.escapeHtml(step.title || "") + "</a></li>";
        }).join("")
      : "";
    const errorToc = errorSteps.length
      ? '<li class="toc-section-label toc-error-label">エラー対応手順</li>' + errorSteps.map(function (step, i) {
          return '<li><a href="#step-' + utils.escapeAttribute(step.id) + '">エラー対応 ' + (i + 1) + " " + utils.escapeHtml(step.title || "") + "</a></li>";
        }).join("")
      : "";
    const toc = normalToc + irregularToc + errorToc;

    function buildStep(step, label, stepNum, stepType) {
      const blocks = (step.blocks || []).map(function (block, blockIndex) {
        const jumpsHtml = (block.jumps || []).length
          ? '<div class="viewer-jump-row">' + block.jumps.map(function (jump) {
              const info = stepNums[jump.targetStepId] || { label: "?", type: "error" };
              const isIrregular = info.type === "irregular";
              const btnClass = isIrregular ? "viewer-jump-button viewer-jump-button-irregular" : "viewer-jump-button";
              const icon = isIrregular ? "↗" : "⚠";
              return '<a href="#step-' + utils.escapeAttribute(jump.targetStepId) + '" class="' + btnClass + '">' + icon + ' ' + info.label + ': ' + utils.escapeHtml(jump.label || "") + '</a>';
            }).join("") + '</div>'
          : "";
        return [
          '<article class="viewer-block" id="block-' + utils.escapeAttribute(block.id) + '">',
          '<h4>' + stepNum + "." + (blockIndex + 1) + " " + utils.escapeHtml(block.title || "") + "</h4>",
          block.text ? '<p>' + utils.textToHtml(block.text) + "</p>" : "",
          jumpsHtml,
          block.image ? '<div class="viewer-block-image">' + viewerImageMarkup(block) + "</div>" : "",
          "</article>"
        ].join("");
      }).join("");

      const typeClass = stepType === "error" ? " viewer-step-error" : stepType === "irregular" ? " viewer-step-irregular" : "";
      return [
        '<section id="step-' + utils.escapeAttribute(step.id) + '" class="viewer-step' + typeClass + '">',
        '<h3>' + label + " " + utils.escapeHtml(step.title || "") + "</h3>",
        step.screen ? '<p><strong>画面名:</strong> ' + utils.escapeHtml(step.screen) + "</p>" : "",
        step.summary ? '<p>' + utils.textToHtml(step.summary) + "</p>" : "",
        step.check ? '<aside class="viewer-callout viewer-callout-warning"><h4>注意・確認ポイント</h4><p>' + utils.textToHtml(step.check) + "</p></aside>" : "",
        blocks,
        "</section>"
      ].join("");
    }

    const normalHtml = normalSteps.map(function (step, i) {
      return buildStep(step, "STEP " + (i + 1), i + 1, "normal");
    }).join("");
    const irregularSectionHtml = irregularSteps.length
      ? '<div class="viewer-irregular-section"><h2>非定常業務手順</h2>' + irregularSteps.map(function (step, i) {
          return buildStep(step, "非定常 " + (i + 1), "N" + (i + 1), "irregular");
        }).join("") + "</div>"
      : "";
    const errorSectionHtml = errorSteps.length
      ? '<div class="viewer-error-section"><h2>エラー対応手順</h2>' + errorSteps.map(function (step, i) {
          return buildStep(step, "エラー対応 " + (i + 1), "E" + (i + 1), "error");
        }).join("") + "</div>"
      : "";
    const steps = normalHtml + irregularSectionHtml + errorSectionHtml;

    const coverRows = ns.exporter.coverRows(cover).map(function (row) {
      return '<tr><th>' + utils.escapeHtml(row[0]) + '</th><td>' + utils.textToHtml(row[1] || "") + "</td></tr>";
    }).join("");

    const coverSections = ns.exporter.coverSections(cover).map(function (section) {
      if (!section[1]) return "";
      const classes = "cover-section" + (section[0] === "注意事項" ? " viewer-callout viewer-callout-warning" : "");
      return '<section class="' + classes + '"><h2>' + utils.escapeHtml(section[0]) + '</h2><p>' + utils.textToHtml(section[1]) + "</p></section>";
    }).join("");

    const css = viewerCss();
    const js = viewerScript().replace(/<\/script/gi, "<\\/script");
    const dataComment = buildDataComment(project);

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
      '<a id="viewerBackFloat" class="viewer-back-float" href="#" aria-label="元の操作に戻る"></a>',
      "<script>" + js + "</script>",
      dataComment,
      "</body>",
      "</html>"
    ].join("");
  }

  function buildDataComment(project) {
    const stripped = JSON.parse(JSON.stringify(project));
    (stripped.steps || []).forEach(function (step) {
      (step.blocks || []).forEach(function (block) {
        if (block.image) block.image = "__IMG__";
      });
    });
    const safe = JSON.stringify(stripped).replace(/-->/g, "--\\u003e");
    return "<!-- PROCEDURE_EDITOR_DATA:" + safe + " -->";
  }

  function viewerImageMarkup(block) {
    const annotations = (block.annotations || []).map(function (annotation) {
      return viewerAnnotationMarkup(annotation);
    }).join("");
    return [
      '<figure class="viewer-image-frame" tabindex="0" role="button" aria-label="画像を拡大">',
      '<div class="annotated-image" data-block-id="' + utils.escapeAttribute(block.id) + '">',
      '<img src="' + utils.escapeAttribute(block.image) + '" alt="' + utils.escapeAttribute(block.imageName || "スクリーンショット") + '">',
      annotations,
      "</div>",
      block.imageName ? '<figcaption>' + utils.escapeHtml(block.imageName) + "</figcaption>" : "",
      "</figure>"
    ].join("");
  }

  function viewerAnnotationMarkup(annotation) {
    const color = utils.escapeAttribute(annotation.color || "#ef4444");
    if (annotation.type === "arrow") {
      normalizeViewerArrow(annotation);
      const geometry = viewerArrowGeometry(annotation);
      const lineEnd = viewerArrowLineEnd(geometry);
      const headPoints = viewerArrowHeadPoints(geometry);
      return [
        '<div class="annotation annotation-arrow" style="left:' + geometry.left.toFixed(3) + '%;top:' + geometry.top.toFixed(3) + '%;width:' + geometry.width.toFixed(3) + '%;height:' + geometry.height.toFixed(3) + '%;color:' + color + ';">',
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
        '<line x1="' + geometry.x1.toFixed(3) + '" y1="' + geometry.y1.toFixed(3) + '" x2="' + lineEnd.x.toFixed(3) + '" y2="' + lineEnd.y.toFixed(3) + '" stroke="' + color + '"></line>',
        '<polygon points="' + headPoints + '" fill="' + color + '"></polygon>',
        '</svg></div>'
      ].join("");
    }
    const style = ns.annotations.positionStyle(annotation);
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
      ".viewer-callout{margin:18px 0;padding:13px 15px;border:1px solid #f6d88a;border-left:5px solid #d97706;border-radius:8px;background:#fffbeb}.viewer-callout h2,.viewer-callout h4{margin:0 0 7px;color:#7c2d12;font-size:16px}.viewer-callout p{margin:0}",
      ".viewer-step{margin-top:30px;padding-top:16px;border-top:3px solid #1e293b;scroll-margin-top:72px}.viewer-step-error{border-top-color:#d97706}.viewer-step-irregular{border-top-color:#7c3aed}.viewer-step>h3{margin:0 0 10px;font-size:22px;font-weight:900;letter-spacing:-.01em}.viewer-block{margin:18px 0 24px;scroll-margin-top:72px}.viewer-block h4{margin:0 0 6px;font-size:17px;font-weight:900}.viewer-block h4::before{content:'▶ ';color:#1e40af;font-size:.82em}.viewer-block-image{margin-left:1.5rem;padding-left:.75rem;border-left:3px solid #e2e8f0;margin-top:10px;display:inline-block;max-width:calc(100% - 1.5rem)}",
      ".viewer-back-float{position:fixed;bottom:24px;right:24px;z-index:50;display:none;align-items:center;gap:6px;padding:10px 20px;border-radius:999px;border:none;background:#1e293b;color:#fff;font:inherit;font-size:13px;font-weight:700;text-decoration:none;box-shadow:0 4px 18px rgba(15,23,42,.32);cursor:pointer;white-space:nowrap;transition:background .15s}.viewer-back-float:hover{background:#0f172a}",
      "@media print{.viewer-back-float{display:none!important}}",
      ".viewer-error-section{margin-top:48px;padding-top:20px;border-top:3px solid #d97706}.viewer-error-section h2{color:#92400e;font-size:20px;margin:0 0 12px}",
      ".viewer-irregular-section{margin-top:48px;padding-top:20px;border-top:3px solid #7c3aed}.viewer-irregular-section h2{color:#5b21b6;font-size:20px;margin:0 0 12px}",
      ".viewer-jump-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
      ".viewer-jump-button{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:6px;border:1.5px solid #d97706;background:#fffbeb;color:#92400e;font:inherit;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer}.viewer-jump-button:hover{background:#fef3c7}",
      ".viewer-jump-button-irregular{border-color:#7c3aed;background:#ede9fe;color:#5b21b6}.viewer-jump-button-irregular:hover{background:#ddd6fe}",
      ".toc-section-label{margin:10px 0 4px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;list-style:none;padding-left:0}",
      ".toc-error-label{color:#92400e}.toc-irregular-label{color:#5b21b6}",
      ".viewer-image-frame{display:inline-block;max-width:100%;margin:10px 0 0;cursor:zoom-in}.viewer-image-frame figcaption{margin-top:4px;color:#667085;font-size:12px}.annotated-image{position:relative;display:inline-block;line-height:0;max-width:100%}.annotated-image img{display:block;max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:#fff}",
      ".annotation{position:absolute;min-width:14px;min-height:14px;color:#ef4444;line-height:1}.annotation-circle,.annotation-number{min-width:0;min-height:0;height:auto;aspect-ratio:1/1;border-radius:50%}.annotation-circle{border:3px solid currentColor;background:transparent}.annotation-marker{border:3px solid currentColor;background:color-mix(in srgb,currentColor 18%,transparent);border-radius:0}.annotation-number{display:flex;align-items:center;justify-content:center;border:2px solid #fff;background:currentColor;box-shadow:0 1px 7px rgba(15,23,42,.32)}.annotation-number span{color:#fff;font-weight:700;font-size:clamp(12px,2.6vw,30px);line-height:1}.annotation-arrow{overflow:visible}.annotation-arrow svg{display:block;width:100%;height:100%;overflow:visible}.annotation-arrow line{stroke-width:3;stroke-linecap:round;vector-effect:non-scaling-stroke}",
      ".image-modal{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;padding:40px;background:rgba(15,23,42,.78)}.image-modal.open{display:flex}.modal-body{max-width:96vw;max-height:92vh;overflow:auto}.modal-body .viewer-image-frame{cursor:default}.modal-body img{max-width:92vw;max-height:86vh}.modal-close{position:absolute;right:18px;top:14px;border:0;border-radius:6px;background:#fff;color:#172033;font-size:28px;line-height:1;padding:4px 11px;cursor:pointer}",
      ".empty{color:#667085}",
      "@media(max-width:820px){.viewer-header{align-items:flex-start;flex-direction:column}.viewer-main{grid-template-columns:1fr}.toc{position:static}#searchBox{width:100%}.content{padding:18px}}",
      "@media print{.viewer-header,#searchBox,.toc{display:none}.viewer-main{display:block;max-width:none;margin:0;padding:0}.content{border:0;box-shadow:none;padding:0}.viewer-step,.viewer-block{break-inside:avoid}}"
    ].join("");
  }

  function normalizeViewerArrow(annotation) {
    if (typeof annotation.x1 !== "number") annotation.x1 = 20;
    if (typeof annotation.y1 !== "number") annotation.y1 = 50;
    if (typeof annotation.x2 !== "number") annotation.x2 = 45;
    if (typeof annotation.y2 !== "number") annotation.y2 = 50;

    annotation.x1 = utils.clamp(annotation.x1, 0, 100);
    annotation.y1 = utils.clamp(annotation.y1, 0, 100);
    annotation.x2 = utils.clamp(annotation.x2, 0, 100);
    annotation.y2 = utils.clamp(annotation.y2, 0, 100);
  }

  function viewerArrowGeometry(annotation) {
    const minX = Math.min(annotation.x1, annotation.x2);
    const minY = Math.min(annotation.y1, annotation.y2);
    const maxX = Math.max(annotation.x1, annotation.x2);
    const maxY = Math.max(annotation.y1, annotation.y2);
    const pad = 3;
    const width = Math.min(Math.max((maxX - minX) + pad * 2, 8), 100);
    const height = Math.min(Math.max((maxY - minY) + pad * 2, 8), 100);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const left = utils.clamp(centerX - width / 2, 0, 100 - width);
    const top = utils.clamp(centerY - height / 2, 0, 100 - height);

    return {
      left: left,
      top: top,
      width: width,
      height: height,
      x1: ((annotation.x1 - left) / width) * 100,
      y1: ((annotation.y1 - top) / height) * 100,
      x2: ((annotation.x2 - left) / width) * 100,
      y2: ((annotation.y2 - top) / height) * 100
    };
  }

  function viewerArrowVector(geometry) {
    const dx = geometry.x2 - geometry.x1;
    const dy = geometry.y2 - geometry.y1;
    const length = Math.max(Math.hypot(dx, dy), 0.001);

    return {
      x: dx / length,
      y: dy / length
    };
  }

  function viewerArrowHeadSize(geometry) {
    return {
      length: utils.clamp((1.8 / geometry.width) * 100, 5, 22),
      half: utils.clamp((1.2 / geometry.height) * 100, 7, 18)
    };
  }

  function viewerArrowLineEnd(geometry) {
    const vector = viewerArrowVector(geometry);
    const size = viewerArrowHeadSize(geometry);

    return {
      x: geometry.x2 - vector.x * size.length * 0.72,
      y: geometry.y2 - vector.y * size.length * 0.72
    };
  }

  function viewerArrowHeadPoints(geometry) {
    const vector = viewerArrowVector(geometry);
    const size = viewerArrowHeadSize(geometry);
    const baseX = geometry.x2 - vector.x * size.length;
    const baseY = geometry.y2 - vector.y * size.length;
    const perpendicularX = -vector.y;
    const perpendicularY = vector.x;

    return [
      geometry.x2.toFixed(3) + "," + geometry.y2.toFixed(3),
      (baseX + perpendicularX * size.half).toFixed(3) + "," + (baseY + perpendicularY * size.half).toFixed(3),
      (baseX - perpendicularX * size.half).toFixed(3) + "," + (baseY - perpendicularY * size.half).toFixed(3)
    ].join(" ");
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
      "var backFloat=document.getElementById('viewerBackFloat');var jumpReturn=null;",
      "document.addEventListener('click',function(e){",
      "if(backFloat&&(e.target===backFloat||backFloat.contains(e.target))){jumpReturn=null;backFloat.style.display='none';return;}",
      "var jb=e.target.closest('.viewer-jump-button');",
      "if(jb){var bl=jb.closest('.viewer-block[id]'),st=jb.closest('[id^=\"step-\"]');jumpReturn=bl?'#'+bl.id:st?'#'+st.id:null;}",
      "});",
      "window.addEventListener('hashchange',function(){",
      "var t=location.hash&&document.querySelector(location.hash);",
      "var isTarget=t&&(t.classList.contains('viewer-step-irregular')||t.classList.contains('viewer-step-error'));",
      "if(backFloat&&jumpReturn&&isTarget){",
      "var src=document.querySelector(jumpReturn);",
      "var h4=src&&src.querySelector('h4');",
      "backFloat.textContent='← '+(h4?h4.textContent.trim():'元に戻る');",
      "backFloat.href=jumpReturn;backFloat.style.display='flex';",
      "}else{if(backFloat)backFloat.style.display='none';if(!isTarget)jumpReturn=null;}",
      "});",
      "})();"
    ].join("");
  }

  ns.viewerExport = {
    exportViewerHtml,
    buildViewerHtml
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
