// extension/ 폴더를 public/extension/careos-helper.zip 으로 묶는다 (설치 안내 페이지에서 받는다). next build 전에 돈다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const out = "public/extension/careos-helper.zip";
fs.mkdirSync("public/extension", { recursive: true });
fs.rmSync(out, { force: true });
execFileSync("zip", ["-qr", `../${out}`, "."], { cwd: "extension" });
console.log(`extension → ${out} (${fs.statSync(out).size} bytes)`);
