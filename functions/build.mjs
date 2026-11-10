// lib/·server/ 를 함께 묶어 functions/lib/index.js 하나로 만든다. firebase-* 는 배포 환경 패키지를 쓴다.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile: path.join(here, "lib/index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  alias: { "@": root },
  external: ["firebase-functions", "firebase-functions/*", "firebase-admin", "firebase-admin/*"],
  logLevel: "info",
});

// 신청 도우미 지침 문서는 실행 시 파일로 읽는다 (lib/server/applyGuides.ts: process.cwd()/content)
fs.rmSync(path.join(here, "content"), { recursive: true, force: true });
fs.cpSync(path.join(root, "content"), path.join(here, "content"), { recursive: true });
