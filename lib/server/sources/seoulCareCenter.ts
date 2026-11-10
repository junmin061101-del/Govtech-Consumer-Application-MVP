// 서울 열린데이터광장 '서울시 ○○ 시설현황정보' (서울시 아이돌봄담당관, 매월 갱신) — 서울 전체, 좌표·운영시간 포함.
//   지역아동센터    OA-20967  TnFcltySttusInfo1003
//   우리동네키움센터 OA-20965  TnFcltySttusInfo1001 (상시·일시 정원 포함)
// 정원은 있지만 현원이 없어 빈자리는 알 수 없다(null). 전화번호 항목은 원천에 없다.
import { KIND_META } from "@/lib/kinds";
import { AGES, type Day, type Facility, type FacilityKind } from "@/lib/types";
import type { FacilitySource, SourceRun } from "./index";
import { DISTRICTS, fetchAll } from "./seoulChildcare";

export interface CareCenterRow {
  FCLTY_ID?: string;
  FCLTY_NM?: string;
  ATDRC_CODE?: string;
  AGE_SE_NM?: string;
  X_CRDNT_VALUE?: string | number;
  Y_CRDNT_VALUE?: string | number;
  BASS_ADRES?: string;
  DETAIL_ADRES?: string;
  SEMSTR_BEGIN_TIME?: string;
  SEMSTR_END_TIME?: string;
  VCTN_BEGIN_TIME?: string;
  VCTN_END_TIME?: string;
  SAT_OPER_AT?: string;
  SAT_OPER_BEGIN_TIME?: string;
  SAT_OPER_END_TIME?: string;
  /** 상시돌봄 정원 (키움센터만) */
  ORDTM_CARE_PSNCPA_CO?: number | string;
  UPDT_DT?: string;
}

/** "1000" → "10:00". 형식이 다르면 null */
export function hhmm(v: unknown): string | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h <= 24 && mm < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

function span(open: unknown, close: unknown) {
  const o = hhmm(open);
  const c = hhmm(close);
  return o && c && o < c ? { open: o, close: c } : null;
}

export function normalizeCareCenter(r: CareCenterRow, kind: FacilityKind, source: string): Facility | null {
  const lat = Number(r.Y_CRDNT_VALUE);
  const lng = Number(r.X_CRDNT_VALUE);
  if (!r.FCLTY_ID || !r.FCLTY_NM || !(lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;

  // 운영시간: 평일 = 학기 중, 토요일은 운영하는 곳만. 방학 중 시간은 따로 두지 않는다(평일과 다를 수 있음)
  const hours: Partial<Record<Day, { open: string; close: string }>> = {};
  const weekday = span(r.SEMSTR_BEGIN_TIME, r.SEMSTR_END_TIME);
  if (weekday) hours.weekday = weekday;
  const sat = r.SAT_OPER_AT === "Y" ? span(r.SAT_OPER_BEGIN_TIME, r.SAT_OPER_END_TIME) : null;
  if (sat) hours.sat = sat;

  const cap = Number(r.ORDTM_CARE_PSNCPA_CO);
  // 대상: 초등학생 기준 만 6~8세. 영유아 대상 센터는 KIND_META 기본값 대신 0~5세
  const [lo, hi] = r.AGE_SE_NM === "영유아" ? [0, 5] : KIND_META[kind].ages;
  const address = [r.BASS_ADRES, (r.DETAIL_ADRES ?? "").trim()].filter(Boolean).join(" ").trim();

  return {
    id: `${kind}:${r.FCLTY_ID}`,
    kind,
    name: r.FCLTY_NM.trim(),
    type: KIND_META[kind].label,
    address,
    phone: "",
    homepage: "",
    lat,
    lng,
    capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
    enrolled: null,
    vacancy: null,
    ageOpen: AGES.map((a) => a >= lo && a <= hi),
    extended: sat ? { weekend: true } : {},
    hours: Object.keys(hours).length ? hours : undefined,
    asOf: (r.UPDT_DT ?? "").slice(0, 10),
    source,
  };
}

function careCenterSource(id: string, kind: FacilityKind, label: string, service: string): FacilitySource {
  return {
    id,
    kind,
    label,
    async run(): Promise<SourceRun> {
      const key = process.env.SEOUL_OPEN_API_KEY?.trim();
      if (!key) return { facilities: [], parts: [{ key: id, count: 0, skipped: "SEOUL_OPEN_API_KEY 없음" }], partial: true };
      try {
        const rows = (await fetchAll(key, service, false)) as CareCenterRow[];
        const list = rows.flatMap((r) => normalizeCareCenter(r, kind, id) ?? []);
        const count = new Map<string, number>();
        for (const r of rows) count.set(String(r.ATDRC_CODE), (count.get(String(r.ATDRC_CODE)) ?? 0) + 1);
        return {
          facilities: list,
          parts: DISTRICTS.map((d) => ({ key: d.code, count: count.get(d.code) ?? 0 })),
          partial: false,
          complete: true,
        };
      } catch (e) {
        return { facilities: [], parts: [{ key: id, count: 0, error: e instanceof Error ? e.message : "unknown" }], partial: true };
      }
    },
  };
}

export const seoulLocalCenter = careCenterSource("seoul-localcenter", "localcenter", "서울 지역아동센터", "TnFcltySttusInfo1003");
export const seoulKiumCenter = careCenterSource("seoul-kiumcenter", "kiumcenter", "서울 우리동네키움센터", "TnFcltySttusInfo1001");
