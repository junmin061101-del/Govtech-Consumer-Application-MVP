import type { WidenDimension } from "./events";
import { BASE_CLOSE, BASE_OPEN, fromMin, toMin, walkMinToM } from "./filter";
import { KIND_META } from "./kinds";
import type { Filters } from "./types";

/** 도보 범위 단계 (분) */
export const WALK_STEPS = [5, 10, 15, 20, 30];

export interface WidenStep {
  dimension: WidenDimension;
  label: string;
  from: string;
  to: string;
  patch: Partial<Filters>;
}

const walkMin = (radiusM: number) => Math.round(radiusM / 67);

/**
 * '범위 넓혀 다시 찾기' 한 단계. 넓힐 수 없으면 null.
 * - distance: 도보 범위를 다음 단계로
 * - time: 기본 보육시간 밖으로 나간 쪽을 30분 줄인다 (끝 시각 우선)
 * - kind: 고른 시설 종류를 모든 종류로
 */
export function widenStep(filters: Filters, dimension: WidenDimension): WidenStep | null {
  if (dimension === "distance") {
    if (!filters.center) return null;
    const cur = walkMin(filters.radiusM);
    const next = WALK_STEPS.find((m) => m > cur);
    if (!next) return null;
    return {
      dimension,
      label: `도보 ${next}분까지 넓히기`,
      from: `${cur}분`,
      to: `${next}분`,
      patch: { radiusM: walkMinToM(next) },
    };
  }

  if (dimension === "time") {
    const s = toMin(filters.start);
    const e = toMin(filters.end);
    if (e - s <= 60) return null;
    const lateBy = e - toMin(BASE_CLOSE);
    const earlyBy = toMin(BASE_OPEN) - s;
    if (lateBy <= 0 && earlyBy > 0) {
      const start = fromMin(s + 30);
      return { dimension, label: `시작을 ${start}로 늦추기`, from: filters.start, to: start, patch: { start } };
    }
    const end = fromMin(e - 30);
    return { dimension, label: `끝을 ${end}로 당기기`, from: filters.end, to: end, patch: { end } };
  }

  if (filters.kinds.length === 0) return null;
  return {
    dimension,
    label: "모든 시설 종류 보기",
    from: filters.kinds.map((k) => KIND_META[k].label).join("·"),
    to: "전체",
    patch: { kinds: [] },
  };
}
