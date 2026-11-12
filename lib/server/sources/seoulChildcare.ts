// 서울 열린데이터광장 '서울시 어린이집 정보' OpenAPI (SERVICE=ChildCareInfo) — 서울 25개 구 전체를 한 번에 받는다.
// 필드는 보육정보공개 API(cpmsapi030)와 같은 대문자 이름이다 (lib/normalize.ts).
// 서비스명은 data/sources/seoul-childcare.json 의 service 값(기본 ChildCareInfo)이고, 환경변수 SEOUL_CHILDCARE_SERVICE 로 바꿀 수 있다.
import config from "@/data/sources/seoul-childcare.json";
import overrides from "@/data/hours-overrides.json";
import { normalizeRows, type HoursOverrides, type RawRow } from "@/lib/normalize";
import type { Facility } from "@/lib/types";
import type { FacilitySource, SourceRun } from "./index";

const BASE = "http://openapi.seoul.go.kr:8088";
const PAGE = 1000;

type District = { name: string };

export const childcareService = () => process.env.SEOUL_CHILDCARE_SERVICE?.trim() || config.service;

/** 서울 25개 구 (수집 보고의 구별 건수용) */
export const DISTRICTS = Object.entries(config.districts as Record<string, District>).map(([code, d]) => ({ code, name: d.name }));

type Fetcher = typeof fetch;

/** 일시적인 연결 오류(새벽 점검·끊김)는 잠깐 쉬었다가 다시 묻는다. 응답 내용 오류(키·서비스명)는 바로 실패 */
export const RETRY_DELAYS_MS = [3_000, 15_000];

async function fetchOnce(f: Fetcher, key: string, service: string, start: number, end: number) {
  const res = await f(`${BASE}/${key}/json/${service}/${start}/${end}/`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw Object.assign(new Error(`upstream ${res.status}`), { retry: res.status >= 500 || res.status === 429 });
  const json = await res.json();
  const body = json[service];
  if (!body?.row) throw new Error(body?.RESULT?.MESSAGE ?? json.RESULT?.MESSAGE ?? "응답 형식이 올바르지 않습니다");
  return { rows: body.row as RawRow[], total: Number(body.list_total_count ?? 0) };
}

async function fetchPage(f: Fetcher, key: string, service: string, start: number, end: number, delays = RETRY_DELAYS_MS) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(f, key, service, start, end);
    } catch (e) {
      // fetch 자체가 실패(TypeError: fetch failed)·시간 초과·5xx 면 다시 시도
      const transient = e instanceof TypeError || (e as Error)?.name === "TimeoutError" || (e as { retry?: boolean })?.retry === true;
      if (!transient || attempt >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

/** 전체를 받는다. sample 키는 5건까지만 허용된다 */
export async function fetchAll(key: string, service: string, sample: boolean, f: Fetcher = fetch, delays = RETRY_DELAYS_MS): Promise<RawRow[]> {
  const first = await fetchPage(f, key, service, 1, sample ? 5 : PAGE, delays);
  if (sample) return first.rows;
  const rows = [...first.rows];
  for (let start = PAGE + 1; start <= first.total; start += PAGE) {
    rows.push(...(await fetchPage(f, key, service, start, Math.min(first.total, start + PAGE - 1), delays)).rows);
  }
  if (rows.length < first.total) throw new Error(`일부만 받음 (${rows.length}/${first.total})`);
  return rows;
}

/** 시설코드 앞 5자리 = 시군구 코드 */
const sggOf = (r: RawRow) => String(r.STCODE ?? "").slice(0, 5);

export function summarize(rows: RawRow[], list: Facility[]): SourceRun["parts"] {
  const kept = new Set(list.map((f) => f.id));
  const count = new Map<string, number>();
  for (const r of rows) if (r.STCODE && kept.has(r.STCODE)) count.set(sggOf(r), (count.get(sggOf(r)) ?? 0) + 1);
  return DISTRICTS.map((d) => ({ key: d.code, count: count.get(d.code) ?? 0 }));
}

export const seoulChildcare: FacilitySource = {
  id: "seoul-childcare",
  kind: "daycare",
  label: "서울 어린이집",
  async run(): Promise<SourceRun> {
    const key = process.env.SEOUL_OPEN_API_KEY?.trim();
    const sample = !key;
    try {
      const rows = await fetchAll(key || "sample", childcareService(), sample);
      const list = normalizeRows(rows, overrides as HoursOverrides);
      // 전체를 빠짐없이 받았을 때만 complete → 목록에서 사라진(폐지 등) 시설을 지운다
      return { facilities: list, parts: summarize(rows, list), partial: sample, complete: !sample, sample };
    } catch (e) {
      return {
        facilities: [],
        parts: [{ key: "seoul", count: 0, error: e instanceof Error ? e.message : "unknown" }],
        partial: true,
      };
    }
  },
};
