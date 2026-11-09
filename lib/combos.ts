import { basicMatch, facilityInterval, fromMin, haversineM, toMin } from "./filter";
import type { Facility, Filters } from "./types";

/** 시설 간 이동은 직선거리 기준 도보(약 67m/분)로 계산한다. */
const WALK_M_PER_MIN = 67;
/** 두 시설 사이 이동이 이보다 길면 조합으로 내지 않는다. */
export const MAX_TRANSFER_MIN = 20;
export const MAX_COMBOS = 3;

export interface Combo {
  first: Facility;
  second: Facility;
  /** 첫 시설에서 나오는 시각 (첫 시설 종료 시각 또는 요청 끝) */
  handoff: string;
  transferMin: number;
  transferM: number;
}

/**
 * 한 곳으로 필요한 시간을 못 채울 때, 운영시간을 이어 붙여 [start, end] 를 덮는 두 시설 조합.
 * 첫 시설이 시작 시각부터 맡고, 첫 시설이 끝나는 시각 + 이동 시간 안에 두 번째 시설이 열려 있어
 * 끝 시각까지 맡을 수 있어야 한다. 두 시설 모두 이동 범위 안·나이·종류·빈자리 조건을 통과해야 한다.
 * 운영 시작·끝을 모두 아는 시설만 쓴다 (모르는 시설로 조합을 만들면 안내가 틀릴 수 있다).
 */
export function findCombos(all: Facility[], filters: Filters): Combo[] {
  const s = toMin(filters.start);
  const e = toMin(filters.end);
  if (e <= s) return [];

  const pool = all.flatMap((f) => {
    if (f.vacancy !== null && f.vacancy <= 0) return [];
    if (!basicMatch(f, filters).ok) return [];
    const iv = facilityInterval(f, filters.day);
    return iv ? [{ f, ...iv }] : [];
  });

  const starters = pool.filter((p) => p.open <= s && p.close > s && p.close < e);
  const out: Combo[] = [];
  for (const a of starters) {
    for (const b of pool) {
      if (b.f.id === a.f.id || b.close < e) continue;
      const transferM = haversineM(a.f, b.f);
      const transferMin = Math.ceil(transferM / WALK_M_PER_MIN);
      if (transferMin > MAX_TRANSFER_MIN) continue;
      // 두 번째 시설이 아이가 도착하는 시각에 이미 열려 있어야 한다
      if (b.open > a.close + transferMin) continue;
      out.push({ first: a.f, second: b.f, handoff: fromMin(a.close), transferMin, transferM });
    }
  }
  out.sort((x, y) => x.transferMin - y.transferMin || x.transferM - y.transferM);

  // 같은 시설이 여러 조합에 반복되면 다양성이 떨어지므로 첫 시설 기준으로 하나씩만 남긴다
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.first.id) && seen.add(c.first.id)).slice(0, MAX_COMBOS);
}
