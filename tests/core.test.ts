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
  gradientType: 'curvature',
  gradientStart: '#9fd8ff',
  gradientEnd: '#2e4fb4',
  curvatureContrast: 1.25,
  curvatureBias: 0,
  fresnel: 0.6,
  specular: 0.6,
  bloom: 0,
  exposure: 1.1,
};

describe('MeshFactory welding', () => {
  it('welds seam vertices for all base shapes', () => {
    const shapes = ['sphere', 'torus', 'cube'] as const;
    for (const shape of shapes) {
      const geometry = buildShapeGeometry(shape);
      const position = geometry.getAttribute('position') as BufferAttribute;
      const seen = new Set<string>();
      let duplicates = 0;
      for (let i = 0; i < position.count; i += 1) {
        const key = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
        if (seen.has(key)) {
          duplicates += 1;
        } else {
          seen.add(key);
        }
      }
      expect(duplicates).toBe(0);
      expect(geometry.index).toBeTruthy();
    }
  });
});

describe('DifferentialGrowthEngine mask operations', () => {
  it('updates normalized displacement attribute based on distance from base shape', () => {
    const geometry = buildShapeGeometry('sphere');
    const engine = new DifferentialGrowthEngine(geometry, growthSettings, 321);
    engine.step(0.02, 1.1);

    const displacementAttr = engine.getGeometry().getAttribute('aDisplacement') as BufferAttribute;
    const displacement = displacementAttr.array as Float32Array;
    const max = Math.max(...displacement);
    const min = Math.min(...displacement);

    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeGreaterThan(0);
  });

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

  it('black mask suppresses vertex movement in painted region during growth step', () => {
    const geometry = buildShapeGeometry('sphere');
    const engine = new DifferentialGrowthEngine(
      geometry,
      {
        ...growthSettings,
        growthStep: 0.6,
        repulsion: 0.8,
        smoothing: 0.8,
      },
      777,
    );

    engine.paintMask(new Vector3(0, 0, 1.15), 0.32, 0);
    const positionAttr = geometry.getAttribute('position') as BufferAttribute;
    const before = Float32Array.from(positionAttr.array as Float32Array);
    const mask = (geometry.getAttribute('aMask') as BufferAttribute).array as Float32Array;

    engine.step(0.02, 1.2);

    const after = positionAttr.array as Float32Array;
    let maxMove = 0;
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] < 0.99) {
        continue;
      }
      const idx = i * 3;
      const dx = after[idx] - before[idx];
      const dy = after[idx + 1] - before[idx + 1];
      const dz = after[idx + 2] - before[idx + 2];
      const move = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (move > maxMove) {
        maxMove = move;
      }
    }

    expect(maxMove).toBeLessThan(5e-5);
  });

  it('uniform gray mask scales movement proportionally', () => {
    const geometryA = buildShapeGeometry('sphere');
    const geometryB = geometryA.clone();
    geometryB.computeVertexNormals();
    const engineA = new DifferentialGrowthEngine(geometryA, growthSettings, 909);
    const engineB = new DifferentialGrowthEngine(geometryB, growthSettings, 909);

    const maskB = (geometryB.getAttribute('aMask') as BufferAttribute).array as Float32Array;
    maskB.fill(0.5);
    (geometryB.getAttribute('aMask') as BufferAttribute).needsUpdate = true;

    const beforeA = Float32Array.from((geometryA.getAttribute('position') as BufferAttribute).array as Float32Array);
    const beforeB = Float32Array.from((geometryB.getAttribute('position') as BufferAttribute).array as Float32Array);
    engineA.step(0.02, 1);
    engineB.step(0.02, 1);
    const afterA = (geometryA.getAttribute('position') as BufferAttribute).array as Float32Array;
    const afterB = (geometryB.getAttribute('position') as BufferAttribute).array as Float32Array;

    let totalA = 0;
    let totalB = 0;
    let count = 0;
    for (let i = 0; i < afterA.length; i += 3) {
      const dax = afterA[i] - beforeA[i];
      const day = afterA[i + 1] - beforeA[i + 1];
      const daz = afterA[i + 2] - beforeA[i + 2];
      totalA += Math.sqrt(dax * dax + day * day + daz * daz);
      const dbx = afterB[i] - beforeB[i];
      const dby = afterB[i + 1] - beforeB[i + 1];
      const dbz = afterB[i + 2] - beforeB[i + 2];
      totalB += Math.sqrt(dbx * dbx + dby * dby + dbz * dbz);
      count += 1;
    }

    const avgA = totalA / Math.max(count, 1);
    const avgB = totalB / Math.max(count, 1);
    const ratio = avgA > 1e-8 ? avgB / avgA : 0;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
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

  it('switches gradient type to displacement', () => {
    const controller = new MaterialController(materialSettings);
    controller.setMaterialSettings({
      ...materialSettings,
      gradientType: 'displacement',
    });
    expect(controller.material.uniforms.uGradientType.value).toBe(1);
    controller.dispose();
  });
});
