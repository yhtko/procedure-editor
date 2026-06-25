(function (ns) {
  "use strict";

  const utils = ns.utils;
  const COVER_FIELDS = [
    "title",
    "targetWork",
    "audience",
    "systemName",
    "account",
    "revision",
    "createdAt",
    "updatedAt",
    "author",
    "approver",
    "purpose",
    "preparation",
    "notes"
  ];

  const STEP_FIELDS = ["title", "screen", "summary", "check"];
  const BLOCK_FIELDS = ["title", "text", "image", "imageName"];
  const ANNOTATION_TYPES = ["circle", "arrow", "number", "marker"];
  const STEP_TYPES = ["normal", "error", "irregular"];

  const store = {
    project: createProject(),
    currentStepId: null,
    currentBlockId: null,
    selectedAnnotationId: null,
    activeTab: "cover",
    dirty: false
  };

  function defaultCover() {
    const today = utils.todayIso();
    return {
      title: "PC操作手順書",
      targetWork: "",
      audience: "",
      systemName: "",
      account: "",
      revision: "1.0",
      createdAt: today,
      updatedAt: today,
      author: "",
      approver: "",
      purpose: "",
      preparation: "",
      notes: ""
    };
  }

  function createProject() {
    return {
      version: 2,
      cover: defaultCover(),
      steps: []
    };
  }

  function createStep(index) {
    const stepNumber = index || store.project.steps.length + 1;
    return {
      id: utils.uid("step"),
      type: "normal",
      title: "新しいSTEP " + stepNumber,
      screen: "",
      summary: "",
      check: "",
      blocks: [createBlock(1)]
    };
  }

  function createBlock(index) {
    return {
      id: utils.uid("block"),
      title: "操作説明 " + (index || 1),
      text: "",
      image: "",
      imageName: "",
      annotations: [],
      jumps: []
    };
  }

  function createJump(targetStepId, label) {
    return {
      id: utils.uid("jump"),
      targetStepId: targetStepId,
      label: String(label || "")
    };
  }

  function createExternalJump(url, label) {
    return {
      id: utils.uid("jump"),
      url: String(url || ""),
      label: String(label || "")
    };
  }

  function createAnnotation(type, label) {
    const safeType = ANNOTATION_TYPES.includes(type) ? type : "circle";
    const isNumber = safeType === "number";
    return {
      id: utils.uid("ann"),
      type: safeType,
      x: isNumber ? 42 : 24,
      y: isNumber ? 28 : 24,
      w: isNumber ? 9 : safeType === "arrow" ? 32 : 24,
      h: isNumber ? 9 : safeType === "arrow" ? 18 : 18,
      label: isNumber ? String(label || 1) : "",
      color: safeType === "marker" ? "#facc15" : "#ef4444"
    };
  }

  function normalizeProject(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const normalized = createProject();
    normalized.version = 2;
    normalized.cover = normalizeCover(source.cover || {});
    normalized.steps = Array.isArray(source.steps) ? source.steps.map(normalizeStep) : [];
    return normalized;
  }

  function normalizeCover(cover) {
    const normalized = defaultCover();
    COVER_FIELDS.forEach(function (field) {
      if (cover[field] != null) normalized[field] = String(cover[field]);
    });
    return normalized;
  }

  function normalizeStep(step, index) {
    const normalized = {
      id: step.id || utils.uid("step"),
      type: STEP_TYPES.includes(step.type) ? step.type : "normal",
      title: "",
      screen: "",
      summary: "",
      check: "",
      blocks: []
    };
    STEP_FIELDS.forEach(function (field) {
      if (step[field] != null) normalized[field] = String(step[field]);
    });
    if (!normalized.title) normalized.title = "STEP " + (index + 1);
    normalized.blocks = Array.isArray(step.blocks) ? step.blocks.map(normalizeBlock) : [];
    return normalized;
  }

  function normalizeBlock(block, index) {
    const normalized = {
      id: block.id || utils.uid("block"),
      title: "",
      text: "",
      image: "",
      imageName: "",
      annotations: [],
      jumps: []
    };
    BLOCK_FIELDS.forEach(function (field) {
      if (block[field] != null) normalized[field] = String(block[field]);
    });
    if (!normalized.title) normalized.title = "操作説明 " + (index + 1);
    normalized.annotations = Array.isArray(block.annotations)
      ? block.annotations.map(normalizeAnnotation).filter(Boolean)
      : [];
    normalized.jumps = Array.isArray(block.jumps)
      ? block.jumps.map(normalizeJump).filter(Boolean)
      : [];
    return normalized;
  }

  function normalizeJump(jump) {
    if (!jump || typeof jump !== "object") return null;
    if (jump.url) {
      return {
        id: jump.id || utils.uid("jump"),
        url: String(jump.url),
        label: String(jump.label || "")
      };
    }
    if (!jump.targetStepId) return null;
    return {
      id: jump.id || utils.uid("jump"),
      targetStepId: String(jump.targetStepId),
      label: String(jump.label || "")
    };
  }

  function normalizeAnnotation(annotation, index) {
    if (!annotation || typeof annotation !== "object") return null;
    const type = ANNOTATION_TYPES.includes(annotation.type) ? annotation.type : "circle";
    const width = utils.clamp(annotation.w, 4, 100);
    const height = utils.clamp(annotation.h, 4, 100);
    const size = type === "circle" || type === "number" ? Math.min(width, height) : null;
    const normalized = {
      id: annotation.id || utils.uid("ann"),
      type,
      x: utils.clamp(annotation.x, 0, 98),
      y: utils.clamp(annotation.y, 0, 98),
      w: size || width,
      h: size || height,
      label: annotation.label != null ? String(annotation.label) : type === "number" ? String(index + 1) : "",
      color: annotation.color || (type === "marker" ? "#facc15" : "#ef4444")
    };

    if (type === "arrow") {
      if (typeof annotation.x1 === "number") normalized.x1 = utils.clamp(annotation.x1, 0, 100);
      if (typeof annotation.y1 === "number") normalized.y1 = utils.clamp(annotation.y1, 0, 100);
      if (typeof annotation.x2 === "number") normalized.x2 = utils.clamp(annotation.x2, 0, 100);
      if (typeof annotation.y2 === "number") normalized.y2 = utils.clamp(annotation.y2, 0, 100);
    }

    return normalized;
  }

  function setProject(project) {
    store.project = normalizeProject(project);
    const firstStep = store.project.steps[0] || null;
    store.currentStepId = firstStep ? firstStep.id : null;
    store.currentBlockId = firstStep && firstStep.blocks[0] ? firstStep.blocks[0].id : null;
    store.selectedAnnotationId = null;
    store.dirty = false;
  }

  function getCurrentStep() {
    return store.project.steps.find(function (step) {
      return step.id === store.currentStepId;
    }) || null;
  }

  function getCurrentBlock() {
    const found = findBlockById(store.currentBlockId);
    return found ? found.block : null;
  }

  function findStepById(stepId) {
    for (let stepIndex = 0; stepIndex < store.project.steps.length; stepIndex += 1) {
      const step = store.project.steps[stepIndex];
      if (step.id === stepId) return { step, stepIndex };
    }
    return null;
  }

  function findBlockById(blockId) {
    if (!blockId) return null;
    for (let stepIndex = 0; stepIndex < store.project.steps.length; stepIndex += 1) {
      const step = store.project.steps[stepIndex];
      for (let blockIndex = 0; blockIndex < (step.blocks || []).length; blockIndex += 1) {
        const block = step.blocks[blockIndex];
        if (block.id === blockId) return { step, block, stepIndex, blockIndex };
      }
    }
    return null;
  }

  function findAnnotation(block, annotationId) {
    return (block && block.annotations || []).find(function (annotation) {
      return annotation.id === annotationId;
    }) || null;
  }

  function setCurrentStep(stepId) {
    const found = findStepById(stepId);
    if (!found) return false;
    store.currentStepId = stepId;
    store.currentBlockId = found.step.blocks[0] ? found.step.blocks[0].id : null;
    store.selectedAnnotationId = null;
    return true;
  }

  function setCurrentBlock(blockId) {
    const found = findBlockById(blockId);
    if (!found) return false;
    store.currentStepId = found.step.id;
    store.currentBlockId = blockId;
    store.selectedAnnotationId = null;
    return true;
  }

  function markDirty() {
    store.dirty = true;
  }

  function markClean() {
    store.dirty = false;
  }

  ns.state = {
    COVER_FIELDS,
    STEP_FIELDS,
    BLOCK_FIELDS,
    ANNOTATION_TYPES,
    STEP_TYPES,
    store,
    defaultCover,
    createProject,
    createStep,
    createBlock,
    createJump,
    createExternalJump,
    createAnnotation,
    normalizeProject,
    setProject,
    getCurrentStep,
    getCurrentBlock,
    findStepById,
    findBlockById,
    findAnnotation,
    setCurrentStep,
    setCurrentBlock,
    markDirty,
    markClean
  };
})(window.ProcedureEditor = window.ProcedureEditor || {});
