(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;
  let draggedBlockId = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindEvents();
    ns.render.renderAll();
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("pointerdown", ns.annotations.handlePointerDown);
    document.addEventListener("pointermove", ns.annotations.handlePointerMove);
    document.addEventListener("pointerup", ns.annotations.handlePointerUp);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
  }

  function handleClick(event) {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      ns.render.showTab(tab.dataset.tab);
      return;
    }

    const actionNode = event.target.closest("[data-action]");
    if (actionNode) {
      const action = actionNode.dataset.action;
      switch (action) {
        case "new-project":
          newProject();
          return;
        case "export-json":
          ns.exporter.exportJson();
          return;
        case "download-markdown":
          ns.exporter.downloadMarkdown();
          return;
        case "copy-markdown":
          ns.exporter.copyMarkdown();
          return;
        case "export-viewer":
          ns.viewerExport.exportViewerHtml();
          return;
        case "print":
          ns.exporter.printDocument();
          return;
        case "add-step":
          ns.blocks.addStep();
          return;
        case "delete-step":
          ns.blocks.deleteCurrentStep();
          return;
        case "move-step":
          ns.blocks.moveCurrentStep(Number(actionNode.dataset.dir));
          return;
        case "select-step":
          selectStep(actionNode.dataset.stepId);
          return;
        case "add-block":
          ns.blocks.addBlock();
          return;
        case "delete-block":
          ns.blocks.deleteBlock(actionNode.dataset.blockId);
          return;
        case "move-block":
          ns.blocks.moveBlock(actionNode.dataset.blockId, Number(actionNode.dataset.dir));
          return;
        case "clear-block-image":
          ns.blocks.clearBlockImage(actionNode.dataset.blockId);
          return;
        case "insert-block-link":
          ns.blocks.insertBlockLink(actionNode.dataset.blockId);
          return;
        case "open-annotation-modal":
          ns.annotations.openAnnotationModal(actionNode.dataset.blockId);
          return;
        case "close-annotation-modal":
          ns.annotations.closeAnnotationModal();
          return;
        case "add-annotation":
          ns.annotations.addAnnotation(actionNode.dataset.type, actionNode.dataset.blockId);
          return;
        case "set-annotation-color":
          ns.annotations.setAnnotationColor(actionNode.dataset.color, actionNode.dataset.blockId);
          return;
        case "delete-annotation":
          state.store.currentBlockId = actionNode.dataset.blockId;
          ns.annotations.deleteSelectedAnnotation();
          return;
        default:
          break;
      }
    }

    const sortItem = event.target.closest("[data-sort-block-id]");
    if (sortItem) {
      selectBlock(sortItem.dataset.sortBlockId);
      return;
    }

    const block = event.target.closest("[data-block-id]");
    if (block && !event.target.closest("input, textarea, select, button, label, .annotation")) {
      selectBlock(block.dataset.blockId);
    }
  }

  function handleInput(event) {
    const coverField = event.target.dataset.coverField;
    if (coverField) {
      state.store.project.cover[coverField] = event.target.value;
      state.markDirty();
      ns.render.renderPreview();
      ns.render.renderMarkdown();
      ns.render.updateDirtyIndicator();
      return;
    }

    const stepField = event.target.dataset.stepField;
    if (stepField) {
      ns.blocks.updateCurrentStepField(stepField, event.target.value);
      return;
    }

    const blockField = event.target.dataset.blockField;
    if (blockField) {
      ns.blocks.updateBlockField(event.target.dataset.blockId, blockField, event.target.value);
    }
  }

  function handleChange(event) {
    if (event.target.id === "jsonFileInput") {
      importJson(event.target.files[0], event.target);
      return;
    }

    if (event.target.dataset.action === "block-image-input") {
      ns.blocks.setBlockImageFromFile(event.target.dataset.blockId, event.target.files[0]);
      event.target.value = "";
      return;
    }

    if (event.target.dataset.action === "move-block-step") {
      ns.blocks.moveBlockToStep(event.target.dataset.blockId, event.target.value);
    }
  }

  function handleDragStart(event) {
    const item = event.target.closest("[data-sort-block-id]");
    if (!item) return;
    draggedBlockId = item.dataset.sortBlockId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedBlockId);
  }

  function handleDragOver(event) {
    const dropzone = event.target.closest("[data-dropzone-block-id]");
    const sortItem = event.target.closest("[data-sort-block-id]");
    if (!dropzone && !sortItem) return;
    event.preventDefault();
    if (dropzone) dropzone.classList.add("dragover");
    if (sortItem && draggedBlockId) sortItem.classList.add("drag-over");
  }

  function handleDragLeave(event) {
    const dropzone = event.target.closest("[data-dropzone-block-id]");
    const sortItem = event.target.closest("[data-sort-block-id]");
    if (dropzone) dropzone.classList.remove("dragover");
    if (sortItem) sortItem.classList.remove("drag-over");
  }

  function handleDrop(event) {
    const dropzone = event.target.closest("[data-dropzone-block-id]");
    if (dropzone) {
      event.preventDefault();
      dropzone.classList.remove("dragover");
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      ns.blocks.setBlockImageFromFile(dropzone.dataset.dropzoneBlockId, file);
      return;
    }

    const sortItem = event.target.closest("[data-sort-block-id]");
    if (sortItem && draggedBlockId) {
      event.preventDefault();
      const rect = sortItem.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      ns.blocks.reorderBlock(draggedBlockId, sortItem.dataset.sortBlockId, insertAfter);
      clearSortDragClasses();
      draggedBlockId = null;
    }
  }

  async function handlePaste(event) {
    const file = utils.firstImageFileFromClipboard(event);
    if (!file) return;
    event.preventDefault();
    await ns.blocks.pasteImage(file);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      if (ns.annotations.cancelPlacement()) return;
      ns.annotations.closeAnnotationModal();
    }
  }

  function handleBeforeUnload(event) {
    if (!state.store.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function newProject() {
    if (state.store.dirty && !confirm("未保存の変更があります。新規作成しますか？")) return;
    state.setProject(state.createProject());
    state.store.activeTab = "cover";
    ns.render.renderAll();
    utils.toast("新規手順書を作成しました。");
  }

  async function importJson(file, input) {
    if (!file) return;
    if (state.store.dirty && !confirm("未保存の変更があります。JSONを読み込みますか？")) {
      input.value = "";
      return;
    }
    await ns.exporter.importJsonFile(file);
    input.value = "";
  }

  function selectStep(stepId) {
    if (!state.setCurrentStep(stepId)) return;
    ns.render.renderStepList();
    ns.render.renderEditor();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
  }

  function selectBlock(blockId) {
    if (!state.setCurrentBlock(blockId)) return;
    ns.render.renderStepList();
    ns.render.renderEditor();
    ns.render.renderSortList();
  }

  function clearSortDragClasses() {
    utils.$$("[data-sort-block-id]").forEach(function (item) {
      item.classList.remove("drag-over");
    });
  }
})(window.ProcedureEditor = window.ProcedureEditor || {});
