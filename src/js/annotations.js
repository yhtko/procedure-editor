(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  let dragState = null;
  let modalBlockId = null;
  let placementState = null;
  let annotationColor = "#ef4444";
  let annotationMode = "add"; // "add" | "edit"

  const ANNOTATION_COLORS = [
    { name: "Blue",   value: "#2563eb" },
    { name: "Red",    value: "#ef4444" },
    { name: "Yellow", value: "#facc15" },
    { name: "Green",  value: "#16a34a" }
  ];

  function nextNumberLabel(block) {
    const numbers = (block.annotations || [])
      .filter(function (a) { return a.type === "number"; })
      .map(function (a) { return parseInt(a.label, 10); })
      .filter(function (v) { return !Number.isNaN(v); });
    return numbers.length ? Math.max.apply(null, numbers) + 1 : 1;
  }

  function addAnnotation(type, blockId) {
    const found = state.findBlockById(blockId || state.store.currentBlockId);
    if (!found || !found.block.image) { utils.toast("注釈を追加する画像がありません。"); return; }

    state.store.currentStepId  = found.step.id;
    state.store.currentBlockId = found.block.id;
    annotationMode = "add";

    if (type === "circle" || type === "number" || type === "arrow" || type === "marker") {
      placementState = { type: type, blockId: found.block.id, arrowStart: null, markerStart: null };
      const hints = { circle: "画像上をクリックして○を配置してください。", number: "画像上をクリックして番号を配置してください。", arrow: "矢印の始点から終点までドラッグしてください。", marker: "マーカーの開始位置から横にドラッグしてください。" };
      utils.toast(hints[type] || "");
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

  function setAnnotationMode(mode) {
    if (mode !== "add" && mode !== "edit") return;
    annotationMode = mode;
    if (mode === "edit") cancelPlacement();
    else if (modalBlockId) renderAnnotationModal();
  }

  function deleteSelectedAnnotation() {
    const found = state.findBlockById(state.store.currentBlockId);
    if (!found || !state.store.selectedAnnotationId) { utils.toast("削除する注釈を選択してください。"); return; }
    const before = found.block.annotations.length;
    found.block.annotations = found.block.annotations.filter(function (a) { return a.id !== state.store.selectedAnnotationId; });
    if (found.block.annotations.length === before) return;
    state.store.selectedAnnotationId = null;
    placementState = null;
    state.markDirty();
    refreshAnnotationViews();
  }

  function handleDeleteKey() {
    if (!modalBlockId || !state.store.selectedAnnotationId) return false;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return false;
    deleteSelectedAnnotation();
    return true;
  }

  function resizeSelectedAnnotation(blockId, value) {
    const found = state.findBlockById(blockId || state.store.currentBlockId);
    if (!found || !state.store.selectedAnnotationId) return;
    const annotation = state.findAnnotation(found.block, state.store.selectedAnnotationId);
    if (!annotation || annotation.type === "arrow" || annotation.type === "number") return;
    if (annotation.type === "circle") { annotation.w = value; annotation.h = value; }
    else if (annotation.type === "marker") { annotation.h = value; }
    state.markDirty();
    const el = document.querySelector('.annotation-canvas [data-annotation-id="' + annotation.id + '"]');
    if (el) el.setAttribute("style", positionStyle(annotation));
    ns.render.renderPreview();
    ns.render.updateDirtyIndicator();
  }

  function setAnnotationColor(color, blockId) {
    const nextColor = normalizeAnnotationColor(color);
    const found = state.findBlockById(blockId || state.store.currentBlockId);
    annotationColor = nextColor;
    if (found && state.store.selectedAnnotationId) {
      const annotation = state.findAnnotation(found.block, state.store.selectedAnnotationId);
      if (annotation) { annotation.color = nextColor; state.markDirty(); refreshAnnotationViews(); return; }
    }
    if (modalBlockId) renderAnnotationModal();
  }

  function openAnnotationModal(blockId) {
    const found = state.findBlockById(blockId);
    if (!found || !found.block.image) { utils.toast("注釈を編集する画像がありません。"); return; }
    modalBlockId = found.block.id;
    state.store.currentStepId  = found.step.id;
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
    if (modal) { modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
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
    if (!modal || !found || !found.block.image) { closeAnnotationModal(); return; }

    const block = found.block;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");

    const isAdd = annotationMode === "add";
    const sizeCtrl = !isAdd ? annotationSizeControl(block) : "";

    modal.innerHTML = [
      '<div class="annotation-modal-backdrop" data-action="close-annotation-modal"></div>',
      '<section class="annotation-modal-panel" role="dialog" aria-modal="true" aria-label="注釈編集">',
      '<header class="annotation-modal-head">',
      '<div><h2>注釈編集</h2><p>' + utils.escapeHtml(block.imageName || "スクリーンショット") + '</p></div>',
      '<button type="button" class="secondary" data-action="close-annotation-modal">閉じる</button>',
      '</header>',

      '<div class="annotation-modal-toolbar">',
      // Mode toggle
      '<div class="anno-mode-toggle">',
      '<button type="button" class="anno-mode-btn' + (isAdd ? " active" : "") + '" data-action="set-annotation-mode" data-mode="add">＋ 追加</button>',
      '<button type="button" class="anno-mode-btn' + (!isAdd ? " active" : "") + '" data-action="set-annotation-mode" data-mode="edit">✐ 編集</button>',
      '</div>',
      '<div class="anno-toolbar-sep"></div>',
      // Tool buttons (add mode only)
      isAdd ? [
        annotationToolButton(block, "circle",  "○ 丸"),
        annotationToolButton(block, "arrow",   "→ 矢印"),
        annotationToolButton(block, "number",  "① 番号"),
        annotationToolButton(block, "marker",  "━ マーカー"),
        '<div class="anno-toolbar-sep"></div>'
      ].join("") : "",
      // Color picker
      annotationColorButtons(block),
      // Size control (edit mode + resizable annotation selected)
      sizeCtrl ? '<div class="anno-toolbar-sep"></div>' + sizeCtrl : "",
      '<div class="anno-toolbar-sep"></div>',
      '<button type="button" class="danger" data-action="delete-annotation" data-block-id="' + utils.escapeAttribute(block.id) + '">削除 <kbd>Del</kbd></button>',
      '</div>',

      '<div class="annotation-modal-stage">',
      imageMarkup(block, "editor"),
      '</div>',
      '</section>'
    ].join("");

    scheduleFixArrowheads();
  }

  function annotationSizeControl(block) {
    const selected = state.findAnnotation(block, state.store.selectedAnnotationId);
    if (!selected || selected.type === "arrow" || selected.type === "number") return "";
    const isMarker = selected.type === "marker";
    const value = isMarker ? (Number(selected.h) || 4) : (Number(selected.w) || 10);
    const max   = isMarker ? "20" : "30";
    const label = isMarker ? "高さ" : "サイズ";
    return [
      '<label class="anno-size-control">',
      '<span>' + label + '</span>',
      '<input type="range" min="2" max="' + max + '" value="' + value + '"',
      ' data-annotation-resize data-block-id="' + utils.escapeAttribute(block.id) + '">',
      '</label>'
    ].join("");
  }

  function annotationToolButton(block, type, label) {
    const selected = state.findAnnotation(block, state.store.selectedAnnotationId);
    const placementActive = placementState && placementState.blockId === block.id && placementState.type === type;
    const selectionActive = !placementState && selected && selected.type === type;
    const active = placementActive || selectionActive;
    return [
      '<button type="button" class="annotation-tool-button' + (active ? " active" : "") + '"',
      ' data-action="add-annotation" data-type="' + utils.escapeAttribute(type) + '"',
      ' data-block-id="' + utils.escapeAttribute(block.id) + '">',
      utils.escapeHtml(label),
      '</button>'
    ].join("");
  }

  function annotationColorButtons(block) {
    const selected = state.findAnnotation(block, state.store.selectedAnnotationId);
    const currentColor = selected ? (selected.color || annotationColor) : annotationColor;
    return [
      '<div class="annotation-color-picker" role="group" aria-label="注釈色">'
    ].concat(ANNOTATION_COLORS.map(function (c) {
      const active = currentColor.toLowerCase() === c.value.toLowerCase();
      return [
        '<button type="button" class="annotation-color-button' + (active ? " active" : "") + '"',
        ' data-action="set-annotation-color" data-color="' + utils.escapeAttribute(c.value) + '"',
        ' data-block-id="' + utils.escapeAttribute(block.id) + '"',
        ' aria-label="' + utils.escapeAttribute(c.name) + '" title="' + utils.escapeAttribute(c.name) + '">',
        '<span style="background:' + utils.escapeAttribute(c.value) + ';"></span>',
        '</button>'
      ].join("");
    })).concat(['</div>']).join("");
  }

  // --- Arrow pixel-space fixup ---

  function fixArrowheads(canvas) {
    utils.$$(".annotation-arrow", canvas).forEach(function (el) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const blockId      = canvas.dataset.blockId;
      const annotationId = el.dataset.annotationId;
      if (!blockId || !annotationId) return;
      const found = state.findBlockById(blockId);
      if (!found) return;
      const annotation = state.findAnnotation(found.block, annotationId);
      if (!annotation) return;

      const geometry = arrowGeometry(annotation);

      // Convert SVG bbox-% coords to actual pixels
      const x1px = geometry.x1 * rect.width  / 100;
      const y1px = geometry.y1 * rect.height / 100;
      const x2px = geometry.x2 * rect.width  / 100;
      const y2px = geometry.y2 * rect.height / 100;

      const dx  = x2px - x1px;
      const dy  = y2px - y1px;
      const len = Math.hypot(dx, dy);
      if (len < 2) return;

      const ux = dx / len;
      const uy = dy / len;
      const px = -uy; // perpendicular
      const py =  ux;

      const HEAD_LEN  = 14;
      const HEAD_HALF =  7;

      const basePxX = x2px - ux * HEAD_LEN;
      const basePxY = y2px - uy * HEAD_LEN;

      const w1x = (basePxX + px * HEAD_HALF) / rect.width  * 100;
      const w1y = (basePxY + py * HEAD_HALF) / rect.height * 100;
      const w2x = (basePxX - px * HEAD_HALF) / rect.width  * 100;
      const w2y = (basePxY - py * HEAD_HALF) / rect.height * 100;

      const polygon = el.querySelector("polygon");
      if (polygon) {
        polygon.setAttribute("points",
          geometry.x2.toFixed(2) + "," + geometry.y2.toFixed(2) + " " +
          w1x.toFixed(2) + "," + w1y.toFixed(2) + " " +
          w2x.toFixed(2) + "," + w2y.toFixed(2)
        );
      }

      // Shorten line so it doesn't poke through the head
      const lineEndX = (x2px - ux * HEAD_LEN * 0.55) / rect.width  * 100;
      const lineEndY = (y2px - uy * HEAD_LEN * 0.55) / rect.height * 100;
      const line = el.querySelector("line");
      if (line) {
        line.setAttribute("x2", lineEndX.toFixed(2));
        line.setAttribute("y2", lineEndY.toFixed(2));
      }
    });
  }

  function scheduleFixArrowheads() {
    requestAnimationFrame(function () {
      const modal  = utils.$("annotationModal");
      const canvas = modal && modal.querySelector(".annotation-canvas");
      if (canvas) fixArrowheads(canvas);
    });
  }

  // ---

  function refreshAnnotationViews() {
    if (modalBlockId) renderAnnotationModal();
    else ns.render.renderEditor();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  function imageMarkup(block, mode) {
    if (!block || !block.image) return "";
    const editable = mode === "editor" && modalBlockId === block.id;
    const placing  = editable && placementState && placementState.blockId === block.id;
    const classes  = [
      "annotated-image annotation-canvas",
      editable ? "annotation-editor" : "",
      placing  ? "placing" : ""
    ].filter(Boolean).join(" ");

    const annotations = (block.annotations || []).map(function (a) {
      return annotationMarkup(block, a, mode);
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
    const className = ["annotation", "annotation-" + annotation.type, editable ? "editable" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
    const data = editable
      ? ' data-annotation-id="' + utils.escapeAttribute(annotation.id) + '" data-block-id="' + utils.escapeAttribute(block.id) + '"'
      : "";

    if (annotation.type === "arrow") return arrowMarkup(annotation, className, data, editable, selected);

    const style  = positionStyle(annotation);
    const handle = editable && selected ? '<span class="resize-handle" data-resize-handle="true"></span>' : "";

    if (annotation.type === "number") {
      return '<div class="' + className + '"' + data + ' style="' + style + '" aria-label="番号注釈"><span>' + utils.escapeHtml(annotation.label || "1") + '</span>' + handle + '</div>';
    }
    return '<div class="' + className + '"' + data + ' style="' + style + '" aria-label="' + (annotation.type === "marker" ? "マーカー注釈" : "丸注釈") + '">' + handle + '</div>';
  }

  function arrowMarkup(annotation, className, data, editable, selected) {
    const color    = annotation.color || "#ef4444";
    const geometry = arrowGeometry(annotation);
    const lineEnd  = arrowLineEnd(geometry);
    const headPts  = arrowHeadPoints(geometry);

    const handles = editable && selected ? [
      '<span class="arrow-point arrow-start" data-arrow-point="start" style="left:' + geometry.x1.toFixed(3) + '%;top:' + geometry.y1.toFixed(3) + '%;"></span>',
      '<span class="arrow-point arrow-end"   data-arrow-point="end"   style="left:' + geometry.x2.toFixed(3) + '%;top:' + geometry.y2.toFixed(3) + '%;"></span>'
    ].join("") : "";

    return [
      '<div class="' + className + '"' + data,
      ' style="left:' + geometry.left.toFixed(3) + '%;top:' + geometry.top.toFixed(3) + '%;width:' + geometry.width.toFixed(3) + '%;height:' + geometry.height.toFixed(3) + '%;color:' + utils.escapeAttribute(color) + ';" aria-label="矢印注釈">',
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
      '<line x1="' + geometry.x1.toFixed(3) + '" y1="' + geometry.y1.toFixed(3) + '" x2="' + lineEnd.x.toFixed(3) + '" y2="' + lineEnd.y.toFixed(3) + '" stroke="' + utils.escapeAttribute(color) + '"></line>',
      '<polygon points="' + headPts + '" fill="' + utils.escapeAttribute(color) + '"></polygon>',
      '</svg>',
      handles,
      '</div>'
    ].join("");
  }

  function positionStyle(annotation) {
    const x    = utils.clamp(annotation.x, 0, 99);
    const y    = utils.clamp(annotation.y, 0, 99);
    const maxW = Math.max(1, 100 - x);
    const maxH = Math.max(1, 100 - y);
    let width  = utils.clamp(annotation.w, 4, maxW);
    let height = utils.clamp(annotation.h, 4, maxH);

    if (isRoundAnnotation(annotation)) {
      const size = utils.clamp(width, 4, maxW);
      annotation.w = size; annotation.h = size;
      return "left:" + x.toFixed(3) + "%;top:" + y.toFixed(3) + "%;width:" + size.toFixed(3) + "%;color:" + utils.escapeAttribute(annotation.color || "#ef4444") + ";";
    }

    return "left:" + x.toFixed(3) + "%;top:" + y.toFixed(3) + "%;width:" + width.toFixed(3) + "%;height:" + height.toFixed(3) + "%;color:" + utils.escapeAttribute(annotation.color || "#ef4444") + ";";
  }

  function handlePointerDown(event) {
    const canvasForPlacement = event.target.closest(".annotation-canvas");

    if (placementState && canvasForPlacement) {
      const placementBlockId = canvasForPlacement.dataset.blockId;
      if (placementBlockId === placementState.blockId) {
        if (placementState.type === "arrow")  return handleArrowPlacementStart(event, canvasForPlacement, placementBlockId);
        if (placementState.type === "marker") return handleMarkerPlacementStart(event, canvasForPlacement, placementBlockId);
        return handlePlacementClick(event, canvasForPlacement, placementBlockId);
      }
    }

    if (placementState && !event.target.closest(".annotation-modal-toolbar")) {
      cancelPlacement();
      return false;
    }

    const annotationEl = event.target.closest(".annotation.editable");
    if (!annotationEl) return false;

    const canvas       = annotationEl.closest(".annotation-canvas");
    const blockId      = canvas && canvas.dataset.blockId;
    const annotationId = annotationEl.dataset.annotationId;
    const found        = state.findBlockById(blockId);
    if (!found) return false;

    const annotation = state.findAnnotation(found.block, annotationId);
    if (!annotation) return false;

    normalizeAnnotation(annotation);
    event.preventDefault();
    event.stopPropagation();

    state.store.currentStepId         = found.step.id;
    state.store.currentBlockId        = found.block.id;
    state.store.selectedAnnotationId  = annotation.id;
    placementState = null;

    updateSelectedClass(canvas, annotation.id);

    const rect       = canvas.getBoundingClientRect();
    const arrowPoint = event.target.closest("[data-arrow-point]");
    let   mode       = "move";
    if (arrowPoint) mode = arrowPoint.dataset.arrowPoint === "start" ? "arrow-start" : "arrow-end";
    else if (event.target.closest("[data-resize-handle]")) mode = "resize";

    dragState = {
      mode: mode, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      rect: rect, annotation: annotation, element: annotationEl,
      original: { x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h, x1: annotation.x1, y1: annotation.y1, x2: annotation.x2, y2: annotation.y2 }
    };

    annotationEl.setPointerCapture(event.pointerId);
    return true;
  }

  function handlePointerMove(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return false;
    event.preventDefault();

    if (dragState.mode === "marker-create") {
      const markerDx = ((event.clientX - dragState.startX) / dragState.rect.width) * 100;
      const marker   = dragState.annotation;
      if (markerDx >= 0) {
        marker.x = dragState.original.x;
        marker.w = utils.clamp(markerDx, 1, 100 - marker.x);
      } else {
        marker.x = utils.clamp(dragState.original.x + markerDx, 0, 100);
        marker.w = utils.clamp(Math.abs(markerDx), 1, 100 - marker.x);
      }
      state.markDirty();
      if (dragState.element) dragState.element.setAttribute("style", positionStyle(marker));
      else ns.render.updateDirtyIndicator();
      return true;
    }

    if (dragState.mode === "arrow-create") {
      const point = getRectPercent(event, dragState.rect);
      const arrow = dragState.annotation;
      arrow.x2 = point.x; arrow.y2 = point.y;
      state.markDirty();
      if (dragState.element) updateArrowElement(dragState.element, arrow);
      ns.render.updateDirtyIndicator();
      return true;
    }

    const dx = ((event.clientX - dragState.startX) / dragState.rect.width)  * 100;
    const dy = ((event.clientY - dragState.startY) / dragState.rect.height) * 100;
    const annotation = dragState.annotation;

    if (annotation.type === "arrow") {
      updateArrowDrag(annotation, dx, dy);
      updateArrowElement(dragState.element, annotation);
    } else if (dragState.mode === "resize") {
      if (isRoundAnnotation(annotation)) {
        const delta   = Math.max(dx, dy);
        const maxSize = maxRoundSizePercent(dragState.original.x, dragState.original.y, dragState.rect);
        const size    = utils.clamp(dragState.original.w + delta, 4, maxSize);
        annotation.w  = size; annotation.h = size;
      } else if (annotation.type === "marker") {
        annotation.w = utils.clamp(dragState.original.w + dx, 1, 100 - dragState.original.x);
        annotation.h = dragState.original.h || 4; // width-only via handle; height via slider
      } else {
        annotation.w = utils.clamp(dragState.original.w + dx, 4, 100 - dragState.original.x);
        annotation.h = utils.clamp(dragState.original.h + dy, 4, 100 - dragState.original.y);
      }
      dragState.element.setAttribute("style", positionStyle(annotation));
    } else {
      if (isRoundAnnotation(annotation)) {
        annotation.x = utils.clamp(dragState.original.x + dx, 0, 100 - annotation.w);
        annotation.y = utils.clamp(dragState.original.y + dy, 0, 100 - roundHeightPercent(annotation, dragState.rect));
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

    const releaseCapture = function (el) {
      if (!el) return;
      try { el.releasePointerCapture(event.pointerId); } catch (e) { /* already released */ }
    };

    if (dragState.mode === "marker-create") {
      const blockId = dragState.blockId;
      releaseCapture(dragState.element);
      dragState = null;
      placementState = createPlacementState("marker", blockId);
      refreshAnnotationViews();
      return true;
    }

    if (dragState.mode === "arrow-create") {
      const blockId = dragState.blockId;
      releaseCapture(dragState.element);
      const arrow    = dragState.annotation;
      const tooShort = Math.abs(arrow.x2 - arrow.x1) < 0.6 && Math.abs(arrow.y2 - arrow.y1) < 0.6;
      if (tooShort) {
        const found = state.findBlockById(dragState.blockId);
        if (found) {
          found.block.annotations = found.block.annotations.filter(function (a) { return a.id !== arrow.id; });
          state.store.selectedAnnotationId = null;
        }
      }
      dragState = null;
      placementState = createPlacementState("arrow", blockId);
      refreshAnnotationViews();
      return true;
    }

    releaseCapture(dragState.element);
    dragState = null;
    refreshAnnotationViews();
    return true;
  }

  function handlePlacementClick(event, canvas, blockId) {
    event.preventDefault(); event.stopPropagation();
    const found = state.findBlockById(blockId);
    if (!found) return false;
    const point = getCanvasPercent(event, canvas);
    if (placementState.type === "circle" || placementState.type === "number") {
      const size        = placementState.type === "number" ? 6 : 10;
      const annotation  = state.createAnnotation(placementState.type, nextNumberLabel(found.block));
      const rect        = canvas.getBoundingClientRect();
      const heightPct   = size * (rect.width / rect.height);
      annotation.x      = utils.clamp(point.x - size / 2, 0, 100 - size);
      annotation.y      = utils.clamp(point.y - heightPct / 2, 0, 100 - heightPct);
      annotation.w      = size; annotation.h = size;
      annotation.color  = annotationColor;
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
    event.preventDefault(); event.stopPropagation();
    const found = state.findBlockById(blockId);
    if (!found) return false;
    const point      = getCanvasPercent(event, canvas);
    const annotation = state.createAnnotation("arrow", nextNumberLabel(found.block));
    annotation.x1 = point.x; annotation.y1 = point.y;
    annotation.x2 = point.x; annotation.y2 = point.y;
    annotation.color = annotationColor;
    found.block.annotations.push(annotation);
    state.store.selectedAnnotationId = annotation.id;
    dragState = {
      mode: "arrow-create", pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      rect: canvas.getBoundingClientRect(), canvas: canvas,
      annotation: annotation, element: null, blockId: blockId,
      original: { x1: annotation.x1, y1: annotation.y1, x2: annotation.x2, y2: annotation.y2 }
    };
    placementState = null;
    state.markDirty();
    refreshAnnotationViews();
    dragState.element = document.querySelector('[data-annotation-id="' + utils.escapeAttribute(annotation.id) + '"]');
    try { (dragState.element || canvas).setPointerCapture(event.pointerId); } catch (e) { /* ok */ }
    return true;
  }

  function handleMarkerPlacementStart(event, canvas, blockId) {
    event.preventDefault(); event.stopPropagation();
    const found = state.findBlockById(blockId);
    if (!found) return false;
    const point      = getCanvasPercent(event, canvas);
    const annotation = state.createAnnotation("marker", nextNumberLabel(found.block));
    annotation.x = point.x; annotation.y = utils.clamp(point.y - 2, 0, 96);
    annotation.w = 1; annotation.h = 4;
    annotation.color = annotationColor;
    found.block.annotations.push(annotation);
    state.store.selectedAnnotationId = annotation.id;
    dragState = {
      mode: "marker-create", pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      rect: canvas.getBoundingClientRect(),
      annotation: annotation, element: null, blockId: blockId,
      original: { x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h }
    };
    placementState = null;
    state.markDirty();
    refreshAnnotationViews();
    dragState.element = document.querySelector('[data-annotation-id="' + utils.escapeAttribute(annotation.id) + '"]');
    try { (dragState.element || canvas).setPointerCapture(event.pointerId); } catch (e) { /* ok */ }
    return true;
  }

  function getCanvasPercent(event, canvas) { return getRectPercent(event, canvas.getBoundingClientRect()); }

  function getRectPercent(event, rect) {
    return {
      x: utils.clamp(((event.clientX - rect.left) / rect.width)  * 100, 0, 100),
      y: utils.clamp(((event.clientY - rect.top)  / rect.height) * 100, 0, 100)
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
    const nx1 = dragState.original.x1 + dx, ny1 = dragState.original.y1 + dy;
    const nx2 = dragState.original.x2 + dx, ny2 = dragState.original.y2 + dy;
    const minX = Math.min(nx1, nx2), maxX = Math.max(nx1, nx2);
    const minY = Math.min(ny1, ny2), maxY = Math.max(ny1, ny2);
    let ax = 0, ay = 0;
    if (minX < 0)   ax = -minX;
    if (maxX > 100) ax = 100 - maxX;
    if (minY < 0)   ay = -minY;
    if (maxY > 100) ay = 100 - maxY;
    annotation.x1 = utils.clamp(nx1 + ax, 0, 100); annotation.y1 = utils.clamp(ny1 + ay, 0, 100);
    annotation.x2 = utils.clamp(nx2 + ax, 0, 100); annotation.y2 = utils.clamp(ny2 + ay, 0, 100);
  }

  function updateArrowElement(element, annotation) {
    const geometry = arrowGeometry(annotation);
    const lineEnd  = arrowLineEnd(geometry);
    const line     = element.querySelector("line");
    const head     = element.querySelector("polygon");

    element.style.left   = geometry.left.toFixed(3)   + "%";
    element.style.top    = geometry.top.toFixed(3)    + "%";
    element.style.width  = geometry.width.toFixed(3)  + "%";
    element.style.height = geometry.height.toFixed(3) + "%";

    if (line) {
      line.setAttribute("x1", geometry.x1.toFixed(3));
      line.setAttribute("y1", geometry.y1.toFixed(3));
      line.setAttribute("x2", lineEnd.x.toFixed(3));
      line.setAttribute("y2", lineEnd.y.toFixed(3));
    }
    if (head) head.setAttribute("points", arrowHeadPoints(geometry));

    const start = element.querySelector(".arrow-start");
    const end   = element.querySelector(".arrow-end");
    if (start) { start.style.left = geometry.x1.toFixed(3) + "%"; start.style.top = geometry.y1.toFixed(3) + "%"; }
    if (end)   { end.style.left   = geometry.x2.toFixed(3) + "%"; end.style.top   = geometry.y2.toFixed(3) + "%"; }

    const canvas = element.closest(".annotation-canvas");
    if (canvas) fixArrowheads(canvas);
  }

  function updateSelectedClass(canvas, annotationId) {
    utils.$$(".annotation.editable", canvas).forEach(function (node) {
      const selected = node.dataset.annotationId === annotationId;
      node.classList.toggle("selected", selected);
      node.querySelector(".resize-handle") && node.querySelector(".resize-handle").remove();
      node.querySelectorAll(".arrow-point").forEach(function (h) { h.remove(); });
      if (!selected) return;

      const found      = state.findBlockById(canvas.dataset.blockId);
      const annotation = found && state.findAnnotation(found.block, annotationId);
      if (!annotation) return;
      normalizeAnnotation(annotation);

      if (annotation.type === "arrow") {
        const geometry = arrowGeometry(annotation);
        const mkSpan   = function (cls, point, gx, gy) {
          const s = document.createElement("span");
          s.className = "arrow-point " + cls;
          s.dataset.arrowPoint = point;
          s.style.left = gx.toFixed(3) + "%";
          s.style.top  = gy.toFixed(3) + "%";
          return s;
        };
        node.appendChild(mkSpan("arrow-start", "start", geometry.x1, geometry.y1));
        node.appendChild(mkSpan("arrow-end",   "end",   geometry.x2, geometry.y2));
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
      const size = Math.min(Number(annotation.w) || 10, Number(annotation.h) || 10);
      annotation.w = annotation.h = utils.clamp(size, 4, 100);
    }
    if (annotation.type === "arrow") {
      if (typeof annotation.x1 !== "number") annotation.x1 = 20;
      if (typeof annotation.y1 !== "number") annotation.y1 = 50;
      if (typeof annotation.x2 !== "number") annotation.x2 = 45;
      if (typeof annotation.y2 !== "number") annotation.y2 = 50;
      annotation.x1 = utils.clamp(annotation.x1, 0, 100); annotation.y1 = utils.clamp(annotation.y1, 0, 100);
      annotation.x2 = utils.clamp(annotation.x2, 0, 100); annotation.y2 = utils.clamp(annotation.y2, 0, 100);
    }
  }

  function isRoundAnnotation(a) { return a && (a.type === "circle" || a.type === "number"); }

  function roundHeightPercent(annotation, rect) {
    const size = Number(annotation.w) || 0;
    return (!rect || !rect.height) ? size : size * (rect.width / rect.height);
  }

  function maxRoundSizePercent(x, y, rect) {
    const maxW = Math.max(4, 100 - x);
    if (!rect || !rect.width) return maxW;
    return Math.min(maxW, Math.max(4, ((100 - y) / 100) * rect.height / rect.width * 100));
  }

  function createPlacementState(type, blockId) { return { type: type, blockId: blockId, arrowStart: null, markerStart: null }; }

  function cancelPlacement() {
    if (!placementState) return false;
    placementState = null;
    if (modalBlockId) renderAnnotationModal(); else ns.render.renderEditor();
    return true;
  }

  function handleEscape() {
    if (cancelPlacement()) return true;
    return Boolean(modalBlockId);
  }

  function normalizeAnnotationColor(color) {
    const value = String(color || "").toLowerCase();
    const found = ANNOTATION_COLORS.find(function (c) { return c.value.toLowerCase() === value; });
    return found ? found.value : ANNOTATION_COLORS[1].value;
  }

  function arrowGeometry(annotation) {
    const minX = Math.min(annotation.x1, annotation.x2), minY = Math.min(annotation.y1, annotation.y2);
    const maxX = Math.max(annotation.x1, annotation.x2), maxY = Math.max(annotation.y1, annotation.y2);
    const pad  = 3;
    const width  = Math.min(Math.max((maxX - minX) + pad * 2, 8), 100);
    const height = Math.min(Math.max((maxY - minY) + pad * 2, 8), 100);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const left = utils.clamp(cx - width / 2, 0, 100 - width);
    const top  = utils.clamp(cy - height / 2, 0, 100 - height);
    return {
      left: left, top: top, width: width, height: height,
      x1: ((annotation.x1 - left) / width)  * 100,
      y1: ((annotation.y1 - top)  / height) * 100,
      x2: ((annotation.x2 - left) / width)  * 100,
      y2: ((annotation.y2 - top)  / height) * 100
    };
  }

  function arrowVector(geometry) {
    const dx = geometry.x2 - geometry.x1, dy = geometry.y2 - geometry.y1;
    const len = Math.max(Math.hypot(dx, dy), 0.001);
    return { x: dx / len, y: dy / len };
  }

  function arrowHeadSize(geometry) {
    return {
      length: utils.clamp((1.8 / geometry.width)  * 100, 5, 22),
      half:   utils.clamp((1.2 / geometry.height) * 100, 7, 18)
    };
  }

  function arrowLineEnd(geometry) {
    const v = arrowVector(geometry), s = arrowHeadSize(geometry);
    return { x: geometry.x2 - v.x * s.length * 0.72, y: geometry.y2 - v.y * s.length * 0.72 };
  }

  function arrowHeadPoints(geometry) {
    const v = arrowVector(geometry), s = arrowHeadSize(geometry);
    const bx = geometry.x2 - v.x * s.length, by = geometry.y2 - v.y * s.length;
    const px = -v.y, py = v.x;
    return [
      geometry.x2.toFixed(3) + "," + geometry.y2.toFixed(3),
      (bx + px * s.half).toFixed(3) + "," + (by + py * s.half).toFixed(3),
      (bx - px * s.half).toFixed(3) + "," + (by - py * s.half).toFixed(3)
    ].join(" ");
  }

  ns.annotations = {
    addAnnotation,
    deleteSelectedAnnotation,
    handleDeleteKey,
    resizeSelectedAnnotation,
    setAnnotationMode,
    openAnnotationModal,
    closeAnnotationModal,
    setAnnotationColor,
    cancelPlacement,
    handleEscape,
    imageMarkup,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    positionStyle
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
