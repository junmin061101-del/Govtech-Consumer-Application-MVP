import fs from "node:fs";
import path from "node:path";
import { parseGuide, type Guide } from "@/lib/applyGuide";

const DIR = path.join(process.cwd(), "content", "apply-guides");

function read(file: string): Guide | null {
  const full = path.join(DIR, file);
  if (!fs.existsSync(full)) return null;
  return parseGuide(fs.readFileSync(full, "utf8"), path.basename(file, ".md"));
}

const SAFE_ID = /^[a-z-]+$/;
const SAFE_CODE = /^\d{5}$/;

/** 공통 지침 문서. id 는 파일 이름 (daycare, kindergarten, school-age) */
export function loadGuide(id: string): Guide | null {
  return SAFE_ID.test(id) ? read(`${id}.md`) : null;
}

/** 구별 지침 문서. 해당 구 파일이 없으면 null */
export function loadSigunguGuide(code: string | null | undefined): Guide | null {
  return code && SAFE_CODE.test(code) ? read(path.join("sigungu", `${code}.md`)) : null;
}
