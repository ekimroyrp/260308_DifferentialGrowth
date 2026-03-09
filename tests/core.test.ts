import { describe, expect, it } from 'vitest';
import { BufferAttribute, Vector3 } from 'three';
import { DifferentialGrowthEngine } from '../src/core/differentialGrowthEngine';
import { buildShapeGeometry } from '../src/core/meshFactory';
import { MaterialController } from '../src/core/materialController';
import type { GrowthSettings, MaterialSettings } from '../src/types';

const growthSettings: GrowthSettings = {
  growthStep: 0.45,
  targetEdgeLength: 0.12,
  splitThreshold: 1.6,
  repulsion: 0.45,
  smoothing: 0.52,
  shapeRetention: 0.09,
  maxVertices: 50000,
};

const materialSettings: MaterialSettings = {
  gradientStart: '#9fd8ff',
  gradientEnd: '#2e4fb4',
  curvatureContrast: 1.25,
  curvatureBias: 0,
  fresnel: 0.6,
  specular: 0.6,
  bloom: 0.28,
  exposure: 1.1,
};

describe('DifferentialGrowthEngine mask operations', () => {
  it('paints non-zero mask values and keeps them in [0, 1]', () => {
    const geometry = buildShapeGeometry('sphere');
    const engine = new DifferentialGrowthEngine(geometry, growthSettings, 123);
    engine.paintMask(new Vector3(0, 0, 1.15), 0.24, 0.14);

    const maskAttr = geometry.getAttribute('aMask') as BufferAttribute;
    const mask = maskAttr.array as Float32Array;
    const max = Math.max(...mask);
    const min = Math.min(...mask);

    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(0);
  });

  it('blurMask keeps values bounded and clearMask resets to zero', () => {
    const geometry = buildShapeGeometry('sphere');
    const engine = new DifferentialGrowthEngine(geometry, growthSettings, 456);
    engine.paintMask(new Vector3(0, 0, 1.15), 0.24, 0.14);
    engine.blurMask(0.7);

    const maskAttr = geometry.getAttribute('aMask') as BufferAttribute;
    const mask = maskAttr.array as Float32Array;
    const maxAfterBlur = Math.max(...mask);
    const minAfterBlur = Math.min(...mask);
    expect(maxAfterBlur).toBeLessThanOrEqual(1);
    expect(minAfterBlur).toBeGreaterThanOrEqual(0);

    engine.clearMask();
    const maxAfterClear = Math.max(...(maskAttr.array as Float32Array));
    expect(maxAfterClear).toBe(0);
  });
});

describe('DifferentialGrowthEngine adaptive splitting', () => {
  it('subdivides geometry when long edges exceed split threshold and under maxVertices', () => {
    const geometry = buildShapeGeometry('sphere');
    const initialCount = geometry.getAttribute('position').count;
    const engine = new DifferentialGrowthEngine(
      geometry,
      {
        ...growthSettings,
        targetEdgeLength: 0.02,
        splitThreshold: 1.2,
        maxVertices: 100000,
      },
      12,
    );

    engine.step(0.016, 1);
    const nextCount = engine.getGeometry().getAttribute('position').count;
    expect(nextCount).toBeGreaterThan(initialCount);
  });

  it('does not subdivide when maxVertices cap is too low', () => {
    const geometry = buildShapeGeometry('sphere');
    const initialCount = geometry.getAttribute('position').count;
    const engine = new DifferentialGrowthEngine(
      geometry,
      {
        ...growthSettings,
        targetEdgeLength: 0.02,
        splitThreshold: 1.2,
        maxVertices: initialCount + 10,
      },
      16,
    );

    engine.step(0.016, 1);
    const nextCount = engine.getGeometry().getAttribute('position').count;
    expect(nextCount).toBe(initialCount);
  });
});

describe('MaterialController', () => {
  it('switches to mask view mode', () => {
    const controller = new MaterialController(materialSettings);
    controller.setViewMode('mask');
    expect(controller.material.uniforms.uViewMode.value).toBe(1);
    controller.dispose();
  });
});
