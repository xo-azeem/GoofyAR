import { ViroMaterials } from '@reactvision/react-viro';

import { colors } from '../theme';

let registered = false;

/** Materials are global in Viro; register them once, lazily, before the first scene mounts. */
export function ensureMaterials() {
  if (registered) return;
  registered = true;
  ViroMaterials.createMaterials({
    reticleSearching: {
      lightingModel: 'Constant',
      diffuseColor: '#FFFFFFB3',
      writesToDepthBuffer: false,
      readsFromDepthBuffer: false,
    },
    reticleReady: {
      lightingModel: 'Constant',
      diffuseColor: colors.accent,
      writesToDepthBuffer: false,
      readsFromDepthBuffer: false,
    },
    contactShadow: {
      lightingModel: 'Constant',
      diffuseColor: '#00000059',
      writesToDepthBuffer: false,
    },
  });
}
