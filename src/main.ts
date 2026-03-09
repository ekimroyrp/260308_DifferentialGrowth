import './style.css';
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  MOUSE,
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
import { DifferentialGrowthEngine } from './core/differentialGrowthEngine';
import { buildShapeGeometry } from './core/meshFactory';
import { MaterialController } from './core/materialController';
import type { AppState, BaseShape, GrowthSettings, MaterialSettings, ShapeSettings, SimulationSettings, ViewMode } from './types';

type UiRefs = {
  panel: HTMLDivElement;
  handleTop: HTMLDivElement;
  handleBottom: HTMLDivElement;
  collapseToggle: HTMLButtonElement;
  start: HTMLButtonElement;
  maskMode: HTMLButtonElement;
  reset: HTMLButtonElement;
  blurMask: HTMLButtonElement;
  clearMask: HTMLButtonElement;
  growthSpeed: HTMLInputElement;
  growthSpeedValue: HTMLSpanElement;
  seed: HTMLInputElement;
  seedValueLabel: HTMLSpanElement;
  baseShape: HTMLSelectElement;
  brushRadius: HTMLInputElement;
  brushRadiusValue: HTMLSpanElement;
  falloffOffset: HTMLInputElement;
  falloffOffsetValue: HTMLSpanElement;
  blurMaskStrength: HTMLInputElement;
  blurMaskValue: HTMLSpanElement;
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
  shapeRetention: HTMLInputElement;
  shapeRetentionValue: HTMLSpanElement;
  maxVertices: HTMLInputElement;
  maxVerticesValue: HTMLSpanElement;
  gradientStart: HTMLInputElement;
  gradientEnd: HTMLInputElement;
  curvatureContrast: HTMLInputElement;
  curvatureContrastValue: HTMLSpanElement;
  curvatureBias: HTMLInputElement;
  curvatureBiasValue: HTMLSpanElement;
  fresnel: HTMLInputElement;
  fresnelValue: HTMLSpanElement;
  specular: HTMLInputElement;
  specularValue: HTMLSpanElement;
  bloom: HTMLInputElement;
  bloomValue: HTMLSpanElement;
  exposure: HTMLInputElement;
  exposureValue: HTMLSpanElement;
  overlay: SVGSVGElement;
  brushCircle: SVGCircleElement;
  falloffCircle: SVGCircleElement;
  brushDot: SVGCircleElement;
};

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
  blurMask: requiredElement('blur-mask', isButton),
  clearMask: requiredElement('clear-mask', isButton),
  growthSpeed: requiredElement('growth-speed', isInput),
  growthSpeedValue: requiredElement('growth-speed-value', isSpan),
  seed: requiredElement('seed-value', isInput),
  seedValueLabel: requiredElement('seed-value-label', isSpan),
  baseShape: requiredElement('base-shape', isSelect),
  brushRadius: requiredElement('brush-radius', isInput),
  brushRadiusValue: requiredElement('brush-radius-value', isSpan),
  falloffOffset: requiredElement('falloff-offset', isInput),
  falloffOffsetValue: requiredElement('falloff-offset-value', isSpan),
  blurMaskStrength: requiredElement('blur-mask-strength', isInput),
  blurMaskValue: requiredElement('blur-mask-value', isSpan),
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
  shapeRetention: requiredElement('shape-retention', isInput),
  shapeRetentionValue: requiredElement('shape-retention-value', isSpan),
  maxVertices: requiredElement('max-vertices', isInput),
  maxVerticesValue: requiredElement('max-vertices-value', isSpan),
  gradientStart: requiredElement('gradient-start-color', isInput),
  gradientEnd: requiredElement('gradient-end-color', isInput),
  curvatureContrast: requiredElement('curvature-contrast', isInput),
  curvatureContrastValue: requiredElement('curvature-contrast-value', isSpan),
  curvatureBias: requiredElement('curvature-bias', isInput),
  curvatureBiasValue: requiredElement('curvature-bias-value', isSpan),
  fresnel: requiredElement('fresnel', isInput),
  fresnelValue: requiredElement('fresnel-value', isSpan),
  specular: requiredElement('specular', isInput),
  specularValue: requiredElement('specular-value', isSpan),
  bloom: requiredElement('bloom', isInput),
  bloomValue: requiredElement('bloom-value', isSpan),
  exposure: requiredElement('exposure', isInput),
  exposureValue: requiredElement('exposure-value', isSpan),
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
};

const shapeSettings: ShapeSettings = {
  baseShape: ui.baseShape.value as BaseShape,
  brushRadius: Number.parseFloat(ui.brushRadius.value),
  falloffOffset: Number.parseFloat(ui.falloffOffset.value),
  blurMaskStrength: Number.parseFloat(ui.blurMaskStrength.value),
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
  gradientStart: ui.gradientStart.value,
  gradientEnd: ui.gradientEnd.value,
  curvatureContrast: Number.parseFloat(ui.curvatureContrast.value),
  curvatureBias: Number.parseFloat(ui.curvatureBias.value),
  fresnel: Number.parseFloat(ui.fresnel.value),
  specular: Number.parseFloat(ui.specular.value),
  bloom: Number.parseFloat(ui.bloom.value),
  exposure: Number.parseFloat(ui.exposure.value),
};

const appState: AppState = {
  running: false,
  viewMode: 'curvature',
};

const renderer = new WebGLRenderer({ antialias: true, canvas });
const getPixelRatio = (): number => Math.min(window.devicePixelRatio * 1.5, 3);
renderer.setPixelRatio(getPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = materialSettings.exposure;

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

const materialController = new MaterialController(materialSettings);
const initialGeometry = buildShapeGeometry(shapeSettings.baseShape);
prepareGeometry(initialGeometry);
const mesh = new Mesh(initialGeometry, materialController.material);
scene.add(mesh);

const engine = new DifferentialGrowthEngine(initialGeometry, growthSettings, simulationSettings.seed);

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
  const progress = ((value - min) / (max - min)) * 100;
  range.style.setProperty('--range-progress', `${progress}%`);
}

function setOverlayVisible(visible: boolean): void {
  const opacity = visible ? '1' : '0';
  ui.brushCircle.style.opacity = opacity;
  ui.brushDot.style.opacity = opacity;
  ui.falloffCircle.style.opacity = visible && shapeSettings.falloffOffset > 0 ? '1' : '0';
}

function worldToScreen(worldPoint: Vector3): Vector2 {
  tempVec.copy(worldPoint).project(camera);
  tempScreen.set(
    (tempVec.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
    (-tempVec.y * 0.5 + 0.5) * renderer.domElement.clientHeight,
  );
  return tempScreen.clone();
}

function updateOverlay(hitPoint: Vector3 | null, faceNormal: Vector3 | null): void {
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
  setOverlayVisible(true);
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
  engine.paintMask(tempLocal, shapeSettings.brushRadius, shapeSettings.falloffOffset);
}

function setViewMode(mode: ViewMode): void {
  appState.viewMode = mode;
  materialController.setViewMode(mode);
  ui.maskMode.classList.toggle('is-mask-active', mode === 'mask');
}

function startSimulation(): void {
  appState.running = true;
  setViewMode('curvature');
  syncUiState();
}

function stopSimulation(): void {
  appState.running = false;
  syncUiState();
}

function enterMaskMode(): void {
  appState.running = false;
  setViewMode('mask');
  syncUiState();
}

function resetSimulation(): void {
  const nextGeometry = buildShapeGeometry(shapeSettings.baseShape);
  prepareGeometry(nextGeometry);
  mesh.geometry.dispose();
  mesh.geometry = nextGeometry;
  engine.setGeometry(nextGeometry);
  engine.reseed(simulationSettings.seed);
  controls.target.set(0, 0, 0);
  camera.position.set(0, 0.25, 4.2);
  controls.update();
  setOverlayVisible(false);
  if (appState.viewMode === 'mask') {
    setViewMode('mask');
  } else {
    setViewMode('curvature');
  }
}

function syncUiState(): void {
  ui.start.textContent = appState.running ? 'Stop' : 'Start';
  ui.start.classList.toggle('is-start-state', !appState.running);
  ui.start.classList.toggle('is-stop-state', appState.running);
  if (appState.running) {
    setOverlayVisible(false);
  }
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
  const update = (): void => {
    const value = Number.parseFloat(input.value);
    valueLabel.textContent = format(value);
    updateRangeProgress(input);
    onInput(value);
  };
  input.addEventListener('input', update);
  update();
}

bindRange(ui.growthSpeed, ui.growthSpeedValue, (value) => value.toFixed(2), (value) => {
  simulationSettings.growthSpeed = value;
});
bindRange(ui.seed, ui.seedValueLabel, (value) => `${Math.round(value)}`, (value) => {
  simulationSettings.seed = Math.round(value);
  engine.reseed(simulationSettings.seed);
  if (!appState.running) {
    resetSimulation();
  }
});
bindRange(ui.brushRadius, ui.brushRadiusValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.brushRadius = value;
});
bindRange(ui.falloffOffset, ui.falloffOffsetValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.falloffOffset = value;
});
bindRange(ui.blurMaskStrength, ui.blurMaskValue, (value) => value.toFixed(2), (value) => {
  shapeSettings.blurMaskStrength = value;
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
bindRange(ui.exposure, ui.exposureValue, (value) => value.toFixed(2), (value) => {
  materialSettings.exposure = value;
  renderer.toneMappingExposure = value;
});

ui.gradientStart.addEventListener('input', () => {
  materialSettings.gradientStart = ui.gradientStart.value;
  materialController.setMaterialSettings(materialSettings);
});
ui.gradientEnd.addEventListener('input', () => {
  materialSettings.gradientEnd = ui.gradientEnd.value;
  materialController.setMaterialSettings(materialSettings);
});

ui.baseShape.addEventListener('change', () => {
  shapeSettings.baseShape = ui.baseShape.value as BaseShape;
  resetSimulation();
});

ui.start.addEventListener('click', () => {
  if (appState.running) {
    stopSimulation();
  } else {
    startSimulation();
  }
});

ui.maskMode.addEventListener('click', () => {
  enterMaskMode();
});

ui.reset.addEventListener('click', () => {
  resetSimulation();
});

ui.blurMask.addEventListener('click', () => {
  if (appState.running) {
    stopSimulation();
  }
  engine.blurMask(shapeSettings.blurMaskStrength);
  enterMaskMode();
});

ui.clearMask.addEventListener('click', () => {
  if (appState.running) {
    stopSimulation();
  }
  engine.clearMask();
  if (appState.viewMode === 'mask') {
    setViewMode('mask');
  }
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
  draggingPanel = false;
});
window.addEventListener('pointercancel', () => {
  draggingPanel = false;
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || isPanelTarget(event)) {
    return;
  }
  pointerDown = true;
  updatePointer(event);
  const hit = currentHit();
  if (hit) {
    updateOverlay(hit.point, hit.normal);
  } else {
    setOverlayVisible(false);
  }

  if (!appState.running && appState.viewMode === 'mask' && hit) {
    painting = true;
    paintAt(hit.point);
  }
});

window.addEventListener('pointermove', (event) => {
  if (isPanelTarget(event)) {
    setOverlayVisible(false);
    return;
  }

  updatePointer(event);
  const hit = currentHit();

  if (pointerDown && painting && hit) {
    paintAt(hit.point);
  }

  if (hit) {
    updateOverlay(hit.point, hit.normal);
  } else {
    setOverlayVisible(false);
  }
});

window.addEventListener('pointerup', (event) => {
  pointerDown = false;
  painting = false;
  updatePointer(event);
  const hit = currentHit();
  if (hit) {
    updateOverlay(hit.point, hit.normal);
  } else {
    setOverlayVisible(false);
  }
});

window.addEventListener('pointercancel', () => {
  pointerDown = false;
  painting = false;
  setOverlayVisible(false);
});

window.addEventListener('resize', handleResize);

let lastTime = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  controls.update();
  if (appState.running) {
    engine.step(dt, simulationSettings.growthSpeed);
  }

  composer.render();
});

syncUiState();
setViewMode('curvature');
handleResize();
