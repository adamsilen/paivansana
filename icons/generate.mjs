/* päivän sana — icon generator: node icons/generate.mjs
   Cream rounded square, sage sunrise over an open book (sun = dag, book = ord).
*/
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#FAF7F0"/>
  <circle cx="50" cy="36" r="12" stroke="#7A9E7E" stroke-width="5" fill="none"/>
  <path d="M50 16v5M29 24l3.5 3.5M71 24l-3.5 3.5M22 36h5M73 36h5" stroke="#7A9E7E" stroke-width="5" stroke-linecap="round"/>
  <path d="M50 58 C44 52 34 51 26 54 L26 84 C34 81 44 82 50 88 C56 82 66 81 74 84 L74 54 C66 51 56 52 50 58 Z" stroke="#7A9E7E" stroke-width="5" stroke-linejoin="round" fill="none"/>
  <path d="M50 58 L50 88" stroke="#7A9E7E" stroke-width="5" stroke-linecap="round"/>
</svg>`;

writeFileSync(new URL("./icon.svg", import.meta.url), svg(512));
console.log("Wrote icons/icon.svg");

const renders = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
];
try {
  for (const [name, px] of renders) {
    execFileSync("qlmanage", ["-t", "-s", String(px), "-o", ".", "icon.svg"], {
      cwd: new URL(".", import.meta.url).pathname,
      stdio: "pipe",
    });
    execFileSync("mv", ["icon.svg.png", name], {
      cwd: new URL(".", import.meta.url).pathname,
    });
    console.log("wrote", name);
  }
} catch {
  console.log("qlmanage render failed — export PNGs manually from icon.svg.");
}
