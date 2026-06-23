(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  let dragState = null;
  let modalBlockId = null;
  let placementState = null;
  let annotationColor = "#ef4444";

  const ANNOTATION_COLORS = [
    { name: "Blue", value: "#2563eb" },
    { name: "Red", value: "#ef4444" },
    { name: "Yellow", value: "#facc15" }
  ];

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

    if (type === "circle" || type === "number" || type === "arrow" || type === "marker") {
      placementState = {
        type: type,
        blockId: found.block.id,
        arrowStart: null,
        markerStart: null
      };

      if (type === "circle") {
        utils.toast("画像上をクリックして○を配置してください。");
      } else if (type === "number") {
        utils.toast("画像上をクリックして番号を配置してください。");
      } else if (type === "arrow") {
        utils.toast("矢印の始点から終点までドラッグしてください。");
      } else {
        utils.toast("マーカーの開始位置から横にドラッグしてください。");
      }

      if (modalBlockId) renderAnnotationModal();
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

  function setAnnotationColor(color, blockId) {
    const nextColor = normalizeAnnotationColor(color);
    const found = state.findBlockById(blockId || state.store.currentBlockId);

    annotationColor = nextColor;

    if (found && state.store.selectedAnnotationId) {
      const annotation = state.findAnnotation(found.block, state.store.selectedAnnotationId);
      if (annotation) {
        annotation.color = nextColor;
        state.markDirty();
        refreshAnnotationViews();
        return;
      }
    }

    if (modalBlockId) renderAnnotationModal();
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
      annotationToolButton(block, "circle", "○"),
      annotationToolButton(block, "arrow", "矢印"),
      annotationToolButton(block, "number", "番号"),
      annotationToolButton(block, "marker", "マーカー"),
      annotationColorButtons(block),
      '<button type="button" class="danger" data-action="delete-annotation" data-block-id="' + utils.escapeAttribute(block.id) + '">選択注釈を削除</button>',
      '</div>',

      '<div class="annotation-modal-stage">',
      imageMarkup(block, "editor"),
      '</div>',

      '</section>'
    ].join("");
  }

  function annotationToolButton(block, type, label) {
    const selected = state.findAnnotation(block, state.store.selectedAnnotationId);
    const placementActive = placementState && placementState.blockId === block.id && placementState.type === type;
    const selectionActive = !placementState && selected && selected.type === type;
    const active = placementActive || selectionActive;

    return [
      '<button type="button" class="secondary annotation-tool-button' + (active ? " active" : "") + '" data-action="add-annotation" data-type="' + utils.escapeAttribute(type) + '" data-block-id="' + utils.escapeAttribute(block.id) + '">',
      utils.escapeHtml(label),
      '</button>'
    ].join("");
  }

  function annotationColorButtons(block) {
    const selected = state.findAnnotation(block, state.store.selectedAnnotationId);
    const currentColor = selected
      ? selected.color || annotationColor
      : annotationColor;

    return [
      '<div class="annotation-color-picker" role="group" aria-label="注釈色">'
    ].concat(ANNOTATION_COLORS.map(function (color) {
      const active = currentColor.toLowerCase() === color.value.toLowerCase();
      return [
        '<button type="button" class="annotation-color-button' + (active ? " active" : "") + '" data-action="set-annotation-color" data-color="' + utils.escapeAttribute(color.value) + '" data-block-id="' + utils.escapeAttribute(block.id) + '" aria-label="注釈色 ' + utils.escapeAttribute(color.name) + '" title="' + utils.escapeAttribute(color.name) + '">',
        '<span style="background:' + utils.escapeAttribute(color.value) + ';"></span>',
        '</button>'
      ].join("");
    })).concat([
      '</div>'
    ]).join("");
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

    const editable = mode === "editor" && modalBlockId === block.id;
    const placing = editable && placementState && placementState.blockId === block.id;
    const classes = "annotated-image annotation-canvas" + (editable ? " annotation-editor" : "") + (placing ? " placing" : "");

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

    const editable = mode === "editor" && modalBlockId === block.id;
    const selected = editable && state.store.selectedAnnotationId === annotation.id;

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
    const color = annotation.color || "#ef4444";
    const geometry = arrowGeometry(annotation);
    const lineEnd = arrowLineEnd(geometry);
    const headPoints = arrowHeadPoints(geometry);

    const handles = editable && selected
      ? [
          '<span class="arrow-point arrow-start" data-arrow-point="start" style="left:' + geometry.x1.toFixed(3) + '%;top:' + geometry.y1.toFixed(3) + '%;"></span>',
          '<span class="arrow-point arrow-end" data-arrow-point="end" style="left:' + geometry.x2.toFixed(3) + '%;top:' + geometry.y2.toFixed(3) + '%;"></span>'
        ].join("")
      : "";

    return [
      '<div class="' + className + '"' + data + ' style="left:' + geometry.left.toFixed(3) + '%;top:' + geometry.top.toFixed(3) + '%;width:' + geometry.width.toFixed(3) + '%;height:' + geometry.height.toFixed(3) + '%;color:' + utils.escapeAttribute(color) + ';" aria-label="矢印注釈">',
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
      '<line x1="' + geometry.x1.toFixed(3) + '" y1="' + geometry.y1.toFixed(3) + '" x2="' + lineEnd.x.toFixed(3) + '" y2="' + lineEnd.y.toFixed(3) + '" stroke="' + utils.escapeAttribute(color) + '"></line>',
      '<polygon points="' + headPoints + '" fill="' + utils.escapeAttribute(color) + '"></polygon>',
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

    if (isRoundAnnotation(annotation)) {
      const size = utils.clamp(width, 4, maxW);
      width = size;
      height = size;
      annotation.w = size;
      annotation.h = size;

      return [
        "left:" + x.toFixed(3) + "%;",
        "top:" + y.toFixed(3) + "%;",
        "width:" + width.toFixed(3) + "%;",
        "color:" + utils.escapeAttribute(annotation.color || "#ef4444") + ";"
      ].join("");
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
        if (placementState.type === "arrow") {
          return handleArrowPlacementStart(event, canvasForPlacement, placementBlockId);
        }

        if (placementState.type === "marker") {
          return handleMarkerPlacementStart(event, canvasForPlacement, placementBlockId);
        }

        return handlePlacementClick(event, canvasForPlacement, placementBlockId);
      }
    }

    if (placementState && !event.target.closest(".annotation-modal-toolbar")) {
      cancelPlacement();
      return false;
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

    if (dragState.mode === "marker-create") {
      const markerDx = ((event.clientX - dragState.startX) / dragState.rect.width) * 100;
      const marker = dragState.annotation;

      if (markerDx >= 0) {
        marker.x = dragState.original.x;
        marker.w = utils.clamp(markerDx, 1, 100 - marker.x);
      } else {
        marker.x = utils.clamp(dragState.original.x + markerDx, 0, 100);
        marker.w = utils.clamp(Math.abs(markerDx), 1, 100 - marker.x);
      }

      state.markDirty();
      if (dragState.element) {
        dragState.element.setAttribute("style", positionStyle(marker));
      } else {
        ns.render.updateDirtyIndicator();
      }

      return true;
    }

    if (dragState.mode === "arrow-create") {
      const point = getRectPercent(event, dragState.rect);
      const arrow = dragState.annotation;

      arrow.x2 = point.x;
      arrow.y2 = point.y;

      state.markDirty();
      if (dragState.element) updateArrowElement(dragState.element, arrow);
      ns.render.updateDirtyIndicator();

      return true;
    }

    const dx = ((event.clientX - dragState.startX) / dragState.rect.width) * 100;
    const dy = ((event.clientY - dragState.startY) / dragState.rect.height) * 100;
    const annotation = dragState.annotation;

    if (annotation.type === "arrow") {
      updateArrowDrag(annotation, dx, dy);
      updateArrowElement(dragState.element, annotation);
    } else if (dragState.mode === "resize") {
      if (isRoundAnnotation(annotation)) {
        const delta = Math.max(dx, dy);
        const maxSize = maxRoundSizePercent(dragState.original.x, dragState.original.y, dragState.rect);

        const size = utils.clamp(dragState.original.w + delta, 4, maxSize);

        annotation.w = size;
        annotation.h = size;
      } else if (annotation.type === "marker") {
        annotation.w = utils.clamp(dragState.original.w + dx, 1, 100 - dragState.original.x);
        annotation.h = dragState.original.h || 4;
      } else {
        annotation.w = utils.clamp(dragState.original.w + dx, 4, 100 - dragState.original.x);
        annotation.h = utils.clamp(dragState.original.h + dy, 4, 100 - dragState.original.y);
      }

      dragState.element.setAttribute("style", positionStyle(annotation));
    } else {
      if (isRoundAnnotation(annotation)) {
        annotation.x = utils.clamp(dragState.original.x + dx, 0, 100 - annotation.w);
        annotation.y = utils.clamp(
          dragState.original.y + dy,
          0,
          100 - roundHeightPercent(annotation, dragState.rect)
        );
      } else {
        annotation.x = utils.clamp(dragState.original.x + dx, 0, 100 - dragState.original.w);
        annotation.y = utils.clamp(dragState.original.y + dy, 0, 100 - dragState.original.h);
      }

      dragState.element.setAttribute("style", positionStyle(annotation));
    }

    state.markDirty();
    ns.render.updateDirtyIndicator();

    return true;
  }

  function handlePointerUp(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return false;

    event.preventDefault();

    if (dragState.mode === "marker-create") {
      const blockId = dragState.blockId;

      if (dragState.element) {
        try {
          dragState.element.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture can already be released by the browser.
        }
      }

      dragState = null;
      placementState = createPlacementState("marker", blockId);
      refreshAnnotationViews();
      return true;
    }

    if (dragState.mode === "arrow-create") {
      const blockId = dragState.blockId;

      if (dragState.element) {
        try {
          dragState.element.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture can already be released by the browser.
        }
      }

      const arrow = dragState.annotation;
      const tooShort = Math.abs(arrow.x2 - arrow.x1) < 0.6 && Math.abs(arrow.y2 - arrow.y1) < 0.6;

      if (tooShort) {
        const found = state.findBlockById(dragState.blockId);
        if (found) {
          found.block.annotations = found.block.annotations.filter(function (annotation) {
            return annotation.id !== arrow.id;
          });
          state.store.selectedAnnotationId = null;
        }
      }

      dragState = null;
      placementState = createPlacementState("arrow", blockId);
      refreshAnnotationViews();
      return true;
    }

    if (dragState.element) {
      try {
        dragState.element.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture can already be released by the browser.
      }
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

    if (placementState.type === "circle" || placementState.type === "number") {
      const size = placementState.type === "number" ? 6 : 10;
      const annotation = state.createAnnotation(placementState.type, nextNumberLabel(found.block));
      const rect = canvas.getBoundingClientRect();
      const heightPercent = size * (rect.width / rect.height);

      annotation.x = utils.clamp(point.x - size / 2, 0, 100 - size);
      annotation.y = utils.clamp(point.y - heightPercent / 2, 0, 100 - heightPercent);
      annotation.w = size;
      annotation.h = size;
      annotation.color = annotationColor;

      found.block.annotations.push(annotation);
      state.store.selectedAnnotationId = annotation.id;

      placementState = createPlacementState(placementState.type, blockId);
      state.markDirty();
      refreshAnnotationViews();

      return true;
    }

    return false;
  }

  function handleArrowPlacementStart(event, canvas, blockId) {
    event.preventDefault();
    event.stopPropagation();

    const found = state.findBlockById(blockId);
    if (!found) return false;

    const point = getCanvasPercent(event, canvas);
    const annotation = state.createAnnotation("arrow", nextNumberLabel(found.block));

    annotation.x1 = point.x;
    annotation.y1 = point.y;
    annotation.x2 = point.x;
    annotation.y2 = point.y;
    annotation.color = annotationColor;

    found.block.annotations.push(annotation);
    state.store.selectedAnnotationId = annotation.id;

    dragState = {
      mode: "arrow-create",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: canvas.getBoundingClientRect(),
      canvas: canvas,
      annotation: annotation,
      element: null,
      blockId: blockId,
      original: {
        x1: annotation.x1,
        y1: annotation.y1,
        x2: annotation.x2,
        y2: annotation.y2
      }
    };

    placementState = null;
    state.markDirty();
    refreshAnnotationViews();
    dragState.element = document.querySelector('[data-annotation-id="' + utils.escapeAttribute(annotation.id) + '"]');

    try {
      (dragState.element || canvas).setPointerCapture(event.pointerId);
    } catch (error) {
      // Document-level pointer handlers still keep the drag usable.
    }

    return true;
  }

  function handleMarkerPlacementStart(event, canvas, blockId) {
    event.preventDefault();
    event.stopPropagation();

    const found = state.findBlockById(blockId);
    if (!found) return false;

    const point = getCanvasPercent(event, canvas);
    const annotation = state.createAnnotation("marker", nextNumberLabel(found.block));

    annotation.x = point.x;
    annotation.y = utils.clamp(point.y - 2, 0, 96);
    annotation.w = 1;
    annotation.h = 4;
    annotation.color = annotationColor;

    found.block.annotations.push(annotation);
    state.store.selectedAnnotationId = annotation.id;

    dragState = {
      mode: "marker-create",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: canvas.getBoundingClientRect(),
      annotation: annotation,
      element: null,
      blockId: blockId,
      original: {
        x: annotation.x,
        y: annotation.y,
        w: annotation.w,
        h: annotation.h
      }
    };

    placementState = null;
    state.markDirty();
    refreshAnnotationViews();
    dragState.element = document.querySelector('[data-annotation-id="' + utils.escapeAttribute(annotation.id) + '"]');

    try {
      (dragState.element || canvas).setPointerCapture(event.pointerId);
    } catch (error) {
      // Document-level pointer handlers still keep the drag usable.
    }

    return true;
  }

  function getCanvasPercent(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return getRectPercent(event, rect);
  }

  function getRectPercent(event, rect) {
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
    const geometry = arrowGeometry(annotation);
    const lineEnd = arrowLineEnd(geometry);
    const line = element.querySelector("line");
    const head = element.querySelector("polygon");

    element.style.left = geometry.left.toFixed(3) + "%";
    element.style.top = geometry.top.toFixed(3) + "%";
    element.style.width = geometry.width.toFixed(3) + "%";
    element.style.height = geometry.height.toFixed(3) + "%";

    if (line) {
      line.setAttribute("x1", geometry.x1.toFixed(3));
      line.setAttribute("y1", geometry.y1.toFixed(3));
      line.setAttribute("x2", lineEnd.x.toFixed(3));
      line.setAttribute("y2", lineEnd.y.toFixed(3));
    }

    const start = element.querySelector(".arrow-start");
    const end = element.querySelector(".arrow-end");

    if (head) {
      head.setAttribute("points", arrowHeadPoints(geometry));
    }

    if (start) {
      start.style.left = geometry.x1.toFixed(3) + "%";
      start.style.top = geometry.y1.toFixed(3) + "%";
    }

    if (end) {
      end.style.left = geometry.x2.toFixed(3) + "%";
      end.style.top = geometry.y2.toFixed(3) + "%";
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
        const geometry = arrowGeometry(annotation);
        const start = document.createElement("span");
        start.className = "arrow-point arrow-start";
        start.dataset.arrowPoint = "start";
        start.style.left = geometry.x1.toFixed(3) + "%";
        start.style.top = geometry.y1.toFixed(3) + "%";

        const end = document.createElement("span");
        end.className = "arrow-point arrow-end";
        end.dataset.arrowPoint = "end";
        end.style.left = geometry.x2.toFixed(3) + "%";
        end.style.top = geometry.y2.toFixed(3) + "%";

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

    if (isRoundAnnotation(annotation)) {
      const size = Math.min(
        Number(annotation.w) || 10,
        Number(annotation.h) || 10
      );

      annotation.w = utils.clamp(size, 4, 100);
      annotation.h = annotation.w;
    }

    if (annotation.type === "arrow") {
      if (typeof annotation.x1 !== "number") annotation.x1 = 20;
      if (typeof annotation.y1 !== "number") annotation.y1 = 50;
      if (typeof annotation.x2 !== "number") annotation.x2 = 45;
      if (typeof annotation.y2 !== "number") annotation.y2 = 50;

      annotation.x1 = utils.clamp(annotation.x1, 0, 100);
      annotation.y1 = utils.clamp(annotation.y1, 0, 100);
      annotation.x2 = utils.clamp(annotation.x2, 0, 100);
      annotation.y2 = utils.clamp(annotation.y2, 0, 100);
    }
  }

  function safePercent(value) {
    return utils.clamp(Number(value) || 0, 0, 100).toFixed(3);
  }

  function isRoundAnnotation(annotation) {
    return annotation && (annotation.type === "circle" || annotation.type === "number");
  }

  function roundHeightPercent(annotation, rect) {
    const size = Number(annotation.w) || 0;
    if (!rect || !rect.height) return size;
    return size * (rect.width / rect.height);
  }

  function maxRoundSizePercent(x, y, rect) {
    const maxW = Math.max(4, 100 - x);
    if (!rect || !rect.width) return maxW;
    const maxByHeight = Math.max(4, ((100 - y) / 100) * rect.height / rect.width * 100);
    return Math.min(maxW, maxByHeight);
  }

  function createPlacementState(type, blockId) {
    return {
      type: type,
      blockId: blockId,
      arrowStart: null,
      markerStart: null
    };
  }

  function cancelPlacement() {
    if (!placementState) return false;
    placementState = null;
    if (modalBlockId) {
      renderAnnotationModal();
    } else {
      ns.render.renderEditor();
    }
    return true;
  }

  function handleEscape() {
    if (cancelPlacement()) return true;
    return Boolean(modalBlockId);
  }

  function normalizeAnnotationColor(color) {
    const value = String(color || "").toLowerCase();
    const found = ANNOTATION_COLORS.find(function (item) {
      return item.value.toLowerCase() === value;
    });
    return found ? found.value : ANNOTATION_COLORS[1].value;
  }

  function arrowGeometry(annotation) {
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

  function arrowVector(geometry) {
    const dx = geometry.x2 - geometry.x1;
    const dy = geometry.y2 - geometry.y1;
    const length = Math.max(Math.hypot(dx, dy), 0.001);

    return {
      x: dx / length,
      y: dy / length
    };
  }

  function arrowHeadSize(geometry) {
    return {
      length: utils.clamp((1.8 / geometry.width) * 100, 5, 22),
      half: utils.clamp((1.2 / geometry.height) * 100, 7, 18)
    };
  }

  function arrowLineEnd(geometry) {
    const vector = arrowVector(geometry);
    const size = arrowHeadSize(geometry);

    return {
      x: geometry.x2 - vector.x * size.length * 0.72,
      y: geometry.y2 - vector.y * size.length * 0.72
    };
  }

  function arrowHeadPoints(geometry) {
    const vector = arrowVector(geometry);
    const size = arrowHeadSize(geometry);
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

  ns.annotations = {
    addAnnotation: addAnnotation,
    deleteSelectedAnnotation: deleteSelectedAnnotation,
    openAnnotationModal: openAnnotationModal,
    closeAnnotationModal: closeAnnotationModal,
    setAnnotationColor: setAnnotationColor,
    cancelPlacement: cancelPlacement,
    handleEscape: handleEscape,
    imageMarkup: imageMarkup,
    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp: handlePointerUp,
    positionStyle: positionStyle
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
