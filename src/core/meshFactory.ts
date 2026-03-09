import { BoxGeometry, BufferGeometry, ConeGeometry, DodecahedronGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import type { BaseShape } from '../types';

const tempCenter = new Vector3();

function createBaseGeometry(shape: BaseShape): BufferGeometry {
  switch (shape) {
    case 'cube':
      return new BoxGeometry(1.7, 1.7, 1.7, 16, 16, 16);
    case 'sphere':
      return new SphereGeometry(1.15, 56, 36);
    case 'pyramid':
      return new ConeGeometry(1.25, 1.9, 4, 22, false);
    case 'torus':
      return new TorusGeometry(1, 0.36, 28, 96);
    case 'dodecahedron':
      return new DodecahedronGeometry(1.15, 3);
    default:
      return new SphereGeometry(1.15, 56, 36);
  }
}

export function buildShapeGeometry(shape: BaseShape): BufferGeometry {
  const geometry = createBaseGeometry(shape);
  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    geometry.boundingBox.getCenter(tempCenter);
    geometry.translate(-tempCenter.x, -tempCenter.y, -tempCenter.z);
  }

  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? 1;
  const scale = radius > 1e-6 ? 1.15 / radius : 1;
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
