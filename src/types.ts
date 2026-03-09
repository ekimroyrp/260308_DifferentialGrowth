export type BaseShape = 'cube' | 'rounded-cube' | 'sphere' | 'quad-sphere' | 'torus';
export type ViewMode = 'curvature' | 'mask';
export type GradientType = 'curvature' | 'displacement';

export type SimulationSettings = {
  growthSpeed: number;
  seed: number;
  seedInfluence: number;
};

export type ShapeSettings = {
  baseShape: BaseShape;
  subdivision: number;
  showWireframe: boolean;
  showMesh: boolean;
  brushRadius: number;
  falloffOffset: number;
};

export type GrowthSettings = {
  growthStep: number;
  targetEdgeLength: number;
  splitThreshold: number;
  repulsion: number;
  smoothing: number;
  shapeRetention: number;
  maxVertices: number;
};

export type MaterialSettings = {
  gradientType: GradientType;
  gradientStart: string;
  gradientEnd: string;
  curvatureContrast: number;
  curvatureBias: number;
  fresnel: number;
  specular: number;
  bloom: number;
  exposure: number;
};

export type AppState = {
  running: boolean;
  viewMode: ViewMode;
};
