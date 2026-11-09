// 지역아동센터: 공공데이터포털 '전국지역아동센터표준데이터' OpenAPI (data.go.kr/data/15129438/standard.do).
// 요청 항목: serviceKey, pageNo, numOfRows(최대 1000), type, 그리고 응답 항목명으로 거르는 조건(CTPV_NM 등).
// 표준데이터는 지자체가 각자 등록하므로 서울 전 구가 다 들어 있지 않을 수 있다(수집 보고의 구별 건수로 확인).
import { createHash } from "node:crypto";
import { KIND_META } from "@/lib/kinds";
import { AGES, type Facility } from "@/lib/types";
import type { FacilitySource, SourceRun } from "./index";

const URL_BASE = "https://api.data.go.kr/openapi/tn_pubr_public_local_child_center_api";
const PAGE = 1000;
/** 수집 대상 시·도 (지역 경계 데이터가 있는 곳만) */
const SIDO = ["서울특별시"];

export interface LocalCenterRow {
  CNTR_NM?: string;
  CTPV_NM?: string;
  SGG_NM?: string;
  LCTN_ROAD_NM?: string;
  LCTN_LOTNO_ADDR?: string;
  LAT?: string | number;
  LOT?: string | number;
  TELNO?: string;
  PSCP_CNT?: string | number;
  NOW_NOPE?: string | number;
  TNOEMP?: string | number;
  OPER_INST_TYPE?: string;
  DATA_CRTR_YMD?: string;
}

const numOrNull = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** 원천에 센터 ID 가 없어 이름·주소로 안정적인 ID 를 만든다 */
const centerId = (r: LocalCenterRow) =>
  `lc:${createHash("sha1").update(`${r.CNTR_NM ?? ""}|${r.LCTN_ROAD_NM || r.LCTN_LOTNO_ADDR || ""}`).digest("hex").slice(0, 16)}`;

export function normalizeLocalCenter(r: LocalCenterRow): Facility | null {
  const lat = Number(r.LAT);
  const lng = Number(r.LOT);
  if (!r.CNTR_NM || !(lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;
  const capacity = numOrNull(r.PSCP_CNT);
  const enrolled = numOrNull(r.NOW_NOPE);
  const [lo, hi] = KIND_META.localcenter.ages;
  return {
    id: centerId(r),
    kind: "localcenter",
    name: r.CNTR_NM.trim(),
    type: r.OPER_INST_TYPE?.trim() || "지역아동센터",
    address: (r.LCTN_ROAD_NM || r.LCTN_LOTNO_ADDR || "").trim(),
    phone: (r.TELNO ?? "").trim(),
    homepage: "",
    lat,
    lng,
    capacity,
    enrolled,
    vacancy: capacity !== null && enrolled !== null ? Math.max(0, capacity - enrolled) : null,
    ageOpen: AGES.map((a) => a >= lo && a <= hi),
    extended: {},
    asOf: r.DATA_CRTR_YMD ?? "",
    staff: numOrNull(r.TNOEMP),
    source: "localcenter-std",
  };
}

/** 응답 형식: { response: { header: { resultCode, resultMsg }, body: { items, totalCount } } } */
export function parseResponse(json: unknown): { rows: LocalCenterRow[]; total: number } {
  const res = (json as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: unknown } } })
    ?.response;
  const code = res?.header?.resultCode;
  if (code === "03") return { rows: [], total: 0 }; // NODATA_ERROR
  if (code !== "00") throw new Error(res?.header?.resultMsg ?? "응답 형식이 올바르지 않습니다");
  const items = res?.body?.items;
  const rows = Array.isArray(items)
    ? items
    : Array.isArray((items as { item?: unknown })?.item)
      ? (items as { item: LocalCenterRow[] }).item
      : (items as { item?: LocalCenterRow })?.item
        ? [(items as { item: LocalCenterRow }).item]
        : [];
  return { rows: rows as LocalCenterRow[], total: Number(res?.body?.totalCount ?? rows.length) };
}

export const localCenterStd: FacilitySource = {
  id: "localcenter-std",
  kind: "localcenter",
  label: "지역아동센터 (전국 표준데이터)",
  async run(): Promise<SourceRun> {
    const key = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
    if (!key) return { facilities: [], parts: [{ key: "localcenter-std", count: 0, skipped: "DATA_GO_KR_SERVICE_KEY 없음" }], partial: true };

    const out: Facility[] = [];
    const parts: SourceRun["parts"] = [];
    for (const sido of SIDO) {
      try {
        const rows: LocalCenterRow[] = [];
        for (let page = 1; ; page++) {
          const q = new URLSearchParams({ serviceKey: key, pageNo: String(page), numOfRows: String(PAGE), type: "json", CTPV_NM: sido });
          const res = await fetch(`${URL_BASE}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`upstream ${res.status}`);
          const { rows: got, total } = parseResponse(await res.json());
          rows.push(...got);
          if (got.length === 0 || rows.length >= total) break;
        }
        const list = rows.flatMap((r) => normalizeLocalCenter(r) ?? []);
        out.push(...list);
        // 구별 건수: 표준데이터에 어느 구가 등록돼 있는지 보고에서 확인한다
        const bySgg = new Map<string, number>();
        for (const r of rows) bySgg.set(r.SGG_NM ?? "?", (bySgg.get(r.SGG_NM ?? "?") ?? 0) + 1);
        for (const [sgg, count] of bySgg) parts.push({ key: `${sido} ${sgg}`, count });
      } catch (e) {
        parts.push({ key: sido, count: 0, error: e instanceof Error ? e.message : "unknown" });
      }
    }
    // 오류 없이 다 받았으면 이번에 없던 시설(폐지 등)은 수집기가 지운다
    return { facilities: out, parts, partial: false, complete: !parts.some((p) => p.error) };
  },
};
