import './style.css';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  MOUSE,
  MeshBasicMaterial,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { DifferentialGrowthEngine, type DifferentialGrowthSnapshot } from './core/differentialGrowthEngine';
import { buildShapeGeometry } from './core/meshFactory';
import { MaterialController } from './core/materialController';
import type {
  AppState,
  BaseShape,
  GradientType,
  GrowthSettings,
  MaterialSettings,
  ShapeSettings,
  SimulationSettings,
  TransformOrder,
  ViewMode,
} from './types';

type UiRefs = {
  panel: HTMLDivElement;
  handleTop: HTMLDivElement;
  handleBottom: HTMLDivElement;
  collapseToggle: HTMLButtonElement;
  start: HTMLButtonElement;
  maskMode: HTMLButtonElement;
  reset: HTMLButtonElement;
  resetSubdivision: HTMLButtonElement;
  resetTransform: HTMLButtonElement;
  blurMask: HTMLButtonElement;
  clearMask: HTMLButtonElement;
  growthSpeed: HTMLInputElement;
  growthSpeedValue: HTMLSpanElement;
  timeline: HTMLInputElement;
  timelineValue: HTMLSpanElement;
  seed: HTMLInputElement;
  seedValueLabel: HTMLSpanElement;
  seedInfluence: HTMLInputElement;
  seedInfluenceValue: HTMLSpanElement;
  baseShape: HTMLSelectElement;
  transformOrder: HTMLSelectElement;
  subdivision: HTMLInputElement;
  subdivisionValue: HTMLSpanElement;
  scaleX: HTMLInputElement;
  scaleXValue: HTMLSpanElement;
  scaleY: HTMLInputElement;
  scaleYValue: HTMLSpanElement;
  scaleZ: HTMLInputElement;
  scaleZValue: HTMLSpanElement;
  rotateX: HTMLInputElement;
  rotateXValue: HTMLSpanElement;
  rotateY: HTMLInputElement;
  rotateYValue: HTMLSpanElement;
  rotateZ: HTMLInputElement;
  rotateZValue: HTMLSpanElement;
  showWireframe: HTMLInputElement;
  showMesh: HTMLInputElement;
  brushRadius: HTMLInputElement;
  brushRadiusValue: HTMLSpanElement;
  falloffOffset: HTMLInputElement;
  falloffOffsetValue: HTMLSpanElement;
  growthStep: HTMLInputElement;
  growthStepValue: HTMLSpanElement;
  targetEdgeLength: HTMLInputElement;
  targetEdgeLengthValue: HTMLSpanElement;
  splitThreshold: HTMLInputElement;
  splitThresholdValue: HTMLSpanElement;
  repulsion: HTMLInputElement;
  repulsionValue: HTMLSpanElement;
  smoothing: HTMLInputElement;
  smoothingValue: HTMLSpanElement;
  finalSmoothing: HTMLInputElement;
  finalSmoothingValue: HTMLSpanElement;
  shapeRetention: HTMLInputElement;
  shapeRetentionValue: HTMLSpanElement;
  maxVertices: HTMLInputElement;
  maxVerticesValue: HTMLSpanElement;
  gradientType: HTMLSelectElement;
  gradientStart: HTMLInputElement;
  gradientEnd: HTMLInputElement;
  curvatureContrast: HTMLInputElement;
  curvatureContrastValue: HTMLSpanElement;
  curvatureBias: HTMLInputElement;
  curvatureBiasValue: HTMLSpanElement;
  gradientBlur: HTMLInputElement;
  gradientBlurValue: HTMLSpanElement;
  fresnel: HTMLInputElement;
  fresnelValue: HTMLSpanElement;
  specular: HTMLInputElement;
  specularValue: HTMLSpanElement;
  bloom: HTMLInputElement;
  bloomValue: HTMLSpanElement;
  overlay: SVGSVGElement;
  brushCircle: SVGCircleElement;
  falloffCircle: SVGCircleElement;
  brushDot: SVGCircleElement;
};

const FIXED_MASK_BLUR_STRENGTH = 0.35;
const MAX_TIMELINE_SNAPSHOTS = 240;
type MaskAction =
  | { kind: 'paint'; point: Vector3; radius: number; falloffOffset: number }
  | { kind: 'erase'; point: Vector3; radius: number; falloffOffset: number }
  | { kind: 'blur'; strength: number };
type TimelineEntry = { step: number; snapshot: DifferentialGrowthSnapshot };

function revealUiWhenStyled(maxWaitMs = 1500): void {
  const start = performance.now();
  const tryReveal = (): void => {
    const styled = getComputedStyle(document.documentElement).getPropertyValue('--ui-size-scale').trim().length > 0;
    if (styled || performance.now() - start >= maxWaitMs) {
      document.documentElement.classList.add('ui-ready');
      return;
    }
    requestAnimationFrame(tryReveal);
  };
  tryReveal();
}

function requiredElement<T extends Element>(
  id: string,
  check: (element: Element) => element is T,
): T {
  const element = document.getElementById(id);
  if (!element || !check(element)) {
    throw new Error(`Required element #${id} was not found or has an unexpected type.`);
  }
  return element;
}

function isInput(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement;
}

function isSelect(element: Element): element is HTMLSelectElement {
  return element instanceof HTMLSelectElement;
}

function isButton(element: Element): element is HTMLButtonElement {
  return element instanceof HTMLButtonElement;
}

function isDiv(element: Element): element is HTMLDivElement {
  return element instanceof HTMLDivElement;
}

function isSpan(element: Element): element is HTMLSpanElement {
  return element instanceof HTMLSpanElement;
}

function isSvg(element: Element): element is SVGSVGElement {
  return element instanceof SVGSVGElement;
}

function isSvgCircle(element: Element): element is SVGCircleElement {
  return element instanceof SVGCircleElement;
}

const ui: UiRefs = {
  panel: requiredElement('ui-panel', isDiv),
  handleTop: requiredElement('ui-handle', isDiv),
  handleBottom: requiredElement('ui-handle-bottom', isDiv),
  collapseToggle: requiredElement('collapse-toggle', isButton),
  start: requiredElement('start-sim', isButton),
  maskMode: requiredElement('mask-mode', isButton),
  reset: requiredElement('reset-sim', isButton),
  resetSubdivision: requiredElement('reset-subdivision', isButton),
  resetTransform: requiredElement('reset-transform', isButton),
  blurMask: requiredElement('blur-mask', isButton),
  clearMask: requiredElement('clear-mask', isButton),
  growthSpeed: requiredElement('growth-speed', isInput),
  growthSpeedValue: requiredElement('growth-speed-value', isSpan),
  timeline: requiredElement('simulation-timeline', isInput),
  timelineValue: requiredElement('simulation-timeline-value', isSpan),
  seed: requiredElement('seed-value', isInput),
  seedValueLabel: requiredElement('seed-value-label', isSpan),
  seedInfluence: requiredElement('seed-influence', isInput),
  seedInfluenceValue: requiredElement('seed-influence-value', isSpan),
  baseShape: requiredElement('base-shape', isSelect),
  transformOrder: requiredElement('transform-order', isSelect),
  subdivision: requiredElement('subdivision', isInput),
  subdivisionValue: requiredElement('subdivision-value', isSpan),
  scaleX: requiredElement('scale-x', isInput),
  scaleXValue: requiredElement('scale-x-value', isSpan),
  scaleY: requiredElement('scale-y', isInput),
  scaleYValue: requiredElement('scale-y-value', isSpan),
  scaleZ: requiredElement('scale-z', isInput),
  scaleZValue: requiredElement('scale-z-value', isSpan),
  rotateX: requiredElement('rotate-x', isInput),
  rotateXValue: requiredElement('rotate-x-value', isSpan),
  rotateY: requiredElement('rotate-y', isInput),
  rotateYValue: requiredElement('rotate-y-value', isSpan),
  rotateZ: requiredElement('rotate-z', isInput),
  rotateZValue: requiredElement('rotate-z-value', isSpan),
  showWireframe: requiredElement('show-wireframe', isInput),
  showMesh: requiredElement('show-mesh', isInput),
  brushRadius: requiredElement('brush-radius', isInput),
  brushRadiusValue: requiredElement('brush-radius-value', isSpan),
  falloffOffset: requiredElement('falloff-offset', isInput),
  falloffOffsetValue: requiredElement('falloff-offset-value', isSpan),
  growthStep: requiredElement('growth-step', isInput),
  growthStepValue: requiredElement('growth-step-value', isSpan),
  targetEdgeLength: requiredElement('target-edge-length', isInput),
  targetEdgeLengthValue: requiredElement('target-edge-length-value', isSpan),
  splitThreshold: requiredElement('split-threshold', isInput),
  splitThresholdValue: requiredElement('split-threshold-value', isSpan),
  repulsion: requiredElement('repulsion', isInput),
  repulsionValue: requiredElement('repulsion-value', isSpan),
  smoothing: requiredElement('smoothing', isInput),
  smoothingValue: requiredElement('smoothing-value', isSpan),
  finalSmoothing: requiredElement('final-smoothing', isInput),
  finalSmoothingValue: requiredElement('final-smoothing-value', isSpan),
  shapeRetention: requiredElement('shape-retention', isInput),
  shapeRetentionValue: requiredElement('shape-retention-value', isSpan),
  maxVertices: requiredElement('max-vertices', isInput),
  maxVerticesValue: requiredElement('max-vertices-value', isSpan),
  gradientType: requiredElement('gradient-type', isSelect),
  gradientStart: requiredElement('gradient-start-color', isInput),
  gradientEnd: requiredElement('gradient-end-color', isInput),
  curvatureContrast: requiredElement('curvature-contrast', isInput),
  curvatureContrastValue: requiredElement('curvature-contrast-value', isSpan),
  curvatureBias: requiredElement('curvature-bias', isInput),
  curvatureBiasValue: requiredElement('curvature-bias-value', isSpan),
  gradientBlur: requiredElement('gradient-blur', isInput),
  gradientBlurValue: requiredElement('gradient-blur-value', isSpan),
  fresnel: requiredElement('fresnel', isInput),
  fresnelValue: requiredElement('fresnel-value', isSpan),
  specular: requiredElement('specular', isInput),
  specularValue: requiredElement('specular-value', isSpan),
  bloom: requiredElement('bloom', isInput),
  bloomValue: requiredElement('bloom-value', isSpan),
  overlay: requiredElement('brush-overlay', isSvg),
  brushCircle: requiredElement('brush-circle', isSvgCircle),
  falloffCircle: requiredElement('falloff-circle', isSvgCircle),
  brushDot: requiredElement('brush-dot', isSvgCircle),
};

const canvas = document.querySelector<HTMLCanvasElement>('#app-canvas');
if (!canvas) {
  throw new Error('Canvas #app-canvas was not found.');
}

revealUiWhenStyled();

const simulationSettings: SimulationSettings = {
  growthSpeed: Number.parseFloat(ui.growthSpeed.value),
  seed: Number.parseInt(ui.seed.value, 10),
  seedInfluence: Number.parseFloat(ui.seedInfluence.value),
};

const shapeSettings: ShapeSettings = {
  baseShape: ui.baseShape.value as BaseShape,
  subdivision: Number.parseInt(ui.subdivision.value, 10),
  transformOrder: ui.transformOrder.value as TransformOrder,
  scaleX: Number.parseFloat(ui.scaleX.value),
  scaleY: Number.parseFloat(ui.scaleY.value),
  scaleZ: Number.parseFloat(ui.scaleZ.value),
  rotateX: Number.parseFloat(ui.rotateX.value),
  rotateY: Number.parseFloat(ui.rotateY.value),
  rotateZ: Number.parseFloat(ui.rotateZ.value),
  showWireframe: ui.showWireframe.checked,
  showMesh: ui.showMesh.checked,
  brushRadius: Number.parseFloat(ui.brushRadius.value),
  falloffOffset: Number.parseFloat(ui.falloffOffset.value),
};

const growthSettings: GrowthSettings = {
  growthStep: Number.parseFloat(ui.growthStep.value),
  targetEdgeLength: Number.parseFloat(ui.targetEdgeLength.value),
  splitThreshold: Number.parseFloat(ui.splitThreshold.value),
  repulsion: Number.parseFloat(ui.repulsion.value),
  smoothing: Number.parseFloat(ui.smoothing.value),
  shapeRetention: Number.parseFloat(ui.shapeRetention.value),
  maxVertices: Number.parseInt(ui.maxVertices.value, 10),
};

const materialSettings: MaterialSettings = {
  gradientType: ui.gradientType.value as GradientType,
  gradientStart: ui.gradientStart.value,
  gradientEnd: ui.gradientEnd.value,
  curvatureContrast: Number.parseFloat(ui.curvatureContrast.value),
  curvatureBias: Number.parseFloat(ui.curvatureBias.value),
  gradientBlur: Number.parseFloat(ui.gradientBlur.value),
  fresnel: Number.parseFloat(ui.fresnel.value),
  specular: Number.parseFloat(ui.specular.value),
  bloom: Number.parseFloat(ui.bloom.value),
};

const appState: AppState = {
  running: false,
  viewMode: 'curvature',
};

let finalSmoothingAmount = Number.parseFloat(ui.finalSmoothing.value);
let finalSmoothingSource: Float32Array | null = null;

const renderer = new WebGLRenderer({ antialias: true, canvas });
const getPixelRatio = (): number => Math.min(window.devicePixelRatio * 1.5, 3);
renderer.setPixelRatio(getPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;

const scene = new Scene();
scene.background = new Color(0x111622);

const camera = new PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0.25, 4.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.enableZoom = true;
controls.target.set(0, 0, 0);
controls.mouseButtons = {
  LEFT: -1 as unknown as MOUSE,
  MIDDLE: MOUSE.PAN,
  RIGHT: MOUSE.ROTATE,
};
controls.update();
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('contextmenu', (event) => event.preventDefault());

function buildScaledShapeGeometry(): BufferGeometry {
  const geometry = buildShapeGeometry(shapeSettings.baseShape, shapeSettings.subdivision);
  const rx = (shapeSettings.rotateX * Math.PI) / 180;
  const ry = (shapeSettings.rotateY * Math.PI) / 180;
  const rz = (shapeSettings.rotateZ * Math.PI) / 180;
  if (shapeSettings.transformOrder === 'rotate-then-scale') {
    geometry.rotateX(rx);
    geometry.rotateY(ry);
    geometry.rotateZ(rz);
    geometry.scale(shapeSettings.scaleX, shapeSettings.scaleY, shapeSettings.scaleZ);
  } else {
    geometry.scale(shapeSettings.scaleX, shapeSettings.scaleY, shapeSettings.scaleZ);
    geometry.rotateX(rx);
    geometry.rotateY(ry);
    geometry.rotateZ(rz);
  }
  return geometry;
}

const materialController = new MaterialController(materialSettings);
const initialGeometry = buildScaledShapeGeometry();
prepareGeometry(initialGeometry);
const mesh = new Mesh(initialGeometry, materialController.material);
mesh.visible = shapeSettings.showMesh;
scene.add(mesh);
const wireframeMaterial = new MeshBasicMaterial({
  color: 0xe6f1ff,
  wireframe: true,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const wireframeMesh = new Mesh(initialGeometry, wireframeMaterial);
wireframeMesh.visible = shapeSettings.showWireframe;
wireframeMesh.renderOrder = 1;
scene.add(wireframeMesh);

const engine = new DifferentialGrowthEngine(initialGeometry, growthSettings, simulationSettings.seed);
engine.setGradientBlur(materialSettings.gradientBlur);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new Vector2(window.innerWidth, window.innerHeight),
  materialSettings.bloom,
  0.7,
  0.15,
);
composer.addPass(bloomPass);
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.enabled = true;
composer.addPass(fxaaPass);

const raycaster = new Raycaster();
const pointer = new Vector2();
const tempVec = new Vector3();
const tempScreen = new Vector2();
const tempNormal = new Vector3();
const tempTangent = new Vector3();
const tempLocal = new Vector3();

let draggingPanel = false;
const dragOffset = { x: 0, y: 0 };
let pointerDown = false;
let painting = false;
let erasing = false;
let shiftDown = false;
let shapeResetQueued = false;
let controlsInitialized = false;
let subdivisionWireframePreviewActive = false;
const maskActions: MaskAction[] = [];
const timelineEntries: TimelineEntry[] = [];
let currentTimelineStep = 0;
let timelineSliderSyncing = false;
let timelineRangeBound = false;
let timelineStepDirty = false;
resetTimelineToCurrentState();

function syncWireframeVisibility(): void {
  wireframeMesh.visible = shapeSettings.showWireframe || subdivisionWireframePreviewActive;
}

function setSubdivisionWireframePreview(active: boolean): void {
  if (subdivisionWireframePreviewActive === active) {
    return;
  }
  subdivisionWireframePreviewActive = active;
  syncWireframeVisibility();
}

function prepareGeometry(geometry: BufferGeometry): void {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position') as BufferAttribute;
  position.setUsage(DynamicDrawUsage);
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  normal.setUsage(DynamicDrawUsage);
}

function updateRangeProgress(range: HTMLInputElement): void {
  const min = Number.parseFloat(range.min);
  const max = Number.parseFloat(range.max);
  const value = Number.parseFloat(range.value);
  const span = max - min;
  const progress = span > 1e-8 ? ((value - min) / span) * 100 : 100;
  range.style.setProperty('--range-progress', `${progress}%`);
}

function setOverlayVisible(visible: boolean): void {
  const opacity = visible ? '1' : '0';
  ui.brushCircle.style.opacity = opacity;
  ui.brushDot.style.opacity = opacity;
  ui.falloffCircle.style.opacity = visible && shapeSettings.falloffOffset > 0 ? '1' : '0';
}

function setOverlayModeColors(eraseMode: boolean): void {
  const innerColor = eraseMode ? 'rgba(255, 72, 72, 0.98)' : 'rgba(102, 170, 255, 0.98)';
  const outerColor = eraseMode ? 'rgba(255, 72, 72, 0.72)' : 'rgba(102, 170, 255, 0.72)';
  ui.brushCircle.style.stroke = innerColor;
  ui.brushDot.style.fill = innerColor;
  ui.falloffCircle.style.stroke = outerColor;
}

function worldToScreen(worldPoint: Vector3): Vector2 {
  tempVec.copy(worldPoint).project(camera);
  tempScreen.set(
    (tempVec.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
    (-tempVec.y * 0.5 + 0.5) * renderer.domElement.clientHeight,
  );
  return tempScreen.clone();
}

function updateOverlay(hitPoint: Vector3 | null, faceNormal: Vector3 | null, eraseMode: boolean): void {
  if (!hitPoint || !faceNormal || appState.running || appState.viewMode !== 'mask') {
    setOverlayVisible(false);
    return;
  }

  const center = worldToScreen(hitPoint);
  tempNormal.copy(faceNormal).transformDirection(mesh.matrixWorld).normalize();
  const fallback = Math.abs(tempNormal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  tempTangent.crossVectors(tempNormal, fallback).normalize();

  const edgePoint = tempVec.copy(hitPoint).addScaledVector(tempTangent, shapeSettings.brushRadius);
  const edge = worldToScreen(edgePoint);
  const innerRadius = Math.hypot(edge.x - center.x, edge.y - center.y);

  const outerWorldRadius = shapeSettings.brushRadius + shapeSettings.falloffOffset;
  const outerEdgePoint = tempVec.copy(hitPoint).addScaledVector(tempTangent, outerWorldRadius);
  const outerEdge = worldToScreen(outerEdgePoint);
  const outerRadius = Math.max(innerRadius, Math.hypot(outerEdge.x - center.x, outerEdge.y - center.y));

  ui.overlay.setAttribute('width', `${renderer.domElement.clientWidth}`);
  ui.overlay.setAttribute('height', `${renderer.domElement.clientHeight}`);
  ui.brushCircle.setAttribute('cx', `${center.x}`);
  ui.brushCircle.setAttribute('cy', `${center.y}`);
  ui.brushCircle.setAttribute('r', `${innerRadius}`);
  ui.falloffCircle.setAttribute('cx', `${center.x}`);
  ui.falloffCircle.setAttribute('cy', `${center.y}`);
  ui.falloffCircle.setAttribute('r', `${outerRadius}`);
  ui.brushDot.setAttribute('cx', `${center.x}`);
  ui.brushDot.setAttribute('cy', `${center.y}`);
  ui.brushDot.setAttribute('r', '4');
  setOverlayModeColors(eraseMode);
  setOverlayVisible(true);
}

function refreshMaskOverlay(): void {
  if (appState.running || appState.viewMode !== 'mask') {
    setOverlayVisible(false);
    return;
  }
  const hit = currentHit();
  if (hit) {
    updateOverlay(hit.point, hit.normal, shiftDown);
  } else {
    setOverlayVisible(false);
  }
}

function updatePointer(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function currentHit(): { point: Vector3; normal: Vector3 } | null {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(mesh, false);
  const hit = hits[0];
  if (!hit || !hit.face) {
    return null;
  }
  return {
    point: hit.point.clone(),
    normal: hit.face.normal.clone(),
  };
}

function isPanelTarget(event: Event): boolean {
  return event.target instanceof Element && event.target.closest('#ui-panel') !== null;
}

function paintAt(hitPoint: Vector3): void {
  tempLocal.copy(hitPoint);
  mesh.worldToLocal(tempLocal);
  const point = tempLocal.clone();
  engine.paintMask(point, shapeSettings.brushRadius, shapeSettings.falloffOffset);
  timelineStepDirty = true;
  maskActions.push({
    kind: 'paint',
    point,
    radius: shapeSettings.brushRadius,
    falloffOffset: shapeSettings.falloffOffset,
  });
}

function eraseAt(hitPoint: Vector3): void {
  tempLocal.copy(hitPoint);
  mesh.worldToLocal(tempLocal);
  const point = tempLocal.clone();
  engine.eraseMask(point, shapeSettings.brushRadius, shapeSettings.falloffOffset);
  timelineStepDirty = true;
  maskActions.push({
    kind: 'erase',
    point,
    radius: shapeSettings.brushRadius,
    falloffOffset: shapeSettings.falloffOffset,
  });
}

function replayMaskActions(): void {
  for (let i = 0; i < maskActions.length; i += 1) {
    const action = maskActions[i];
    if (action.kind === 'paint') {
      engine.paintMask(action.point, action.radius, action.falloffOffset);
    } else if (action.kind === 'erase') {
      engine.eraseMask(action.point, action.radius, action.falloffOffset);
    } else if (action.kind === 'blur') {
      engine.blurMask(action.strength);
    }
  }
}

function clearMaskActionHistory(): void {
  maskActions.length = 0;
}

function disposeSnapshot(snapshot: DifferentialGrowthSnapshot): void {
  snapshot.geometry.dispose();
}

function findTimelineEntryIndex(step: number): number {
  for (let i = 0; i < timelineEntries.length; i += 1) {
    if (timelineEntries[i].step === step) {
      return i;
    }
  }
  return -1;
}

function syncTimelineSliderState(): void {
  const minStep = timelineEntries.length > 0 ? timelineEntries[0].step : 0;
  const maxStep = timelineEntries.length > 0 ? timelineEntries[timelineEntries.length - 1].step : 0;
  ui.timeline.min = `${minStep}`;
  ui.timeline.max = `${maxStep}`;
  currentTimelineStep = Math.min(maxStep, Math.max(minStep, currentTimelineStep));
  ui.timeline.disabled = appState.running || minStep === maxStep;

  if (timelineRangeBound) {
    timelineSliderSyncing = true;
    ui.timeline.value = `${currentTimelineStep}`;
    ui.timeline.dispatchEvent(new Event('input', { bubbles: true }));
    timelineSliderSyncing = false;
    return;
  }

  ui.timeline.value = `${currentTimelineStep}`;
  ui.timelineValue.textContent = `${currentTimelineStep}`;
  updateRangeProgress(ui.timeline);
}

function resetTimelineToCurrentState(): void {
  for (let i = 0; i < timelineEntries.length; i += 1) {
    disposeSnapshot(timelineEntries[i].snapshot);
  }
  timelineEntries.length = 0;
  currentTimelineStep = 0;
  timelineEntries.push({
    step: currentTimelineStep,
    snapshot: engine.exportSnapshot(),
  });
  timelineStepDirty = false;
  syncTimelineSliderState();
}

function trimTimelineFutureFromCurrentStep(): void {
  const keepIndex = findTimelineEntryIndex(currentTimelineStep);
  if (keepIndex < 0 || keepIndex >= timelineEntries.length - 1) {
    return;
  }
  for (let i = keepIndex + 1; i < timelineEntries.length; i += 1) {
    disposeSnapshot(timelineEntries[i].snapshot);
  }
  timelineEntries.length = keepIndex + 1;
}

function commitCurrentTimelineSnapshotIfDirty(): void {
  if (appState.running || !timelineStepDirty) {
    return;
  }
  const entryIndex = findTimelineEntryIndex(currentTimelineStep);
  if (entryIndex < 0) {
    timelineStepDirty = false;
    return;
  }

  if (finalSmoothingSource) {
    engine.applyFinalSmoothingFromSnapshot(finalSmoothingSource, 0);
    syncGeometryWithEngine();
  }

  const previous = timelineEntries[entryIndex].snapshot;
  timelineEntries[entryIndex].snapshot = engine.exportSnapshot();
  disposeSnapshot(previous);

  if (finalSmoothingSource) {
    engine.applyFinalSmoothingFromSnapshot(finalSmoothingSource, finalSmoothingAmount);
    syncGeometryWithEngine();
  }

  timelineStepDirty = false;
}

function appendTimelineStepFromCurrentState(): void {
  const last = timelineEntries[timelineEntries.length - 1];
  const nextStep = last ? last.step + 1 : currentTimelineStep + 1;
  timelineEntries.push({
    step: nextStep,
    snapshot: engine.exportSnapshot(),
  });
  currentTimelineStep = nextStep;
  timelineStepDirty = false;

  while (timelineEntries.length > MAX_TIMELINE_SNAPSHOTS) {
    const removed = timelineEntries.shift();
    if (!removed) {
      break;
    }
    disposeSnapshot(removed.snapshot);
  }

  syncTimelineSliderState();
}

function seekTimelineStep(step: number): void {
  if (appState.running) {
    return;
  }
  const entryIndex = findTimelineEntryIndex(step);
  if (entryIndex < 0) {
    syncTimelineSliderState();
    return;
  }

  engine.importSnapshot(timelineEntries[entryIndex].snapshot);
  syncGeometryWithEngine();
  currentTimelineStep = timelineEntries[entryIndex].step;
  finalSmoothingSource = engine.getPositionSnapshot();
  applyFinalSmoothingPreview();
  timelineStepDirty = false;
  syncTimelineSliderState();
  refreshMaskOverlay();
}

function syncGeometryWithEngine(): void {
  const activeGeometry = engine.getGeometry();
  if (mesh.geometry === activeGeometry) {
    return;
  }
  const previous = mesh.geometry;
  mesh.geometry = activeGeometry;
  wireframeMesh.geometry = activeGeometry;
  previous.dispose();
}

function applyFinalSmoothingPreview(): void {
  if (appState.running) {
    return;
  }
  if (!finalSmoothingSource) {
    finalSmoothingSource = engine.getPositionSnapshot();
  }
  engine.applyFinalSmoothingFromSnapshot(finalSmoothingSource, finalSmoothingAmount);
  syncGeometryWithEngine();
}

function setViewMode(mode: ViewMode): void {
  appState.viewMode = mode;
  materialController.setViewMode(mode);
  ui.maskMode.classList.toggle('is-mask-active', mode === 'mask');
}

function startSimulation(): void {
  commitCurrentTimelineSnapshotIfDirty();
  trimTimelineFutureFromCurrentStep();
  if (finalSmoothingSource) {
    engine.applyFinalSmoothingFromSnapshot(finalSmoothingSource, 0);
    syncGeometryWithEngine();
  }
  finalSmoothingSource = null;
  appState.running = true;
  setViewMode('curvature');
  syncUiState();
}

function stopSimulation(): void {
  appState.running = false;
  finalSmoothingSource = engine.getPositionSnapshot();
  applyFinalSmoothingPreview();
  syncUiState();
}

function enterMaskMode(): void {
  appState.running = false;
  if (!finalSmoothingSource) {
    finalSmoothingSource = engine.getPositionSnapshot();
  }
  applyFinalSmoothingPreview();
  setViewMode('mask');
  syncUiState();
  refreshMaskOverlay();
}

function exitMaskMode(): void {
  setViewMode('curvature');
  syncUiState();
}

function resetSimulation(preserveMask = true): void {
  if (!preserveMask) {
    clearMaskActionHistory();
  }
  const nextGeometry = buildScaledShapeGeometry();
  prepareGeometry(nextGeometry);
  const previousGeometry = mesh.geometry;
  mesh.geometry = nextGeometry;
  wireframeMesh.geometry = nextGeometry;
  previousGeometry.dispose();
  engine.reseed(simulationSettings.seed);
  engine.setGeometry(nextGeometry);
  if (preserveMask && maskActions.length > 0) {
    replayMaskActions();
  }
  syncGeometryWithEngine();
  resetTimelineToCurrentState();
  if (appState.running) {
    finalSmoothingSource = null;
  } else {
    finalSmoothingSource = engine.getPositionSnapshot();
    applyFinalSmoothingPreview();
  }
  controls.update();
  setOverlayVisible(false);
  if (appState.viewMode === 'mask') {
    setViewMode('mask');
  } else {
    setViewMode('curvature');
  }
}

function syncUiState(): void {
  ui.start.textContent = appState.running ? 'Pause' : 'Start';
  ui.start.classList.toggle('is-start-state', !appState.running);
  ui.start.classList.toggle('is-stop-state', appState.running);
  ui.maskMode.textContent = appState.viewMode === 'mask' ? 'Exit Mask Mode' : 'Enter Mask Mode';
  syncTimelineSliderState();
  if (appState.running) {
    setOverlayVisible(false);
  }
}

function scheduleShapeReset(): void {
  if (!controlsInitialized || shapeResetQueued) {
    return;
  }
  shapeResetQueued = true;
  requestAnimationFrame(() => {
    shapeResetQueued = false;
    resetSimulation(false);
  });
}

function clampPanelToViewport(): void {
  const margin = 10;
  const rootStyles = getComputedStyle(document.documentElement);
  const menuScaleRaw = rootStyles.getPropertyValue('--menu-scale').trim();
  const parsedMenuScale = Number.parseFloat(menuScaleRaw);
  const menuScale = Number.isFinite(parsedMenuScale) && parsedMenuScale > 0 ? parsedMenuScale : 1;
  const scaledPanelHeight = ui.panel.offsetHeight * menuScale;
  const scaledPanelWidth = ui.panel.offsetWidth * menuScale;
  const maxTop = Math.max(margin, window.innerHeight - scaledPanelHeight - margin);
  const maxLeft = Math.max(margin, window.innerWidth - scaledPanelWidth - margin);
  const top = Math.min(Math.max(ui.panel.offsetTop, margin), maxTop);
  const left = Math.min(Math.max(ui.panel.offsetLeft, margin), maxLeft);
  ui.panel.style.top = `${top}px`;
  ui.panel.style.left = `${left}px`;
  ui.panel.style.right = 'auto';
}

function handleResize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = getPixelRatio();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  composer.setSize(width, height);
  composer.setPixelRatio(pixelRatio);
  bloomPass.setSize(width, height);
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (width * pixelRatio),
    1 / (height * pixelRatio),
  );
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  ui.overlay.setAttribute('width', `${width}`);
  ui.overlay.setAttribute('height', `${height}`);
  clampPanelToViewport();
}

function bindRange(
  input: HTMLInputElement,
  valueLabel: HTMLSpanElement,
  format: (value: number) => string,
  onInput: (value: number) => void,
): void {
  const stepDecimals = (stepValue: string): number => {
    if (!stepValue || stepValue === 'any') {
      return 6;
    }
    const normalized = stepValue.toLowerCase();
    const expIndex = normalized.indexOf('e-');
    if (expIndex >= 0) {
      const expDigits = Number.parseInt(normalized.slice(expIndex + 2), 10);
      return Number.isFinite(expDigits) ? expDigits : 6;
    }
    const dotIndex = stepValue.indexOf('.');
    return dotIndex >= 0 ? stepValue.length - dotIndex - 1 : 0;
  };

  const commitManualValue = (rawValue: string): void => {
    let next = Number.parseFloat(rawValue);
    if (!Number.isFinite(next)) {
      update();
      return;
    }

    const min = Number.parseFloat(input.min);
    const max = Number.parseFloat(input.max);
    if (Number.isFinite(min)) {
      next = Math.max(min, next);
    }
    if (Number.isFinite(max)) {
      next = Math.min(max, next);
    }

    const parsedStep = Number.parseFloat(input.step);
    if (Number.isFinite(parsedStep) && parsedStep > 0) {
      const base = Number.isFinite(min) ? min : 0;
      next = base + Math.round((next - base) / parsedStep) * parsedStep;
      if (Number.isFinite(min)) {
        next = Math.max(min, next);
      }
      if (Number.isFinite(max)) {
        next = Math.min(max, next);
      }
    }

    input.value = next.toFixed(stepDecimals(input.step));
    update();
  };

  let isManualEditing = false;
  const beginManualEdit = (): void => {
    if (isManualEditing) {
      return;
    }
    isManualEditing = true;

    const editor = document.createElement('input');
    editor.type = 'number';
    editor.className = 'value-editor';
    editor.value = input.value;
    if (input.min) {
      editor.min = input.min;
    }
    if (input.max) {
      editor.max = input.max;
    }
    if (input.step) {
      editor.step = input.step;
    }

    valueLabel.replaceWith(editor);
    editor.focus();
    editor.select();

    let finalized = false;
    const finish = (commit: boolean): void => {
      if (finalized) {
        return;
      }
      finalized = true;
      const submitted = editor.value;
      editor.replaceWith(valueLabel);
      isManualEditing = false;
      if (commit) {
        commitManualValue(submitted);
      } else {
        update();
      }
    };

    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    editor.addEventListener('blur', () => {
      finish(true);
    });
  };

  valueLabel.addEventListener('click', (event) => {
    event.stopPropagation();
    beginManualEdit();
  });

  const update = (): void => {
    const value = Number.parseFloat(input.value);
    valueLabel.textContent = format(value);
    updateRangeProgress(input);
    onInput(value);
  };
  input.addEventListener('input', update);
  update();
}

function bindSectionCollapseToggles(): void {
  const headers = ui.panel.querySelectorAll<HTMLDivElement>('.panel-section-header');
  headers.forEach((header) => {
    const section = header.closest('.panel-section');
    if (!section) {
      return;
    }

    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', section.classList.contains('is-collapsed') ? 'false' : 'true');

    const toggle = (): void => {
      const collapsed = section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  });
}

function bindCustomSelect(select: HTMLSelectElement): void {
  const control = select.closest('.select-control');
  const shell = control?.querySelector('.select-shell');
  if (!control || !shell) {
    return;
  }
  select.classList.add('native-select-hidden');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'select-trigger';
  trigger.id = `${select.id}-trigger`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('ul');
  menu.className = 'select-menu';
  menu.id = `${select.id}-menu`;
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-labelledby', trigger.id);

  type OptionButton = HTMLButtonElement & { dataset: DOMStringMap & { value: string; index: string } };
  const optionButtons: OptionButton[] = [];
  const optionValues = Array.from(select.options).map((option) => option.value);

  const buildOptionButton = (index: number, label: string, value: string): OptionButton => {
    const item = document.createElement('li');
    const button = document.createElement('button') as OptionButton;
    button.type = 'button';
    button.className = 'select-option';
    button.dataset.value = value;
    button.dataset.index = `${index}`;
    button.textContent = label;
    button.setAttribute('role', 'option');
    item.appendChild(button);
    menu.appendChild(item);
    return button;
  };

  Array.from(select.options).forEach((option, index) => {
    const button = buildOptionButton(index, option.textContent ?? option.value, option.value);
    optionButtons.push(button);
  });

  let activeIndex = Math.max(0, optionValues.indexOf(select.value));

  const setOpen = (open: boolean): void => {
    control.classList.toggle('is-open', open);
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const updateSelectionUi = (): void => {
    const selectedIndex = Math.max(0, optionValues.indexOf(select.value));
    const selectedButton = optionButtons[selectedIndex];
    trigger.textContent = selectedButton?.textContent ?? select.value;
    optionButtons.forEach((button, index) => {
      const selected = index === selectedIndex;
      const active = index === activeIndex;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
  };

  const setActiveIndex = (index: number): void => {
    if (optionButtons.length === 0) {
      return;
    }
    const count = optionButtons.length;
    activeIndex = ((index % count) + count) % count;
    updateSelectionUi();
  };

  const chooseIndex = (index: number): void => {
    const nextValue = optionValues[index];
    if (nextValue === undefined) {
      return;
    }
    const changed = select.value !== nextValue;
    select.value = nextValue;
    activeIndex = index;
    updateSelectionUi();
    setOpen(false);
    if (changed) {
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const openMenu = (focusOption = false): void => {
    setActiveIndex(Math.max(0, optionValues.indexOf(select.value)));
    setOpen(true);
    if (focusOption) {
      optionButtons[activeIndex]?.focus();
    }
  };

  select.addEventListener('change', () => {
    activeIndex = Math.max(0, optionValues.indexOf(select.value));
    updateSelectionUi();
    setOpen(false);
  });

  trigger.addEventListener('click', () => {
    if (control.classList.contains('is-open')) {
      setOpen(false);
    } else {
      openMenu();
    }
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!control.classList.contains('is-open')) {
        openMenu(true);
      } else {
        setActiveIndex(activeIndex + 1);
        optionButtons[activeIndex]?.focus();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!control.classList.contains('is-open')) {
        openMenu(true);
      } else {
        setActiveIndex(activeIndex - 1);
        optionButtons[activeIndex]?.focus();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (control.classList.contains('is-open')) {
        chooseIndex(activeIndex);
      } else {
        openMenu(true);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  });

  optionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number.parseInt(button.dataset.index, 10);
      chooseIndex(index);
      trigger.focus();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(activeIndex + 1);
        optionButtons[activeIndex]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(activeIndex - 1);
        optionButtons[activeIndex]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseIndex(activeIndex);
        trigger.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.focus();
      } else if (event.key === 'Tab') {
        setOpen(false);
      }
    });
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node) || !control.contains(target)) {
      setOpen(false);
    }
  });

  shell.prepend(menu);
  shell.prepend(trigger);
  updateSelectionUi();
}

bindSectionCollapseToggles();
bindCustomSelect(ui.baseShape);
bindCustomSelect(ui.transformOrder);
bindCustomSelect(ui.gradientType);

bindRange(ui.growthSpeed, ui.growthSpeedValue, (value) => value.toFixed(2), (value) => {
  simulationSettings.growthSpeed = value;
});
bindRange(ui.timeline, ui.timelineValue, (value) => `${Math.round(value)}`, (value) => {
  const requestedStep = Math.round(value);
  if (timelineSliderSyncing) {
    return;
  }
  if (appState.running) {
    syncTimelineSliderState();
    return;
  }
  if (requestedStep === currentTimelineStep) {
    return;
  }
  commitCurrentTimelineSnapshotIfDirty();
  seekTimelineStep(requestedStep);
});
timelineRangeBound = true;
syncTimelineSliderState();
bindRange(ui.seed, ui.seedValueLabel, (value) => `${Math.round(value)}`, (value) => {
  simulationSettings.seed = Math.round(value);
  engine.reseed(simulationSettings.seed);
  if (!appState.running) {
    resetSimulation();
  }
});
bindRange(ui.seedInfluence, ui.seedInfluenceValue, (value) => value.toFixed(2), (value) => {
  simulationSettings.seedInfluence = value;
});
bindRange(ui.subdivision, ui.subdivisionValue, (value) => `${Math.round(value)}`, (value) => {
  shapeSettings.subdivision = Math.round(value);
  scheduleShapeReset();
});
bindRange(ui.scaleX, ui.scaleXValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.scaleX = value;
  scheduleShapeReset();
});
bindRange(ui.scaleY, ui.scaleYValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.scaleY = value;
  scheduleShapeReset();
});
bindRange(ui.scaleZ, ui.scaleZValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.scaleZ = value;
  scheduleShapeReset();
});
bindRange(ui.rotateX, ui.rotateXValue, (value) => `${Math.round(value)}`, (value) => {
  shapeSettings.rotateX = value;
  scheduleShapeReset();
});
bindRange(ui.rotateY, ui.rotateYValue, (value) => `${Math.round(value)}`, (value) => {
  shapeSettings.rotateY = value;
  scheduleShapeReset();
});
bindRange(ui.rotateZ, ui.rotateZValue, (value) => `${Math.round(value)}`, (value) => {
  shapeSettings.rotateZ = value;
  scheduleShapeReset();
});
bindRange(ui.brushRadius, ui.brushRadiusValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.brushRadius = value;
});
bindRange(ui.falloffOffset, ui.falloffOffsetValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.falloffOffset = value;
});
bindRange(ui.growthStep, ui.growthStepValue, (value) => value.toFixed(2), (value) => {
  growthSettings.growthStep = value;
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.targetEdgeLength, ui.targetEdgeLengthValue, (value) => value.toFixed(3), (value) => {
  growthSettings.targetEdgeLength = value;
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.splitThreshold, ui.splitThresholdValue, (value) => value.toFixed(2), (value) => {
  growthSettings.splitThreshold = value;
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.repulsion, ui.repulsionValue, (value) => value.toFixed(2), (value) => {
  growthSettings.repulsion = value;
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.smoothing, ui.smoothingValue, (value) => value.toFixed(2), (value) => {
  growthSettings.smoothing = value;
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.finalSmoothing, ui.finalSmoothingValue, (value) => value.toFixed(2), (value) => {
  finalSmoothingAmount = value;
  if (!appState.running) {
    applyFinalSmoothingPreview();
  }
});
bindRange(ui.shapeRetention, ui.shapeRetentionValue, (value) => value.toFixed(2), (value) => {
  growthSettings.shapeRetention = value;
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.maxVertices, ui.maxVerticesValue, (value) => `${Math.round(value)}`, (value) => {
  growthSettings.maxVertices = Math.round(value);
  engine.setGrowthSettings(growthSettings);
});
bindRange(ui.curvatureContrast, ui.curvatureContrastValue, (value) => value.toFixed(2), (value) => {
  materialSettings.curvatureContrast = value;
  materialController.setMaterialSettings(materialSettings);
});
bindRange(ui.curvatureBias, ui.curvatureBiasValue, (value) => value.toFixed(2), (value) => {
  materialSettings.curvatureBias = value;
  materialController.setMaterialSettings(materialSettings);
});
bindRange(ui.gradientBlur, ui.gradientBlurValue, (value) => value.toFixed(2), (value) => {
  materialSettings.gradientBlur = value;
  engine.setGradientBlur(value);
});
bindRange(ui.fresnel, ui.fresnelValue, (value) => value.toFixed(2), (value) => {
  materialSettings.fresnel = value;
  materialController.setMaterialSettings(materialSettings);
});
bindRange(ui.specular, ui.specularValue, (value) => value.toFixed(2), (value) => {
  materialSettings.specular = value;
  materialController.setMaterialSettings(materialSettings);
});
bindRange(ui.bloom, ui.bloomValue, (value) => value.toFixed(2), (value) => {
  materialSettings.bloom = value;
  bloomPass.strength = value;
});

ui.gradientStart.addEventListener('input', () => {
  materialSettings.gradientStart = ui.gradientStart.value;
  materialController.setMaterialSettings(materialSettings);
});
ui.gradientEnd.addEventListener('input', () => {
  materialSettings.gradientEnd = ui.gradientEnd.value;
  materialController.setMaterialSettings(materialSettings);
});
ui.gradientType.addEventListener('change', () => {
  materialSettings.gradientType = ui.gradientType.value as GradientType;
  materialController.setMaterialSettings(materialSettings);
});

ui.baseShape.addEventListener('change', () => {
  shapeSettings.baseShape = ui.baseShape.value as BaseShape;
  resetSimulation(false);
});
ui.transformOrder.addEventListener('change', () => {
  shapeSettings.transformOrder = ui.transformOrder.value as TransformOrder;
  resetSimulation(false);
});
ui.subdivision.addEventListener('pointerdown', () => {
  setSubdivisionWireframePreview(true);
});
ui.subdivision.addEventListener('input', () => {
  setSubdivisionWireframePreview(true);
});
ui.subdivision.addEventListener('keydown', () => {
  setSubdivisionWireframePreview(true);
});
ui.subdivision.addEventListener('keyup', () => {
  setSubdivisionWireframePreview(false);
});
ui.subdivision.addEventListener('change', () => {
  setSubdivisionWireframePreview(false);
});
ui.subdivision.addEventListener('blur', () => {
  setSubdivisionWireframePreview(false);
});
ui.showWireframe.addEventListener('change', () => {
  shapeSettings.showWireframe = ui.showWireframe.checked;
  syncWireframeVisibility();
});
ui.showMesh.addEventListener('change', () => {
  shapeSettings.showMesh = ui.showMesh.checked;
  mesh.visible = shapeSettings.showMesh;
});

const setRangeValue = (input: HTMLInputElement, value: number): void => {
  input.value = `${value}`;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

ui.resetSubdivision.addEventListener('click', () => {
  const defaultSubdivision = Number.parseFloat(ui.subdivision.defaultValue);
  setRangeValue(ui.subdivision, Number.isFinite(defaultSubdivision) ? defaultSubdivision : 1);
  setSubdivisionWireframePreview(false);
});

ui.resetTransform.addEventListener('click', () => {
  setRangeValue(ui.scaleX, 1);
  setRangeValue(ui.scaleY, 1);
  setRangeValue(ui.scaleZ, 1);
  setRangeValue(ui.rotateX, 0);
  setRangeValue(ui.rotateY, 0);
  setRangeValue(ui.rotateZ, 0);
});

ui.start.addEventListener('click', () => {
  if (appState.running) {
    stopSimulation();
  } else {
    startSimulation();
  }
});

ui.maskMode.addEventListener('click', () => {
  if (appState.viewMode === 'mask') {
    exitMaskMode();
  } else {
    enterMaskMode();
  }
});

ui.reset.addEventListener('click', () => {
  resetSimulation();
});

ui.blurMask.addEventListener('click', () => {
  if (appState.running) {
    stopSimulation();
  }
  engine.blurMask(FIXED_MASK_BLUR_STRENGTH);
  timelineStepDirty = true;
  maskActions.push({ kind: 'blur', strength: FIXED_MASK_BLUR_STRENGTH });
  enterMaskMode();
});

ui.clearMask.addEventListener('click', () => {
  if (appState.running) {
    stopSimulation();
  }
  engine.clearMask();
  timelineStepDirty = true;
  clearMaskActionHistory();
  enterMaskMode();
});

ui.collapseToggle.addEventListener('pointerdown', (event) => {
  event.stopPropagation();
});
ui.collapseToggle.addEventListener('click', () => {
  const collapsed = ui.panel.classList.toggle('is-collapsed');
  ui.collapseToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
});

const beginPanelDrag = (event: PointerEvent): void => {
  if (event.target instanceof Element && event.target.closest('.collapse-button')) {
    return;
  }
  draggingPanel = true;
  const rect = ui.panel.getBoundingClientRect();
  ui.panel.style.left = `${rect.left}px`;
  ui.panel.style.top = `${rect.top}px`;
  ui.panel.style.right = 'auto';
  ui.panel.style.bottom = 'auto';
  dragOffset.x = event.clientX - rect.left;
  dragOffset.y = event.clientY - rect.top;
};

ui.handleTop.addEventListener('pointerdown', beginPanelDrag);
ui.handleBottom.addEventListener('pointerdown', beginPanelDrag);
window.addEventListener('pointermove', (event) => {
  if (!draggingPanel) {
    return;
  }
  const x = event.clientX - dragOffset.x;
  const y = event.clientY - dragOffset.y;
  ui.panel.style.left = `${x}px`;
  ui.panel.style.top = `${y}px`;
  clampPanelToViewport();
});
window.addEventListener('pointerup', () => {
  setSubdivisionWireframePreview(false);
  draggingPanel = false;
});
window.addEventListener('pointercancel', () => {
  setSubdivisionWireframePreview(false);
  draggingPanel = false;
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Shift') {
    return;
  }
  shiftDown = true;
  if (painting) {
    erasing = true;
  }
  refreshMaskOverlay();
});

window.addEventListener('keyup', (event) => {
  if (event.key !== 'Shift') {
    return;
  }
  shiftDown = false;
  if (painting) {
    erasing = false;
  }
  refreshMaskOverlay();
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (isPanelTarget(event)) {
    return;
  }

  shiftDown = event.shiftKey;
  updatePointer(event);
  const hit = currentHit();
  const eraseMode = !appState.running && appState.viewMode === 'mask' && shiftDown;
  if (hit) {
    updateOverlay(hit.point, hit.normal, eraseMode);
  } else {
    setOverlayVisible(false);
  }

  const canMaskPaint = !appState.running && appState.viewMode === 'mask' && event.button === 0;
  if (canMaskPaint && hit) {
    pointerDown = true;
    painting = true;
    erasing = event.shiftKey;
    if (erasing) {
      eraseAt(hit.point);
    } else {
      paintAt(hit.point);
    }
  }
});

window.addEventListener('pointermove', (event) => {
  if (isPanelTarget(event)) {
    setOverlayVisible(false);
    return;
  }

  updatePointer(event);
  const hit = currentHit();
  shiftDown = event.shiftKey;

  if (pointerDown && painting && hit) {
    erasing = shiftDown;
    if (erasing) {
      eraseAt(hit.point);
    } else {
      paintAt(hit.point);
    }
  }

  if (hit) {
    const eraseMode = !appState.running && appState.viewMode === 'mask' && shiftDown;
    updateOverlay(hit.point, hit.normal, eraseMode);
  } else {
    setOverlayVisible(false);
  }
});

window.addEventListener('pointerup', (event) => {
  pointerDown = false;
  painting = false;
  erasing = false;
  shiftDown = event.shiftKey;
  updatePointer(event);
  const hit = currentHit();
  if (hit) {
    const eraseMode = !appState.running && appState.viewMode === 'mask' && shiftDown;
    updateOverlay(hit.point, hit.normal, eraseMode);
  } else {
    setOverlayVisible(false);
  }
});

window.addEventListener('pointercancel', () => {
  pointerDown = false;
  painting = false;
  erasing = false;
  shiftDown = false;
  setOverlayVisible(false);
});

window.addEventListener('resize', handleResize);

controlsInitialized = true;

let lastTime = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  controls.update();
  if (appState.running) {
    engine.step(dt, simulationSettings.growthSpeed, simulationSettings.seedInfluence);
    syncGeometryWithEngine();
    appendTimelineStepFromCurrentState();
  }

  composer.render();
});

syncUiState();
setViewMode('curvature');
handleResize();
