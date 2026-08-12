import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as THREE from "../apps/studio/node_modules/three/build/three.module.js";
import { GLTFExporter } from "../apps/studio/node_modules/three/examples/jsm/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  error = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onloadend?.();
      },
      (error) => {
        this.error = error;
        this.onloadend?.();
      },
    );
  }
}

globalThis.FileReader ??= NodeFileReader;

const RADIAL_SEGMENTS = 64;
const profile = [
  new THREE.Vector2(0, 0),
  new THREE.Vector2(0.48, 0),
  new THREE.Vector2(0.49, 0.16),
  new THREE.Vector2(0.505, 0.38),
  new THREE.Vector2(0.52, 0.65),
  new THREE.Vector2(0.4, 0.65),
  new THREE.Vector2(0.4, 0.38),
  new THREE.Vector2(0.4, 0.08),
  new THREE.Vector2(0, 0.08),
];

const geometry = new THREE.LatheGeometry(
  profile,
  RADIAL_SEGMENTS,
  0,
  Math.PI * 2,
);
geometry.computeVertexNormals();
geometry.computeBoundingBox();
geometry.computeBoundingSphere();

const material = new THREE.MeshStandardMaterial({
  color: 0x6f8790,
  roughness: 0.42,
  metalness: 0.06,
  side: THREE.DoubleSide,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.name = "smooth-vessel-v1";

const scene = new THREE.Scene();
scene.name = "Demiurges smooth curved vessel fixture";
scene.add(mesh);

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
  trs: false,
});
if (!(result instanceof ArrayBuffer)) {
  throw new Error("GLTFExporter did not produce binary GLB bytes");
}

const outputUrl = new URL("../packages/world/assets/smooth-vessel-v1.glb", import.meta.url);
await mkdir(fileURLToPath(new URL("../packages/world/assets/", import.meta.url)), {
  recursive: true,
});
await writeFile(fileURLToPath(outputUrl), new Uint8Array(result));
