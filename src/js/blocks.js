(function (ns) {
  "use strict";

  const utils = ns.utils;
  const state = ns.state;

  function addStep() {
    const normalCount = state.store.project.steps.filter(function (s) { return s.type !== "error"; }).length;
    const step = state.createStep(normalCount + 1);
    const firstErrorIndex = state.store.project.steps.findIndex(function (s) { return s.type === "error"; });
    if (firstErrorIndex === -1) {
      state.store.project.steps.push(step);
    } else {
      state.store.project.steps.splice(firstErrorIndex, 0, step);
    }
    state.store.currentStepId = step.id;
    state.store.currentBlockId = step.blocks[0] ? step.blocks[0].id : null;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.showTab("steps");
    ns.render.renderAll();
    utils.toast("STEPを追加しました。");
  }

  function deleteCurrentStep() {
    const found = state.findStepById(state.store.currentStepId);
    if (!found) return;
    if (!confirm("現在のSTEPを削除しますか？")) return;
    state.store.project.steps.splice(found.stepIndex, 1);
    const next = state.store.project.steps[Math.max(0, found.stepIndex - 1)] || state.store.project.steps[0] || null;
    state.store.currentStepId = next ? next.id : null;
    state.store.currentBlockId = next && next.blocks[0] ? next.blocks[0].id : null;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.renderAll();
    utils.toast("STEPを削除しました。");
  }

  function moveCurrentStep(offset) {
    const found = state.findStepById(state.store.currentStepId);
    if (!found) return;
    const to = found.stepIndex + offset;
    if (to < 0 || to >= state.store.project.steps.length) return;
    const steps = state.store.project.steps;
    const temp = steps[found.stepIndex];
    steps[found.stepIndex] = steps[to];
    steps[to] = temp;
    state.markDirty();
    renderAfterStructureChange();
  }

  function updateCurrentStepField(field, value) {
    const step = state.getCurrentStep();
    if (!step || !state.STEP_FIELDS.includes(field)) return;
    step[field] = value;
    state.markDirty();
    ns.render.renderStepList();
    ns.render.renderSortList();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  function addBlock() {
    const step = state.getCurrentStep();
    if (!step) return;
    const block = state.createBlock((step.blocks || []).length + 1);
    step.blocks = step.blocks || [];
    step.blocks.push(block);
    state.store.currentBlockId = block.id;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.renderEditor();
    ns.render.renderStepList();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
    utils.toast("説明ブロックを追加しました。");
  }

  function deleteBlock(blockId) {
    const found = state.findBlockById(blockId);
    if (!found) return;
    if (!confirm("この説明ブロックを削除しますか？")) return;
    found.step.blocks.splice(found.blockIndex, 1);
    const next = found.step.blocks[Math.max(0, found.blockIndex - 1)] || found.step.blocks[0] || null;
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = next ? next.id : null;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    renderAfterStructureChange();
    utils.toast("説明ブロックを削除しました。");
  }

  function moveBlock(blockId, offset) {
    const found = state.findBlockById(blockId);
    if (!found) return;
    const to = found.blockIndex + offset;
    if (to < 0 || to >= found.step.blocks.length) return;
    const blocks = found.step.blocks;
    const temp = blocks[found.blockIndex];
    blocks[found.blockIndex] = blocks[to];
    blocks[to] = temp;
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = blockId;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    renderAfterStructureChange();
  }

  function updateBlockField(blockId, field, value) {
    const found = state.findBlockById(blockId);
    if (!found || !["title", "text"].includes(field)) return;
    found.block[field] = value;
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.renderStepList();
    ns.render.renderSortList();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  function insertBlockLink(blockId) {
    const found = state.findBlockById(blockId);
    if (!found) return;

    const input = findBlockTextInput(blockId);
    const currentText = input ? input.value : found.block.text || "";
    const selectionStart = input && typeof input.selectionStart === "number" ? input.selectionStart : currentText.length;
    const selectionEnd = input && typeof input.selectionEnd === "number" ? input.selectionEnd : selectionStart;

    const rawUrl = prompt("リンクURLを入力してください。");
    if (rawUrl == null) return;
    const url = utils.normalizeLinkUrl(rawUrl);
    if (!url) {
      utils.toast("http(s) または mailto のリンクURLを入力してください。");
      return;
    }

    const selectedText = currentText.slice(selectionStart, selectionEnd).trim();
    const rawLabel = prompt("表示文言を入力してください。", selectedText || "");
    if (rawLabel == null) return;
    const label = rawLabel.trim();
    if (!label) {
      utils.toast("表示文言を入力してください。");
      return;
    }

    const token = "[" + label.replace(/\]/g, ")").replace(/\n/g, " ") + "](" + url + ")";
    const before = currentText.slice(0, selectionStart);
    const after = currentText.slice(selectionEnd);
    const prefix = before && !/\s$/.test(before) ? " " : "";
    const suffix = after && !/^\s/.test(after) ? " " : "";
    const nextText = before + prefix + token + suffix + after;
    const caret = (before + prefix + token).length;

    found.block.text = nextText;
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.renderEditor();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();

    const nextInput = findBlockTextInput(blockId);
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(caret, caret);
    }
  }

  function findBlockTextInput(blockId) {
    return utils.$$('textarea[data-block-field="text"]').find(function (node) {
      return node.dataset.blockId === blockId;
    }) || null;
  }

  async function setBlockImageFromFile(blockId, file) {
    const found = state.findBlockById(blockId);
    if (!found || !file) return;
    try {
      const image = await utils.readFileAsDataUrl(file);
      found.block.image = image.dataUrl;
      found.block.imageName = image.name;
      state.store.currentStepId = found.step.id;
      state.store.currentBlockId = found.block.id;
      state.store.selectedAnnotationId = null;
      state.markDirty();
      ns.render.renderEditor();
      ns.render.renderStepList();
      ns.render.renderPreview();
      ns.render.renderMarkdown();
      ns.render.updateDirtyIndicator();
      utils.toast("画像を追加しました。");
    } catch (error) {
      utils.toast(error.message);
    }
  }

  function clearBlockImage(blockId) {
    const found = state.findBlockById(blockId);
    if (!found) return;
    if (!confirm("画像と注釈を削除しますか？")) return;
    found.block.image = "";
    found.block.imageName = "";
    found.block.annotations = [];
    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.renderEditor();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  function moveBlockToStep(blockId, targetStepId) {
    const found = state.findBlockById(blockId);
    const target = state.findStepById(targetStepId);
    if (!found || !target || found.step.id === target.step.id) return;
    const block = found.step.blocks.splice(found.blockIndex, 1)[0];
    target.step.blocks = target.step.blocks || [];
    target.step.blocks.push(block);
    state.store.currentStepId = target.step.id;
    state.store.currentBlockId = block.id;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    ns.render.renderAll();
    utils.toast("ブロックの帰属STEPを変更しました。");
  }

  function reorderBlock(draggedId, targetId, insertAfter) {
    const step = state.getCurrentStep();
    if (!step || draggedId === targetId) return;
    const from = step.blocks.findIndex(function (block) { return block.id === draggedId; });
    const target = step.blocks.findIndex(function (block) { return block.id === targetId; });
    if (from < 0 || target < 0) return;
    const block = step.blocks.splice(from, 1)[0];
    let to = step.blocks.findIndex(function (item) { return item.id === targetId; });
    if (insertAfter) to += 1;
    step.blocks.splice(to, 0, block);
    state.store.currentBlockId = draggedId;
    state.store.selectedAnnotationId = null;
    state.markDirty();
    renderAfterStructureChange();
  }

  function ensureEditableBlock() {
    let step = state.getCurrentStep();
    if (!step) {
      step = state.createStep(state.store.project.steps.length + 1);
      state.store.project.steps.push(step);
      state.store.currentStepId = step.id;
    }
    step.blocks = step.blocks || [];
    if (!step.blocks.length) {
      step.blocks.push(state.createBlock(1));
    }
    if (!state.store.currentBlockId || !state.findBlockById(state.store.currentBlockId)) {
      state.store.currentBlockId = step.blocks[0].id;
    }
    return state.getCurrentBlock();
  }

  async function pasteImage(file) {
    const block = ensureEditableBlock();
    ns.render.showTab("steps");
    ns.render.renderAll();
    await setBlockImageFromFile(block.id, file);
  }

  function toggleStepType() {
    const found = state.findStepById(state.store.currentStepId);
    if (!found) return;
    const step = found.step;
    const wasError = step.type === "error";
    step.type = wasError ? "normal" : "error";

    if (!wasError) {
      state.store.project.steps.splice(found.stepIndex, 1);
      state.store.project.steps.push(step);
    }

    state.markDirty();
    ns.render.renderAll();
    utils.toast(wasError ? "通常STEPに変更しました。" : "エラー対応STEPに変更しました。末尾に移動しました。");
  }

  function addJumpToBlock(blockId, targetStepId) {
    const found = state.findBlockById(blockId);
    const target = state.findStepById(targetStepId);
    if (!found || !target || target.step.type !== "error") return;

    const exists = (found.block.jumps || []).some(function (j) {
      return j.targetStepId === targetStepId;
    });
    if (exists) {
      utils.toast("このエラー対応STEPへのジャンプはすでに追加されています。");
      return;
    }

    found.block.jumps = found.block.jumps || [];
    const jump = state.createJump(targetStepId, target.step.title || "");
    found.block.jumps.push(jump);

    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.markDirty();
    ns.render.renderEditor();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
    utils.toast("ジャンプを追加しました。");
  }

  function removeJumpFromBlock(blockId, jumpId) {
    const found = state.findBlockById(blockId);
    if (!found) return;
    const before = (found.block.jumps || []).length;
    found.block.jumps = (found.block.jumps || []).filter(function (j) {
      return j.id !== jumpId;
    });
    if (found.block.jumps.length === before) return;

    state.store.currentStepId = found.step.id;
    state.store.currentBlockId = found.block.id;
    state.markDirty();
    ns.render.renderEditor();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  function renderAfterStructureChange() {
    ns.render.renderEditor();
    ns.render.renderStepList();
    ns.render.renderSortList();
    ns.render.renderPreview();
    ns.render.renderMarkdown();
    ns.render.updateDirtyIndicator();
  }

  ns.blocks = {
    addStep,
    deleteCurrentStep,
    moveCurrentStep,
    updateCurrentStepField,
    addBlock,
    deleteBlock,
    moveBlock,
    updateBlockField,
    insertBlockLink,
    setBlockImageFromFile,
    clearBlockImage,
    moveBlockToStep,
    reorderBlock,
    ensureEditableBlock,
    pasteImage,
    toggleStepType,
    addJumpToBlock,
    removeJumpFromBlock
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
