/* päivän sana — icon generator: node icons/generate.mjs
   Finnish Nordic cross in the app's palette: soft sky blue on cream.
*/
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#FAF6EF"/>
  <rect x="30" y="0" width="17" height="100" fill="#7FA3B8"/>
  <rect x="0" y="42" width="100" height="17" fill="#7FA3B8"/>
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
