import { BufferAttribute, BufferGeometry, DynamicDrawUsage, MathUtils, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GrowthSettings } from '../types';
import { buildTopology, type GeometryTopology } from './geometryTopology';
import { SeededRng } from './seededRng';

const tempAverage = new Vector3();
const tempEdge = new Vector3();

export class DifferentialGrowthEngine {
  private geometry: BufferGeometry;
  private topology: GeometryTopology;
  private positionAttr: BufferAttribute;
  private normalAttr: BufferAttribute;
  private maskAttr: BufferAttribute;
  private curvatureAttr: BufferAttribute;
  private readonly settings: GrowthSettings;
  private basePositions: Float32Array;
  private curvatureWork: Float32Array;
  private deltaWork: Float32Array;
  private rng: SeededRng;
  private subdivisionCooldown: number;

  constructor(geometry: BufferGeometry, settings: GrowthSettings, seed: number) {
    this.geometry = geometry;
    this.settings = settings;
    this.positionAttr = this.geometry.getAttribute('position') as BufferAttribute;
    this.normalAttr = this.geometry.getAttribute('normal') as BufferAttribute;
    this.maskAttr = new BufferAttribute(new Float32Array(this.positionAttr.count), 1);
    this.curvatureAttr = new BufferAttribute(new Float32Array(this.positionAttr.count), 1);
    this.topology = { adjacency: [], edges: [] };
    this.basePositions = new Float32Array();
    this.curvatureWork = new Float32Array();
    this.deltaWork = new Float32Array();
    this.rng = new SeededRng(seed);
    this.subdivisionCooldown = 0;
    this.setGeometry(geometry);
  }

  getGeometry(): BufferGeometry {
    return this.geometry;
  }

  setGeometry(geometry: BufferGeometry): void {
    this.geometry = geometry;
    this.geometry.computeVertexNormals();
    this.positionAttr = this.geometry.getAttribute('position') as BufferAttribute;
    this.normalAttr = this.geometry.getAttribute('normal') as BufferAttribute;
    this.positionAttr.setUsage(DynamicDrawUsage);
    this.normalAttr.setUsage(DynamicDrawUsage);

    this.maskAttr = new BufferAttribute(new Float32Array(this.positionAttr.count), 1);
    this.maskAttr.setUsage(DynamicDrawUsage);
    this.curvatureAttr = new BufferAttribute(new Float32Array(this.positionAttr.count), 1);
    this.curvatureAttr.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aMask', this.maskAttr);
    this.geometry.setAttribute('aCurvature', this.curvatureAttr);

    this.topology = buildTopology(this.geometry);
    this.basePositions = Float32Array.from(this.positionAttr.array as ArrayLike<number>);
    this.curvatureWork = new Float32Array(this.positionAttr.count);
    this.deltaWork = new Float32Array(this.positionAttr.count * 3);
    this.subdivisionCooldown = 0;
    this.updateCurvatureAttribute();
  }

  setGrowthSettings(settings: GrowthSettings): void {
    this.settings.growthStep = settings.growthStep;
    this.settings.targetEdgeLength = settings.targetEdgeLength;
    this.settings.splitThreshold = settings.splitThreshold;
    this.settings.repulsion = settings.repulsion;
    this.settings.smoothing = settings.smoothing;
    this.settings.shapeRetention = settings.shapeRetention;
    this.settings.maxVertices = settings.maxVertices;
  }

  reseed(seed: number): void {
    this.rng = new SeededRng(seed);
  }

  resetToBase(clearMask = true): void {
    const positionArray = this.positionAttr.array as Float32Array;
    positionArray.set(this.basePositions);
    this.positionAttr.needsUpdate = true;
    if (clearMask) {
      const maskArray = this.maskAttr.array as Float32Array;
      maskArray.fill(0);
      this.maskAttr.needsUpdate = true;
    }
    this.geometry.computeVertexNormals();
    this.normalAttr.needsUpdate = true;
    this.updateCurvatureAttribute();
  }

  clearMask(): void {
    const maskArray = this.maskAttr.array as Float32Array;
    maskArray.fill(0);
    this.maskAttr.needsUpdate = true;
  }

  blurMask(strength: number): void {
    const maskArray = this.maskAttr.array as Float32Array;
    const next = new Float32Array(maskArray.length);
    const lerpAmount = MathUtils.clamp(strength, 0, 1) * 0.8;
    const iterations = Math.max(1, Math.round(1 + strength * 5));

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let i = 0; i < maskArray.length; i += 1) {
        const neighbors = this.topology.adjacency[i];
        if (!neighbors || neighbors.length === 0) {
          next[i] = maskArray[i];
          continue;
        }
        let sum = 0;
        for (let j = 0; j < neighbors.length; j += 1) {
          sum += maskArray[neighbors[j]];
        }
        const avg = sum / neighbors.length;
        next[i] = MathUtils.lerp(maskArray[i], avg, lerpAmount);
      }
      maskArray.set(next);
    }
    this.maskAttr.needsUpdate = true;
  }

  paintMask(localPoint: Vector3, radius: number, falloffOffset: number): void {
    const pos = this.positionAttr.array as Float32Array;
    const mask = this.maskAttr.array as Float32Array;
    const outer = radius + Math.max(0, falloffOffset);
    const hasFalloff = outer > radius + 1e-6;
    const px = localPoint.x;
    const py = localPoint.y;
    const pz = localPoint.z;

    for (let i = 0; i < mask.length; i += 1) {
      const index = i * 3;
      const dx = pos[index] - px;
      const dy = pos[index + 1] - py;
      const dz = pos[index + 2] - pz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > outer) {
        continue;
      }

      let strength = 1;
      if (dist > radius && hasFalloff) {
        const t = (dist - radius) / (outer - radius);
        strength = Math.max(0, 1 - t);
      }
      if (strength > mask[i]) {
        mask[i] = strength;
      }
    }

    this.maskAttr.needsUpdate = true;
  }

  step(deltaSeconds: number, growthSpeed: number): void {
    const safeDt = Math.min(Math.max(deltaSeconds, 0), 1 / 20);
    if (safeDt <= 0) {
      return;
    }

    const subSteps = Math.max(1, Math.round(growthSpeed * 2));
    const scaledDt = safeDt * growthSpeed / subSteps;
    for (let i = 0; i < subSteps; i += 1) {
      this.integrate(scaledDt);
    }

    this.geometry.computeVertexNormals();
    this.normalAttr.needsUpdate = true;
    this.updateCurvatureAttribute();
    this.maybeSplitLongEdges();
  }

  private integrate(dt: number): void {
    const positionArray = this.positionAttr.array as Float32Array;
    const normalArray = this.normalAttr.array as Float32Array;
    const maskArray = this.maskAttr.array as Float32Array;
    const adjacency = this.topology.adjacency;
    const edges = this.topology.edges;
    const vertexCount = maskArray.length;

    this.deltaWork.fill(0);

    let maxCurvature = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) {
        this.curvatureWork[i] = 0;
        continue;
      }

      let avgX = 0;
      let avgY = 0;
      let avgZ = 0;
      for (let j = 0; j < neighbors.length; j += 1) {
        const ni = neighbors[j] * 3;
        avgX += positionArray[ni];
        avgY += positionArray[ni + 1];
        avgZ += positionArray[ni + 2];
      }
      const inv = 1 / neighbors.length;
      avgX *= inv;
      avgY *= inv;
      avgZ *= inv;

      const index = i * 3;
      const lapX = avgX - positionArray[index];
      const lapY = avgY - positionArray[index + 1];
      const lapZ = avgZ - positionArray[index + 2];
      const nx = normalArray[index];
      const ny = normalArray[index + 1];
      const nz = normalArray[index + 2];
      const curvature = Math.abs(lapX * nx + lapY * ny + lapZ * nz);
      this.curvatureWork[i] = curvature;
      if (curvature > maxCurvature) {
        maxCurvature = curvature;
      }
    }
    const invCurvature = maxCurvature > 1e-7 ? 1 / maxCurvature : 1;

    const growthBase = this.settings.growthStep * dt;
    for (let i = 0; i < vertexCount; i += 1) {
      const index = i * 3;
      const block = 1 - MathUtils.clamp(maskArray[i], 0, 1);
      const curvatureFactor = this.curvatureWork[i] * invCurvature;
      const noise = this.rng.signed() * 0.12;
      const growth = Math.max(0, growthBase * block * (0.6 + curvatureFactor * 0.95 + noise));
      this.deltaWork[index] += normalArray[index] * growth;
      this.deltaWork[index + 1] += normalArray[index + 1] * growth;
      this.deltaWork[index + 2] += normalArray[index + 2] * growth;
    }

    const edgeStrength = 0.38;
    const repulsionStrength = this.settings.repulsion * 0.35;
    const minDistance = this.settings.targetEdgeLength * 0.62;
    for (let i = 0; i < edges.length; i += 1) {
      const [a, b] = edges[i];
      const ia = a * 3;
      const ib = b * 3;
      const ax = positionArray[ia];
      const ay = positionArray[ia + 1];
      const az = positionArray[ia + 2];
      const bx = positionArray[ib];
      const by = positionArray[ib + 1];
      const bz = positionArray[ib + 2];
      tempEdge.set(bx - ax, by - ay, bz - az);
      const length = tempEdge.length();
      if (length <= 1e-7) {
        continue;
      }
      tempEdge.multiplyScalar(1 / length);

      const edgeTarget = this.settings.targetEdgeLength;
      let correction = (length - edgeTarget) * edgeStrength * dt;
      if (length > edgeTarget * this.settings.splitThreshold) {
        correction *= 1.6;
      }

      this.deltaWork[ia] += tempEdge.x * correction;
      this.deltaWork[ia + 1] += tempEdge.y * correction;
      this.deltaWork[ia + 2] += tempEdge.z * correction;
      this.deltaWork[ib] -= tempEdge.x * correction;
      this.deltaWork[ib + 1] -= tempEdge.y * correction;
      this.deltaWork[ib + 2] -= tempEdge.z * correction;

      if (repulsionStrength > 0 && length < minDistance) {
        const push = ((minDistance - length) / minDistance) * repulsionStrength * dt;
        this.deltaWork[ia] -= tempEdge.x * push;
        this.deltaWork[ia + 1] -= tempEdge.y * push;
        this.deltaWork[ia + 2] -= tempEdge.z * push;
        this.deltaWork[ib] += tempEdge.x * push;
        this.deltaWork[ib + 1] += tempEdge.y * push;
        this.deltaWork[ib + 2] += tempEdge.z * push;
      }
    }

    const smoothingStrength = this.settings.smoothing * 0.42 * dt;
    for (let i = 0; i < vertexCount; i += 1) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) {
        continue;
      }
      tempAverage.set(0, 0, 0);
      for (let j = 0; j < neighbors.length; j += 1) {
        const ni = neighbors[j] * 3;
        tempAverage.x += positionArray[ni];
        tempAverage.y += positionArray[ni + 1];
        tempAverage.z += positionArray[ni + 2];
      }
      tempAverage.multiplyScalar(1 / neighbors.length);

      const index = i * 3;
      this.deltaWork[index] += (tempAverage.x - positionArray[index]) * smoothingStrength;
      this.deltaWork[index + 1] += (tempAverage.y - positionArray[index + 1]) * smoothingStrength;
      this.deltaWork[index + 2] += (tempAverage.z - positionArray[index + 2]) * smoothingStrength;
    }

    const retentionStrength = this.settings.shapeRetention * 0.18 * dt;
    if (retentionStrength > 0) {
      for (let i = 0; i < positionArray.length; i += 1) {
        this.deltaWork[i] += (this.basePositions[i] - positionArray[i]) * retentionStrength;
      }
    }

    for (let i = 0; i < positionArray.length; i += 1) {
      positionArray[i] += this.deltaWork[i];
    }
    this.positionAttr.needsUpdate = true;
  }

  private maybeSplitLongEdges(): void {
    if (this.subdivisionCooldown > 0) {
      this.subdivisionCooldown -= 1;
      return;
    }

    const vertexCount = this.positionAttr.count;
    if (vertexCount >= this.settings.maxVertices) {
      return;
    }

    // Full split pass can roughly quadruple vertices before merge.
    if (vertexCount * 4 > this.settings.maxVertices) {
      return;
    }

    const splitLength = this.settings.targetEdgeLength * this.settings.splitThreshold;
    if (splitLength <= 0) {
      return;
    }

    const positionArray = this.positionAttr.array as Float32Array;
    let longestEdge = 0;
    for (let i = 0; i < this.topology.edges.length; i += 1) {
      const [a, b] = this.topology.edges[i];
      const ai = a * 3;
      const bi = b * 3;
      const dx = positionArray[ai] - positionArray[bi];
      const dy = positionArray[ai + 1] - positionArray[bi + 1];
      const dz = positionArray[ai + 2] - positionArray[bi + 2];
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (length > longestEdge) {
        longestEdge = length;
      }
    }

    if (longestEdge <= splitLength) {
      return;
    }

    this.subdivideGeometryOnce();
    this.subdivisionCooldown = 8;
  }

  private subdivideGeometryOnce(): void {
    const sourceClone = this.geometry.clone();
    sourceClone.setAttribute('aBasePos', new BufferAttribute(Float32Array.from(this.basePositions), 3));
    const source = sourceClone.index ? sourceClone.toNonIndexed() : sourceClone;

    const srcPos = source.getAttribute('position') as BufferAttribute;
    const srcMask = source.getAttribute('aMask') as BufferAttribute;
    const srcBase = source.getAttribute('aBasePos') as BufferAttribute;
    const triCount = Math.floor(srcPos.count / 3);
    const nextVertexCount = triCount * 12;

    const nextPos = new Float32Array(nextVertexCount * 3);
    const nextMask = new Float32Array(nextVertexCount);
    const nextBase = new Float32Array(nextVertexCount * 3);

    let writeVertex = 0;

    const write = (
      px: number,
      py: number,
      pz: number,
      mask: number,
      bx: number,
      by: number,
      bz: number,
    ): void => {
      const pIndex = writeVertex * 3;
      nextPos[pIndex] = px;
      nextPos[pIndex + 1] = py;
      nextPos[pIndex + 2] = pz;
      nextMask[writeVertex] = mask;
      nextBase[pIndex] = bx;
      nextBase[pIndex + 1] = by;
      nextBase[pIndex + 2] = bz;
      writeVertex += 1;
    };

    for (let tri = 0; tri < triCount; tri += 1) {
      const i0 = tri * 3;
      const i1 = i0 + 1;
      const i2 = i0 + 2;

      const p0x = srcPos.getX(i0);
      const p0y = srcPos.getY(i0);
      const p0z = srcPos.getZ(i0);
      const p1x = srcPos.getX(i1);
      const p1y = srcPos.getY(i1);
      const p1z = srcPos.getZ(i1);
      const p2x = srcPos.getX(i2);
      const p2y = srcPos.getY(i2);
      const p2z = srcPos.getZ(i2);

      const m0 = srcMask.getX(i0);
      const m1 = srcMask.getX(i1);
      const m2 = srcMask.getX(i2);

      const b0x = srcBase.getX(i0);
      const b0y = srcBase.getY(i0);
      const b0z = srcBase.getZ(i0);
      const b1x = srcBase.getX(i1);
      const b1y = srcBase.getY(i1);
      const b1z = srcBase.getZ(i1);
      const b2x = srcBase.getX(i2);
      const b2y = srcBase.getY(i2);
      const b2z = srcBase.getZ(i2);

      const p01x = (p0x + p1x) * 0.5;
      const p01y = (p0y + p1y) * 0.5;
      const p01z = (p0z + p1z) * 0.5;
      const p12x = (p1x + p2x) * 0.5;
      const p12y = (p1y + p2y) * 0.5;
      const p12z = (p1z + p2z) * 0.5;
      const p20x = (p2x + p0x) * 0.5;
      const p20y = (p2y + p0y) * 0.5;
      const p20z = (p2z + p0z) * 0.5;

      const m01 = (m0 + m1) * 0.5;
      const m12 = (m1 + m2) * 0.5;
      const m20 = (m2 + m0) * 0.5;

      const b01x = (b0x + b1x) * 0.5;
      const b01y = (b0y + b1y) * 0.5;
      const b01z = (b0z + b1z) * 0.5;
      const b12x = (b1x + b2x) * 0.5;
      const b12y = (b1y + b2y) * 0.5;
      const b12z = (b1z + b2z) * 0.5;
      const b20x = (b2x + b0x) * 0.5;
      const b20y = (b2y + b0y) * 0.5;
      const b20z = (b2z + b0z) * 0.5;

      // Subdivide one triangle into 4 and carry mask/base attributes through interpolation.
      write(p0x, p0y, p0z, m0, b0x, b0y, b0z);
      write(p01x, p01y, p01z, m01, b01x, b01y, b01z);
      write(p20x, p20y, p20z, m20, b20x, b20y, b20z);

      write(p1x, p1y, p1z, m1, b1x, b1y, b1z);
      write(p12x, p12y, p12z, m12, b12x, b12y, b12z);
      write(p01x, p01y, p01z, m01, b01x, b01y, b01z);

      write(p2x, p2y, p2z, m2, b2x, b2y, b2z);
      write(p20x, p20y, p20z, m20, b20x, b20y, b20z);
      write(p12x, p12y, p12z, m12, b12x, b12y, b12z);

      write(p01x, p01y, p01z, m01, b01x, b01y, b01z);
      write(p12x, p12y, p12z, m12, b12x, b12y, b12z);
      write(p20x, p20y, p20z, m20, b20x, b20y, b20z);
    }

    const subdivided = new BufferGeometry();
    subdivided.setAttribute('position', new BufferAttribute(nextPos, 3));
    subdivided.setAttribute('aMask', new BufferAttribute(nextMask, 1));
    subdivided.setAttribute('aBasePos', new BufferAttribute(nextBase, 3));
    const merged = mergeVertices(subdivided, 1e-6);
    merged.computeVertexNormals();

    const mergedMaskAttr = merged.getAttribute('aMask') as BufferAttribute | undefined;
    const mergedBaseAttr = merged.getAttribute('aBasePos') as BufferAttribute | undefined;
    const maskArray = mergedMaskAttr
      ? Float32Array.from(mergedMaskAttr.array as ArrayLike<number>)
      : new Float32Array((merged.getAttribute('position') as BufferAttribute).count);
    const baseArray = mergedBaseAttr
      ? Float32Array.from(mergedBaseAttr.array as ArrayLike<number>)
      : Float32Array.from((merged.getAttribute('position') as BufferAttribute).array as ArrayLike<number>);
    merged.deleteAttribute('aMask');
    merged.deleteAttribute('aBasePos');

    this.setGeometry(merged);
    (this.maskAttr.array as Float32Array).set(maskArray);
    this.maskAttr.needsUpdate = true;
    this.basePositions = baseArray;

    source.dispose();
    if (source !== sourceClone) {
      sourceClone.dispose();
    }
    subdivided.dispose();
  }

  private updateCurvatureAttribute(): void {
    const positionArray = this.positionAttr.array as Float32Array;
    const normalArray = this.normalAttr.array as Float32Array;
    const curvatureArray = this.curvatureAttr.array as Float32Array;
    const adjacency = this.topology.adjacency;
    let minCurvature = Number.POSITIVE_INFINITY;
    let maxCurvature = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < curvatureArray.length; i += 1) {
      const neighbors = adjacency[i];
      if (!neighbors || neighbors.length === 0) {
        curvatureArray[i] = 0;
        minCurvature = Math.min(minCurvature, 0);
        maxCurvature = Math.max(maxCurvature, 0);
        continue;
      }

      let avgX = 0;
      let avgY = 0;
      let avgZ = 0;
      for (let j = 0; j < neighbors.length; j += 1) {
        const ni = neighbors[j] * 3;
        avgX += positionArray[ni];
        avgY += positionArray[ni + 1];
        avgZ += positionArray[ni + 2];
      }
      const inv = 1 / neighbors.length;
      avgX *= inv;
      avgY *= inv;
      avgZ *= inv;

      const index = i * 3;
      const lapX = avgX - positionArray[index];
      const lapY = avgY - positionArray[index + 1];
      const lapZ = avgZ - positionArray[index + 2];
      const nx = normalArray[index];
      const ny = normalArray[index + 1];
      const nz = normalArray[index + 2];
      const curvature = Math.abs(lapX * nx + lapY * ny + lapZ * nz);
      curvatureArray[i] = curvature;
      if (curvature < minCurvature) {
        minCurvature = curvature;
      }
      if (curvature > maxCurvature) {
        maxCurvature = curvature;
      }
    }

    const span = Math.max(maxCurvature - minCurvature, 1e-6);
    const invSpan = 1 / span;
    for (let i = 0; i < curvatureArray.length; i += 1) {
      curvatureArray[i] = MathUtils.clamp((curvatureArray[i] - minCurvature) * invSpan, 0, 1);
    }
    this.curvatureAttr.needsUpdate = true;
  }
}
