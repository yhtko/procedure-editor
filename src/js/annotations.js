(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;
  let dragState = null;
  let modalBlockId = null;

  function nextNumberLabel(block) {
    const numbers = (block.annotations || [])
      .filter(function (annotation) { return annotation.type === "number"; })
      .map(function (annotation) { return parseInt(annotation.label, 10); })
      .filter(function (value) { return !Number.isNaN(value); });
    return numbers.length ? Math.max.apply(null, numbers) + 1 : 1;
  }

  function addAnnotation(type, blockId) {
    const found = state.findBlockById(blockId || state.store.currentBlockId);
    if (!found || !found.block.image) {
      utils.toast("注釈を追加する画像がありません。");
      return;
    }
    const annotation = state.createAnnotation(type, nextNumberLabel(found.block));
    found.block.annotations.push(annotation);
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.store.selectedAnnotationId = annotation.id;
    state.markDirty();
    refreshAnnotationViews();
  }

  function deleteSelectedAnnotation() {
    const found = state.findBlockById(state.store.currentBlockId);
    if (!found || !state.store.selectedAnnotationId) {
      utils.toast("削除する注釈を選択してください。");
      return;
    }
    const before = found.block.annotations.length;
    found.block.annotations = found.block.annotations.filter(function (annotation) {
      return annotation.id !== state.store.selectedAnnotationId;
    });
    if (found.block.annotations.length === before) return;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    refreshAnnotationViews();
  }

  function openAnnotationModal(blockId) {
    const found = state.findBlockById(blockId);
    if (!found || !found.block.image) {
      utils.toast("注釈を編集する画像がありません。");
      return;
    }
    modalBlockId = found.block.id;
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    ensureAnnotationModal();
    renderAnnotationModal();
    document.body.classList.add("annotation-modal-open");
  }

  function closeAnnotationModal() {
    const modal = utils.$("annotationModal");
    if (!modalBlockId && (!modal || !modal.classList.contains("open"))) return;
    modalBlockId = null;
    dragState = null;
    if (modal) modal.classList.remove("open");
    document.body.classList.remove("annotation-modal-open");
    ns.render.renderEditor();
  }

  function ensureAnnotationModal() {
    if (utils.$("annotationModal")) return;
    const modal = document.createElement("div");
    modal.id = "annotationModal";
    modal.className = "annotation-modal no-print";
    modal.setAttribute("aria-hidden", "true");
    document.body.appendChild(modal);
  }

  function renderAnnotationModal() {
    const modal = utils.$("annotationModal");
    const found = state.findBlockById(modalBlockId);
    if (!modal || !found || !found.block.image) {
      closeAnnotationModal();
      return;
    }
    const block = found.block;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = [
      '<div class="annotation-modal-backdrop" data-action="close-annotation-modal"></div>',
      '<section class="annotation-modal-panel" role="dialog" aria-modal="true" aria-label="注釈編集">',
      '<header class="annotation-modal-head">',
      '<div>',
      '<h2>注釈編集</h2>',
      '<p>' + utils.escapeHtml(block.imageName || "スクリーンショット") + '</p>',
      '</div>',
      '<button type="button" class="secondary" data-action="close-annotation-modal">閉じる</button>',
      '</header>',
      '<div class="annotation-modal-toolbar">',
      '<button type="button" class="secondary" data-action="add-annotation" data-type="circle" data-block-id="' + utils.escapeAttribute(block.id) + '">○</button>',
      '<button type="button" class="secondary" data-action="add-annotation" data-type="arrow" data-block-id="' + utils.escapeAttribute(block.id) + '">矢印</button>',
      '<button type="button" class="secondary" data-action="add-annotation" data-type="number" data-block-id="' + utils.escapeAttribute(block.id) + '">番号</button>',
      '<button type="button" class="secondary" data-action="add-annotation" data-type="marker" data-block-id="' + utils.escapeAttribute(block.id) + '">マーカー</button>',
      '<button type="button" class="danger" data-action="delete-annotation" data-block-id="' + utils.escapeAttribute(block.id) + '">選択注釈を削除</button>',
      '</div>',
      '<div class="annotation-modal-stage">',
      imageMarkup(block, "editor"),
      '</div>',
      '</section>'
    ].join("");
  }

  function refreshAnnotationViews() {
    if (modalBlockId) {
      renderAnnotationModal();
    } else {
      ns.render.renderEditor();
    }
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  function imageMarkup(block, mode) {
    if (!block || !block.image) return "";
    const editable = mode === "editor";
    const classes = "annotated-image annotation-canvas" + (editable ? " annotation-editor" : "");
    const annotations = (block.annotations || []).map(function (annotation) {
      return annotationMarkup(block, annotation, mode);
    }).join("");
    return [
      '<div class="image-frame">',
      '<div class="' + classes + '" data-block-id="' + utils.escapeAttribute(block.id) + '">',
      '<img src="' + utils.escapeAttribute(block.image) + '" alt="' + utils.escapeAttribute(block.imageName || "スクリーンショット") + '">',
      annotations,
      "</div>",
      "</div>"
    ].join("");
  }

  function annotationMarkup(block, annotation, mode) {
    const selected = mode === "editor" && state.store.selectedAnnotationId === annotation.id;
    const editable = mode === "editor";
    const className = [
      "annotation",
      "annotation-" + annotation.type,
      editable ? "editable" : "",
      selected ? "selected" : ""
    ].filter(Boolean).join(" ");
    const data = editable
      ? ' data-annotation-id="' + utils.escapeAttribute(annotation.id) + '" data-block-id="' + utils.escapeAttribute(block.id) + '"'
      : "";
    const style = positionStyle(annotation);
    const handle = editable && selected ? '<span class="resize-handle" data-resize-handle="true"></span>' : "";

    if (annotation.type === "arrow") {
      const markerId = "arrow_" + mode + "_" + annotation.id;
      return [
        '<div class="' + className + '"' + data + ' style="' + style + '" aria-label="矢印注釈">',
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
        '<defs><marker id="' + utils.escapeAttribute(markerId) + '" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">',
        '<path d="M0,0 L8,4 L0,8 Z" fill="' + utils.escapeAttribute(annotation.color || "#ef4444") + '"></path>',
        '</marker></defs>',
        '<line x1="8" y1="88" x2="92" y2="12" stroke="' + utils.escapeAttribute(annotation.color || "#ef4444") + '" stroke-width="6" stroke-linecap="round" marker-end="url(#' + utils.escapeAttribute(markerId) + ')"></line>',
        '</svg>',
        handle,
        '</div>'
      ].join("");
    }

    if (annotation.type === "number") {
      return [
        '<div class="' + className + '"' + data + ' style="' + style + '" aria-label="番号注釈">',
        '<span>' + utils.escapeHtml(annotation.label || "1") + '</span>',
        handle,
        '</div>'
      ].join("");
    }

    return [
      '<div class="' + className + '"' + data + ' style="' + style + '" aria-label="' + (annotation.type === "marker" ? "マーカー注釈" : "丸注釈") + '">',
      handle,
      '</div>'
    ].join("");
  }

  function positionStyle(annotation) {
    const maxW = Math.max(1, 100 - utils.clamp(annotation.x, 0, 99));
    const maxH = Math.max(1, 100 - utils.clamp(annotation.y, 0, 99));
    const width = utils.clamp(annotation.w, 4, maxW);
    const height = utils.clamp(annotation.h, 4, maxH);
    return [
      "left:" + utils.clamp(annotation.x, 0, 99).toFixed(3) + "%;",
      "top:" + utils.clamp(annotation.y, 0, 99).toFixed(3) + "%;",
      "width:" + width.toFixed(3) + "%;",
      "height:" + height.toFixed(3) + "%;",
      "color:" + utils.escapeAttribute(annotation.color || "#ef4444") + ";"
    ].join("");
  }

  function handlePointerDown(event) {
    const annotationEl = event.target.closest(".annotation.editable");
    if (!annotationEl) return false;
    const canvas = annotationEl.closest(".annotation-canvas");
    const blockId = canvas && canvas.dataset.blockId;
    const annotationId = annotationEl.dataset.annotationId;
    const found = state.findBlockById(blockId);
    if (!found) return false;
    const annotation = state.findAnnotation(found.block, annotationId);
    if (!annotation) return false;

    event.preventDefault();
    event.stopPropagation();
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.store.selectedAnnotationId = annotation.id;
    updateSelectedClass(canvas, annotation.id);

    const rect = canvas.getBoundingClientRect();
    dragState = {
      mode: event.target.closest("[data-resize-handle]") ? "resize" : "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      annotation,
      element: annotationEl,
      original: {
        x: annotation.x,
        y: annotation.y,
        w: annotation.w,
        h: annotation.h
      }
    };
    annotationEl.setPointerCapture(event.pointerId);
    return true;
  }

  function handlePointerMove(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const dx = ((event.clientX - dragState.startX) / dragState.rect.width) * 100;
    const dy = ((event.clientY - dragState.startY) / dragState.rect.height) * 100;
    const annotation = dragState.annotation;

    if (dragState.mode === "resize") {
      annotation.w = utils.clamp(dragState.original.w + dx, 4, 100 - dragState.original.x);
      annotation.h = utils.clamp(dragState.original.h + dy, 4, 100 - dragState.original.y);
    } else {
      annotation.x = utils.clamp(dragState.original.x + dx, 0, 100 - dragState.original.w);
      annotation.y = utils.clamp(dragState.original.y + dy, 0, 100 - dragState.original.h);
    }
    dragState.element.setAttribute("style", positionStyle(annotation));
    state.markDirty();
    ns.render.updateDirtyIndicator();
    return true;
  }

  function handlePointerUp(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return false;
    event.preventDefault();
    try {
      dragState.element.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture can already be released by the browser.
    }
    dragState = null;
    refreshAnnotationViews();
    return true;
  }

  function updateSelectedClass(canvas, annotationId) {
    utils.$$(".annotation.editable", canvas).forEach(function (node) {
      node.classList.toggle("selected", node.dataset.annotationId === annotationId);
      const oldHandle = node.querySelector(".resize-handle");
      if (oldHandle) oldHandle.remove();
      if (node.dataset.annotationId === annotationId) {
        const handle = document.createElement("span");
        handle.className = "resize-handle";
        handle.dataset.resizeHandle = "true";
        node.appendChild(handle);
      }
    });
  }

  ns.annotations = {
    addAnnotation,
    deleteSelectedAnnotation,
    openAnnotationModal,
    closeAnnotationModal,
    imageMarkup,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    positionStyle
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
