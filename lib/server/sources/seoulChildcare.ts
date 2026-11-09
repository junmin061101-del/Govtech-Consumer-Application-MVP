// 서울 열린데이터광장 구별 어린이집 정보 (표준 데이터).
// 구별 서비스명은 data/sources/seoul-childcare.json 에서 읽고, 환경변수 SEOUL_CHILDCARE_SERVICES
// (예: {"11680":"ChildCareInfoXX"}) 로 덮어쓸 수 있다. 서비스명이 없는 구는 건너뛴다.
import config from "@/data/sources/seoul-childcare.json";
import overrides from "@/data/hours-overrides.json";
import { normalizeRows, type HoursOverrides, type RawRow } from "@/lib/normalize";
import type { Facility } from "@/lib/types";
import type { FacilitySource, SourceRun } from "./index";

const BASE = "http://openapi.seoul.go.kr:8088";
const PAGE = 1000;

type District = { name: string; dataset: string; service: string | null };

export function districtServices(): { code: string; name: string; service: string | null }[] {
  let env: Record<string, string> = {};
  try {
    env = JSON.parse(process.env.SEOUL_CHILDCARE_SERVICES || "{}");
  } catch {
    console.warn("SEOUL_CHILDCARE_SERVICES 가 올바른 JSON 이 아닙니다");
  }
  return Object.entries(config.districts as Record<string, District>).map(([code, d]) => ({
    code,
    name: d.name,
    service: env[code] || d.service,
  }));
}

async function fetchService(key: string, service: string, sample: boolean): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  for (let start = 1; ; start += PAGE) {
    // sample 키는 5건까지만 허용된다
    const end = sample ? 5 : start + PAGE - 1;
    const res = await fetch(`${BASE}/${key}/json/${service}/${start}/${end}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    const body = json[service];
    if (!body?.row) {
      const msg = body?.RESULT?.MESSAGE ?? json.RESULT?.MESSAGE ?? "응답 형식이 올바르지 않습니다";
      // 마지막 페이지 다음은 '해당하는 데이터가 없습니다'(INFO-200)로 끝난다
      if (rows.length > 0 && (json.RESULT?.CODE === "INFO-200" || body?.RESULT?.CODE === "INFO-200")) break;
      throw new Error(msg);
    }
    rows.push(...(body.row as RawRow[]));
    const total = Number(body.list_total_count ?? 0);
    if (sample || rows.length >= total) break;
  }
  return rows;
}

export const seoulChildcare: FacilitySource = {
  id: "seoul-childcare",
  kind: "daycare",
  label: "서울 어린이집",
  async run(): Promise<SourceRun> {
    const key = process.env.SEOUL_OPEN_API_KEY?.trim();
    const sample = !key;
    const out: Facility[] = [];
    const parts: SourceRun["parts"] = [];
    for (const d of districtServices()) {
      if (!d.service) {
        parts.push({ key: d.code, count: 0, skipped: "서비스명 미확인" });
        continue;
      }
      try {
        const rows = await fetchService(key || "sample", d.service, sample);
        const list = normalizeRows(rows, overrides as HoursOverrides);
        out.push(...list);
        parts.push({ key: d.code, count: list.length });
      } catch (e) {
        parts.push({ key: d.code, count: 0, error: e instanceof Error ? e.message : "unknown" });
      }
    }
    return { facilities: out, parts, partial: sample };
  },
};
