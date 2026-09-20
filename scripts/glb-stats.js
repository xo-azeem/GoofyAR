#!/usr/bin/env node
/**
 * Prints the stats block for each .glb in a folder, ready to paste into
 * src/models/bundled.ts. Usage: node scripts/glb-stats.js assets/models
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'assets/models';
for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const fd = fs.openSync(path.join(dir, name), 'r');
  const header = Buffer.alloc(20);
  fs.readSync(fd, header, 0, 20, 0);
  const jsonLen = header.readUInt32LE(12);
  const json = Buffer.alloc(jsonLen);
  fs.readSync(fd, json, 0, jsonLen, 20);
  fs.closeSync(fd);
  const gltf = JSON.parse(json.toString('utf8'));
  const acc = gltf.accessors || [];
  let tris = 0;
  for (const m of gltf.meshes || []) {
    for (const p of m.primitives || []) {
      const mode = p.mode ?? 4;
      if (mode < 4) continue;
      const count = p.indices != null ? acc[p.indices]?.count ?? 0 : acc[p.attributes?.POSITION]?.count ?? 0;
      tris += mode === 4 ? count / 3 : Math.max(0, count - 2);
    }
  }
  const animations = (gltf.animations || []).map((a, i) => a.name || `animation_${i}`);
  const stats = {
    triangles: Math.round(tris),
    meshes: (gltf.meshes || []).length,
    nodes: (gltf.nodes || []).length,
    images: (gltf.images || []).length,
    animations,
  };
  console.log(`${name}  size: ${fs.statSync(path.join(dir, name)).size}`);
  console.log(`  stats: ${JSON.stringify(stats)},`);
}
