import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SPLAT_COUNT = 2_048;
const RECORD_BYTES = 56;
const SEED = 0xd3095a17;

const vertices = [
  [-0.32, -0.25, -0.22],
  [0.32, -0.25, -0.22],
  [-0.32, 0.25, -0.22],
  [-0.32, -0.25, 0.22],
  [-0.32, 0.25, 0.22],
  [0.32, -0.25, 0.22],
];

const triangles = [
  [0, 1, 2],
  [3, 4, 5],
  [0, 3, 5],
  [0, 5, 1],
  [0, 2, 4],
  [0, 4, 3],
  [1, 5, 4],
  [1, 4, 2],
];

function xorshift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function sampleTriangle(a, b, c, random) {
  const root = Math.sqrt(random());
  const u = 1 - root;
  const v = root * (1 - random());
  const w = root - v;
  return [
    u * a[0] + v * b[0] + w * c[0],
    u * a[1] + v * b[1] + w * c[1],
    u * a[2] + v * b[2] + w * c[2],
  ];
}

const header = [
  "ply",
  "format binary_little_endian 1.0",
  "comment Demiurges diagnostic-wedge-3dgs-v1",
  `comment deterministic-seed ${SEED}`,
  "comment license CC0-1.0",
  `element vertex ${SPLAT_COUNT}`,
  "property float x",
  "property float y",
  "property float z",
  "property float scale_0",
  "property float scale_1",
  "property float scale_2",
  "property float rot_0",
  "property float rot_1",
  "property float rot_2",
  "property float rot_3",
  "property float opacity",
  "property float f_dc_0",
  "property float f_dc_1",
  "property float f_dc_2",
  "end_header",
  "",
].join("\n");

const headerBytes = new TextEncoder().encode(header);
const body = new ArrayBuffer(SPLAT_COUNT * RECORD_BYTES);
const view = new DataView(body);
const random = xorshift32(SEED);
const logScale = Math.log(0.022);
const shC0 = 0.28209479177387814;

for (let index = 0; index < SPLAT_COUNT; index += 1) {
  const point = index < vertices.length
    ? vertices[index]
    : sampleTriangle(
        ...triangles[index % triangles.length].map((vertex) => vertices[vertex]),
        random,
      );
  const offset = index * RECORD_BYTES;
  view.setFloat32(offset, point[0], true);
  view.setFloat32(offset + 4, point[1], true);
  view.setFloat32(offset + 8, point[2], true);
  view.setFloat32(offset + 12, logScale, true);
  view.setFloat32(offset + 16, logScale, true);
  view.setFloat32(offset + 20, logScale, true);
  view.setFloat32(offset + 24, 1, true);
  view.setFloat32(offset + 28, 0, true);
  view.setFloat32(offset + 32, 0, true);
  view.setFloat32(offset + 36, 0, true);
  view.setFloat32(offset + 40, Math.log(0.92 / 0.08), true);
  const red = (76 + 42 * ((point[0] + 0.32) / 0.64)) / 255;
  const green = (126 + 70 * ((point[1] + 0.25) / 0.5)) / 255;
  const blue = (144 + 64 * ((point[2] + 0.22) / 0.44)) / 255;
  view.setFloat32(offset + 44, (red - 0.5) / shC0, true);
  view.setFloat32(offset + 48, (green - 0.5) / shC0, true);
  view.setFloat32(offset + 52, (blue - 0.5) / shC0, true);
}

const bytes = new Uint8Array(headerBytes.byteLength + body.byteLength);
bytes.set(headerBytes);
bytes.set(new Uint8Array(body), headerBytes.byteLength);

const assetsDirectory = fileURLToPath(
  new URL("../packages/world/assets/", import.meta.url),
);
await mkdir(assetsDirectory, { recursive: true });
await writeFile(
  fileURLToPath(
    new URL("../packages/world/assets/diagnostic-wedge-3dgs-v1.ply", import.meta.url),
  ),
  bytes,
);
