import type { LibraryModel } from '../types';

/**
 * Models shipped inside the app binary. `stats` are pre-computed with
 * `node scripts/glb-stats.js assets/models` so nothing is parsed at runtime.
 */
export const BUNDLED_MODELS: LibraryModel[] = [
  {
    id: 'bundled:shrek_dancing',
    name: 'Shrek Dancing',
    size: 1195832,
    origin: 'bundled',
    source: require('../../assets/models/shrek_dancing.glb'),
    stats: { triangles: 2066, meshes: 2, nodes: 69, images: 2, animations: ['mixamo.com'] },
    addedAt: 0,
  },
  {
    id: 'bundled:shrek_hip_hop',
    name: 'Shrek Hip Hop',
    size: 1062396,
    origin: 'bundled',
    source: require('../../assets/models/shrek_hip_hop.glb'),
    stats: { triangles: 2066, meshes: 2, nodes: 68, images: 2, animations: ['mixamo.com'] },
    addedAt: 0,
  },
  {
    id: 'bundled:mr_incredible',
    name: 'Mr. Incredible',
    size: 1051772,
    origin: 'bundled',
    source: require('../../assets/models/mr_incredible.glb'),
    stats: { triangles: 2263, meshes: 1, nodes: 76, images: 1, animations: ['SambaDancing.glb'] },
    addedAt: 0,
  },
  {
    id: 'bundled:spooky_skeleton',
    name: 'Spooky Skeleton',
    size: 5292992,
    origin: 'bundled',
    source: require('../../assets/models/spooky_skeleton.glb'),
    stats: { triangles: 99848, meshes: 4, nodes: 66, images: 0, animations: ['skele dance 1'] },
    addedAt: 0,
  },
];
