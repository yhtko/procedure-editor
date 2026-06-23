(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  let dragState = null;
  let modalBlockId = null;
  let placementState = null;

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

    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;

    if (type === "circle" || type === "arrow") {
      placementState = {
        type: type,
        blockId: found.block.id,
        arrowStart: null
      };

      if (type === "circle") {
        utils.toast("画像上をクリックして○を配置してください。");
      } else {
        utils.toast("矢印の始点をクリックしてください。");
      }

      return;
    }

    const annotation = state.createAnnotation(type, nextNumberLabel(found.block));
    found.block.annotations.push(annotation);
    state.store.selectedAnnotationId = annotation.id;

    placementState = null;
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
    placementState = null;

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
    placementState = null;

    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }

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
      '</div>',
      '</div>'
    ].join("");
  }

  function annotationMarkup(block, annotation, mode) {
    normalizeAnnotation(annotation);

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

    if (annotation.type === "arrow") {
      return arrowMarkup(annotation, className, data, mode, editable, selected);
    }

    const style = positionStyle(annotation);
    const handle = editable && selected
      ? '<span class="resize-handle" data-resize-handle="true"></span>'
      : "";

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

  function arrowMarkup(annotation, className, data, mode, editable, selected) {
    const markerId = "arrow_" + mode + "_" + annotation.id;
    const color = annotation.color || "#ef4444";

    const handles = editable && selected
      ? [
          '<span class="arrow-point arrow-start" data-arrow-point="start" style="left:' + safePercent(annotation.x1) + '%;top:' + safePercent(annotation.y1) + '%;"></span>',
          '<span class="arrow-point arrow-end" data-arrow-point="end" style="left:' + safePercent(annotation.x2) + '%;top:' + safePercent(annotation.y2) + '%;"></span>'
        ].join("")
      : "";

    return [
      '<div class="' + className + '"' + data + ' style="left:0;top:0;width:100%;height:100%;color:' + utils.escapeAttribute(color) + ';" aria-label="矢印注釈">',
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
      '<defs>',
      '<marker id="' + utils.escapeAttribute(markerId) + '" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">',
      '<path d="M0,0 L8,4 L0,8 Z" fill="' + utils.escapeAttribute(color) + '"></path>',
      '</marker>',
      '</defs>',
      '<line x1="' + safePercent(annotation.x1) + '" y1="' + safePercent(annotation.y1) + '" x2="' + safePercent(annotation.x2) + '" y2="' + safePercent(annotation.y2) + '" stroke="' + utils.escapeAttribute(color) + '" stroke-width="2.8" stroke-linecap="round" marker-end="url(#' + utils.escapeAttribute(markerId) + ')"></line>',
      '</svg>',
      handles,
      '</div>'
    ].join("");
  }

  function positionStyle(annotation) {
    const x = utils.clamp(annotation.x, 0, 99);
    const y = utils.clamp(annotation.y, 0, 99);
    const maxW = Math.max(1, 100 - x);
    const maxH = Math.max(1, 100 - y);

    let width = utils.clamp(annotation.w, 4, maxW);
    let height = utils.clamp(annotation.h, 4, maxH);

    if (annotation.type === "circle") {
      const size = Math.min(width, height);
      width = size;
      height = size;
      annotation.w = size;
      annotation.h = size;
    }

    return [
      "left:" + x.toFixed(3) + "%;",
      "top:" + y.toFixed(3) + "%;",
      "width:" + width.toFixed(3) + "%;",
      "height:" + height.toFixed(3) + "%;",
      "color:" + utils.escapeAttribute(annotation.color || "#ef4444") + ";"
    ].join("");
  }

  function handlePointerDown(event) {
    const canvasForPlacement = event.target.closest(".annotation-canvas");

    if (placementState && canvasForPlacement) {
      const placementBlockId = canvasForPlacement.dataset.blockId;

      if (placementBlockId === placementState.blockId) {
        return handlePlacementClick(event, canvasForPlacement, placementBlockId);
      }
    }

    const annotationEl = event.target.closest(".annotation.editable");
    if (!annotationEl) return false;

    const canvas = annotationEl.closest(".annotation-canvas");
    const blockId = canvas && canvas.dataset.blockId;
    const annotationId = annotationEl.dataset.annotationId;
    const found = state.findBlockById(blockId);

    if (!found) return false;

    const annotation = state.findAnnotation(found.block, annotationId);
    if (!annotation) return false;

    normalizeAnnotation(annotation);

    event.preventDefault();
    event.stopPropagation();

    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.store.selectedAnnotationId = annotation.id;
    placementState = null;

    updateSelectedClass(canvas, annotation.id);

    const rect = canvas.getBoundingClientRect();
    const arrowPoint = event.target.closest("[data-arrow-point]");

    let mode = "move";

    if (arrowPoint) {
      mode = arrowPoint.dataset.arrowPoint === "start" ? "arrow-start" : "arrow-end";
    } else if (event.target.closest("[data-resize-handle]")) {
      mode = "resize";
    }

    dragState = {
      mode: mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: rect,
      annotation: annotation,
      element: annotationEl,
      original: {
        x: annotation.x,
        y: annotation.y,
        w: annotation.w,
        h: annotation.h,
        x1: annotation.x1,
        y1: annotation.y1,
        x2: annotation.x2,
        y2: annotation.y2
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

    if (annotation.type === "arrow") {
      updateArrowDrag(annotation, dx, dy);
      updateArrowElement(dragState.element, annotation);
    } else if (dragState.mode === "resize") {
      if (annotation.type === "circle") {
        const delta = Math.max(dx, dy);
        const maxSize = Math.min(
          100 - dragState.original.x,
          100 - dragState.original.y
        );

        const size = utils.clamp(dragState.original.w + delta, 4, maxSize);

        annotation.w = size;
        annotation.h = size;
      } else {
        annotation.w = utils.clamp(dragState.original.w + dx, 4, 100 - dragState.original.x);
        annotation.h = utils.clamp(dragState.original.h + dy, 4, 100 - dragState.original.y);
      }

      dragState.element.setAttribute("style", positionStyle(annotation));
    } else {
      annotation.x = utils.clamp(dragState.original.x + dx, 0, 100 - dragState.original.w);
      annotation.y = utils.clamp(dragState.original.y + dy, 0, 100 - dragState.original.h);

      dragState.element.setAttribute("style", positionStyle(annotation));
    }

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

  function handlePlacementClick(event, canvas, blockId) {
    event.preventDefault();
    event.stopPropagation();

    const found = state.findBlockById(blockId);
    if (!found) return false;

    const point = getCanvasPercent(event, canvas);

    if (placementState.type === "circle") {
      const size = 12;
      const annotation = state.createAnnotation("circle", nextNumberLabel(found.block));

      annotation.x = utils.clamp(point.x - size / 2, 0, 100 - size);
      annotation.y = utils.clamp(point.y - size / 2, 0, 100 - size);
      annotation.w = size;
      annotation.h = size;

      found.block.annotations.push(annotation);
      state.store.selectedAnnotationId = annotation.id;

      placementState = null;
      state.markDirty();
      refreshAnnotationViews();

      return true;
    }

    if (placementState.type === "arrow") {
      if (!placementState.arrowStart) {
        placementState.arrowStart = point;
        utils.toast("矢印の終点をクリックしてください。");
        return true;
      }

      const annotation = state.createAnnotation("arrow", nextNumberLabel(found.block));

      annotation.x1 = placementState.arrowStart.x;
      annotation.y1 = placementState.arrowStart.y;
      annotation.x2 = point.x;
      annotation.y2 = point.y;

      annotation.x = 0;
      annotation.y = 0;
      annotation.w = 100;
      annotation.h = 100;

      found.block.annotations.push(annotation);
      state.store.selectedAnnotationId = annotation.id;

      placementState = null;
      state.markDirty();
      refreshAnnotationViews();

      return true;
    }

    return false;
  }

  function getCanvasPercent(event, canvas) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: utils.clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: utils.clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
    };
  }

  function updateArrowDrag(annotation, dx, dy) {
    if (dragState.mode === "arrow-start") {
      annotation.x1 = utils.clamp(dragState.original.x1 + dx, 0, 100);
      annotation.y1 = utils.clamp(dragState.original.y1 + dy, 0, 100);
      return;
    }

    if (dragState.mode === "arrow-end") {
      annotation.x2 = utils.clamp(dragState.original.x2 + dx, 0, 100);
      annotation.y2 = utils.clamp(dragState.original.y2 + dy, 0, 100);
      return;
    }

    const nextX1 = dragState.original.x1 + dx;
    const nextY1 = dragState.original.y1 + dy;
    const nextX2 = dragState.original.x2 + dx;
    const nextY2 = dragState.original.y2 + dy;

    const minX = Math.min(nextX1, nextX2);
    const maxX = Math.max(nextX1, nextX2);
    const minY = Math.min(nextY1, nextY2);
    const maxY = Math.max(nextY1, nextY2);

    let adjustX = 0;
    let adjustY = 0;

    if (minX < 0) adjustX = -minX;
    if (maxX > 100) adjustX = 100 - maxX;
    if (minY < 0) adjustY = -minY;
    if (maxY > 100) adjustY = 100 - maxY;

    annotation.x1 = utils.clamp(nextX1 + adjustX, 0, 100);
    annotation.y1 = utils.clamp(nextY1 + adjustY, 0, 100);
    annotation.x2 = utils.clamp(nextX2 + adjustX, 0, 100);
    annotation.y2 = utils.clamp(nextY2 + adjustY, 0, 100);
  }

  function updateArrowElement(element, annotation) {
    const line = element.querySelector("line");

    if (line) {
      line.setAttribute("x1", safePercent(annotation.x1));
      line.setAttribute("y1", safePercent(annotation.y1));
      line.setAttribute("x2", safePercent(annotation.x2));
      line.setAttribute("y2", safePercent(annotation.y2));
    }

    const start = element.querySelector(".arrow-start");
    const end = element.querySelector(".arrow-end");

    if (start) {
      start.style.left = safePercent(annotation.x1) + "%";
      start.style.top = safePercent(annotation.y1) + "%";
    }

    if (end) {
      end.style.left = safePercent(annotation.x2) + "%";
      end.style.top = safePercent(annotation.y2) + "%";
    }
  }

  function updateSelectedClass(canvas, annotationId) {
    utils.$$(".annotation.editable", canvas).forEach(function (node) {
      const selected = node.dataset.annotationId === annotationId;

      node.classList.toggle("selected", selected);

      const oldResizeHandle = node.querySelector(".resize-handle");
      if (oldResizeHandle) oldResizeHandle.remove();

      node.querySelectorAll(".arrow-point").forEach(function (handle) {
        handle.remove();
      });

      if (!selected) return;

      const found = state.findBlockById(canvas.dataset.blockId);
      const annotation = found && state.findAnnotation(found.block, annotationId);
      if (!annotation) return;

      normalizeAnnotation(annotation);

      if (annotation.type === "arrow") {
        const start = document.createElement("span");
        start.className = "arrow-point arrow-start";
        start.dataset.arrowPoint = "start";
        start.style.left = safePercent(annotation.x1) + "%";
        start.style.top = safePercent(annotation.y1) + "%";

        const end = document.createElement("span");
        end.className = "arrow-point arrow-end";
        end.dataset.arrowPoint = "end";
        end.style.left = safePercent(annotation.x2) + "%";
        end.style.top = safePercent(annotation.y2) + "%";

        node.appendChild(start);
        node.appendChild(end);
      } else {
        const handle = document.createElement("span");
        handle.className = "resize-handle";
        handle.dataset.resizeHandle = "true";
        node.appendChild(handle);
      }
    });
  }

  function normalizeAnnotation(annotation) {
    if (!annotation) return;

    if (annotation.type === "circle") {
      const size = Math.min(
        Number(annotation.w) || 12,
        Number(annotation.h) || 12
      );

      annotation.w = utils.clamp(size, 4, 100);
      annotation.h = annotation.w;
    }

    if (annotation.type === "arrow") {
      if (typeof annotation.x1 !== "number") {
        annotation.x1 = typeof annotation.x === "number" ? annotation.x + 8 : 20;
      }

      if (typeof annotation.y1 !== "number") {
        annotation.y1 = typeof annotation.y === "number" ? annotation.y + 88 : 70;
      }

      if (typeof annotation.x2 !== "number") {
        annotation.x2 = typeof annotation.x === "number" && typeof annotation.w === "number"
          ? annotation.x + annotation.w - 8
          : 70;
      }

      if (typeof annotation.y2 !== "number") {
        annotation.y2 = typeof annotation.y === "number" && typeof annotation.h === "number"
          ? annotation.y + 12
          : 30;
      }

      annotation.x1 = utils.clamp(annotation.x1, 0, 100);
      annotation.y1 = utils.clamp(annotation.y1, 0, 100);
      annotation.x2 = utils.clamp(annotation.x2, 0, 100);
      annotation.y2 = utils.clamp(annotation.y2, 0, 100);

      annotation.x = 0;
      annotation.y = 0;
      annotation.w = 100;
      annotation.h = 100;
    }
  }

  function safePercent(value) {
    return utils.clamp(Number(value) || 0, 0, 100).toFixed(3);
  }

  ns.annotations = {
    addAnnotation: addAnnotation,
    deleteSelectedAnnotation: deleteSelectedAnnotation,
    openAnnotationModal: openAnnotationModal,
    closeAnnotationModal: closeAnnotationModal,
    imageMarkup: imageMarkup,
    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp: handlePointerUp,
    positionStyle: positionStyle
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});