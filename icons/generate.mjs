/* päivän sana — icon generator: node icons/generate.mjs
   Matches the tidy/homey/leafy family: cream tile, hand-drawn sage line.
   Motif: a soft Nordic cross (Finland) drawn like a brush stroke.
*/
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#FAF6EF"/>
  <path d="M42 16 C40 34 40 66 42 84" stroke="#6B93B8" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M16 48 C34 46 66 46 84 48" stroke="#6B93B8" stroke-width="6" stroke-linecap="round" fill="none"/>
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
