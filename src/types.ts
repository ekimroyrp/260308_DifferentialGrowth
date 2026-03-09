export type BaseShape = 'cube' | 'sphere' | 'pyramid' | 'torus' | 'dodecahedron';
export type ViewMode = 'curvature' | 'mask';

export type SimulationSettings = {
  growthSpeed: number;
  seed: number;
};

export type ShapeSettings = {
  baseShape: BaseShape;
  brushRadius: number;
  falloffOffset: number;
  blurMaskStrength: number;
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
