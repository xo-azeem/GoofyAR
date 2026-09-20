import { File } from 'expo-file-system';

import type { ModelStats } from '../types';

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const MAX_JSON_CHUNK = 32 * 1024 * 1024;

export class InvalidGlbError extends Error {}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  // Hermes always ships TextDecoder; this is only a fallback for odd runtimes.
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
}

/**
 * Reads only the 12-byte header and the JSON chunk of a .glb file.
 * The binary buffer (the bulk of the file) is never touched, so this is cheap
 * even for 200 MB models.
 */
export function readGlbJson(file: File): Record<string, any> {
  const handle = file.open();
  try {
    const header = handle.readBytes(20);
    if (header.length < 20 || u32(header, 0) !== GLB_MAGIC) {
      throw new InvalidGlbError('Not a GLB file (bad magic bytes).');
    }
    if (u32(header, 4) !== 2) {
      throw new InvalidGlbError(`Unsupported glTF version ${u32(header, 4)}.`);
    }
    const jsonLength = u32(header, 12);
    if (u32(header, 16) !== CHUNK_JSON) {
      throw new InvalidGlbError('First GLB chunk is not JSON.');
    }
    if (jsonLength <= 0 || jsonLength > MAX_JSON_CHUNK) {
      throw new InvalidGlbError('GLB JSON chunk has an invalid length.');
    }
    const json = handle.readBytes(jsonLength);
    return JSON.parse(decodeUtf8(json));
  } finally {
    handle.close();
  }
}

export function statsFromGlbJson(gltf: Record<string, any>): ModelStats {
  const accessors: any[] = gltf.accessors ?? [];
  const meshes: any[] = gltf.meshes ?? [];
  let triangles = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.primitives ?? []) {
      const mode = prim.mode ?? 4; // TRIANGLES
      if (mode < 4) continue;
      const count =
        prim.indices != null
          ? accessors[prim.indices]?.count ?? 0
          : accessors[prim.attributes?.POSITION]?.count ?? 0;
      triangles += mode === 4 ? count / 3 : Math.max(0, count - 2);
    }
  }
  const animations: string[] = (gltf.animations ?? []).map(
    (a: any, i: number) => (typeof a?.name === 'string' && a.name.length > 0 ? a.name : `animation_${i}`),
  );
  return {
    triangles: Math.round(triangles),
    meshes: meshes.length,
    nodes: (gltf.nodes ?? []).length,
    images: (gltf.images ?? []).length,
    animations,
    generator: gltf.asset?.generator,
  };
}

export function readGlbStats(file: File): ModelStats {
  return statsFromGlbJson(readGlbJson(file));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTriangles(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tris`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K tris`;
  return `${n} tris`;
}
