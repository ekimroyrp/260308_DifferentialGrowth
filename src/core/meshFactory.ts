import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  MathUtils,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseShape } from '../types';

const tempCenter = new Vector3();
const tempDirection = new Vector3();

function createQuadSphereGeometry(segments: number): BufferGeometry {
  const safeSegments = Math.max(2, Math.round(segments));
  const geometry = new BoxGeometry(2, 2, 2, safeSegments, safeSegments, safeSegments);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    tempDirection.set(position.getX(i), position.getY(i), position.getZ(i)).normalize();
    position.setXYZ(i, tempDirection.x, tempDirection.y, tempDirection.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createRoundedCubeGeometry(segments: number): BufferGeometry {
  const safeSegments = Math.max(2, Math.round(segments));
  const size = 1.7;
  const half = size * 0.5;
  const roundness = size * 0.17;
  const clampedRoundness = Math.min(roundness, half - 1e-4);
  const inner = half - clampedRoundness;
  const geometry = new BoxGeometry(size, size, size, safeSegments, safeSegments, safeSegments);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const cx = MathUtils.clamp(x, -inner, inner);
    const cy = MathUtils.clamp(y, -inner, inner);
    const cz = MathUtils.clamp(z, -inner, inner);
    tempDirection.set(x - cx, y - cy, z - cz).normalize();
    position.setXYZ(
      i,
      cx + tempDirection.x * clampedRoundness,
      cy + tempDirection.y * clampedRoundness,
      cz + tempDirection.z * clampedRoundness,
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createBaseGeometry(shape: BaseShape, subdivision: number): BufferGeometry {
  const t = MathUtils.clamp((subdivision - 1) / 99, 0, 1);
  switch (shape) {
    case 'sphere':
      return new SphereGeometry(
        1.15,
        Math.round(MathUtils.lerp(24, 120, t)),
        Math.round(MathUtils.lerp(14, 72, t)),
      );
    case 'torus':
      return new TorusGeometry(
        1,
        0.36,
        Math.round(MathUtils.lerp(12, 64, t)),
        Math.round(MathUtils.lerp(48, 220, t)),
      );
    case 'cube':
      return new BoxGeometry(
        1.7,
        1.7,
        1.7,
        Math.round(MathUtils.lerp(8, 48, t)),
        Math.round(MathUtils.lerp(8, 48, t)),
        Math.round(MathUtils.lerp(8, 48, t)),
      );
    case 'rounded-cube':
      return createRoundedCubeGeometry(Math.round(MathUtils.lerp(8, 52, t)));
    case 'pyramid':
      return new CylinderGeometry(
        0,
        1,
        1.8,
        4,
        Math.round(MathUtils.lerp(1, 40, t)),
      );
    case 'cone':
      return new CylinderGeometry(
        0,
        1,
        1.8,
        Math.round(MathUtils.lerp(12, 96, t)),
        Math.round(MathUtils.lerp(1, 40, t)),
      );
    case 'cylinder':
      return new CylinderGeometry(
        1,
        1,
        1.8,
        Math.round(MathUtils.lerp(12, 96, t)),
        Math.round(MathUtils.lerp(1, 40, t)),
      );
    case 'polyhedron':
      return new DodecahedronGeometry(1.1, Math.round(MathUtils.lerp(0, 4, t)));
    case 'quad-sphere':
      return createQuadSphereGeometry(Math.round(MathUtils.lerp(8, 56, t)));
    default:
      return new SphereGeometry(1.15, 48, 32);
  }
}

export function buildShapeGeometry(shape: BaseShape, subdivision = 35): BufferGeometry {
  const rawGeometry = createBaseGeometry(shape, subdivision);
  rawGeometry.computeBoundingBox();
  if (rawGeometry.boundingBox) {
    rawGeometry.boundingBox.getCenter(tempCenter);
    rawGeometry.translate(-tempCenter.x, -tempCenter.y, -tempCenter.z);
  }

  rawGeometry.computeBoundingSphere();
  const radius = rawGeometry.boundingSphere?.radius ?? 1;
  const scale = radius > 1e-6 ? 1.15 / radius : 1;
  rawGeometry.scale(scale, scale, scale);

  // Remove seam-preserving attributes from primitive generators so shared vertices can be welded.
  if (rawGeometry.getAttribute('uv')) {
    rawGeometry.deleteAttribute('uv');
  }
  if (rawGeometry.getAttribute('normal')) {
    rawGeometry.deleteAttribute('normal');
  }

  const welded = mergeVertices(rawGeometry, 1e-6);
  rawGeometry.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingSphere();
  return welded;
}
