/* päivän sana — icon generator: node icons/generate.mjs
   Cream rounded square, sage open book + sparkle (same visual language as tidy).
*/
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#FAF7F0"/>
  <path d="M50 32 C44 26 34 25 26 28 L26 66 C34 63 44 64 50 70 C56 64 66 63 74 66 L74 28 C66 25 56 26 50 32 Z" stroke="#7A9E7E" stroke-width="5" stroke-linejoin="round" fill="none"/>
  <path d="M50 32 L50 70" stroke="#7A9E7E" stroke-width="5" stroke-linecap="round"/>
  <path d="M78 12 C78.8 17.2 80 18.5 85 19.5 C80 20.5 78.8 21.8 78 27 C77.2 21.8 76 20.5 71 19.5 C76 18.5 77.2 17.2 78 12 Z" fill="#7A9E7E"/>
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
