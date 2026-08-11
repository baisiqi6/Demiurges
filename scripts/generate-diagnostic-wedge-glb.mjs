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

const positions = new Float32Array([
  // -Z triangular cap
  -0.32, -0.25, -0.22, 0.32, -0.25, -0.22, -0.32, 0.25, -0.22,
  // +Z triangular cap
  -0.32, -0.25, 0.22, -0.32, 0.25, 0.22, 0.32, -0.25, 0.22,
  // bottom
  -0.32, -0.25, -0.22, -0.32, -0.25, 0.22, 0.32, -0.25, 0.22,
  -0.32, -0.25, -0.22, 0.32, -0.25, 0.22, 0.32, -0.25, -0.22,
  // vertical side
  -0.32, -0.25, -0.22, -0.32, 0.25, -0.22, -0.32, 0.25, 0.22,
  -0.32, -0.25, -0.22, -0.32, 0.25, 0.22, -0.32, -0.25, 0.22,
  // diagonal side
  0.32, -0.25, -0.22, 0.32, -0.25, 0.22, -0.32, 0.25, 0.22,
  0.32, -0.25, -0.22, -0.32, 0.25, 0.22, -0.32, 0.25, -0.22,
]);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geometry.computeVertexNormals();
geometry.computeBoundingBox();
geometry.computeBoundingSphere();

const material = new THREE.MeshStandardMaterial({
  color: 0x4d7f8d,
  roughness: 0.54,
  metalness: 0.08,
  flatShading: true,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.name = "diagnostic-wedge-v1";

const scene = new THREE.Scene();
scene.name = "Demiurges diagnostic rigid fixture";
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

const outputUrl = new URL("../packages/world/assets/diagnostic-wedge-v1.glb", import.meta.url);
await mkdir(fileURLToPath(new URL("../packages/world/assets/", import.meta.url)), {
  recursive: true,
});
await writeFile(fileURLToPath(outputUrl), new Uint8Array(result));
