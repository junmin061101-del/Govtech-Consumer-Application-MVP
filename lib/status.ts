import type { Facility } from "./types";

/** 정원·현원 기준일이 이 일수 안이어야 '이용 가능'으로 본다. */
export const FRESH_DAYS = 14;

export interface Availability {
  status: "available" | "needs-check";
  label: string;
  /** 데이터 기준일 표시용 (YYYY-MM-DD). 모르면 null */
  asOf: string | null;
}

/** "20260918", "2026-09-18" 모두 받는다. */
export function parseDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 상태 배지.
 * - 이용 가능: 정원·현원이 있고 기준일이 14일 이내이며 여유(정원 − 현원)가 있다.
 * - 확인 필요: 운영 정보만 있거나, 기준일이 14일을 넘었거나, 기준일을 모른다.
 */
export function availability(f: Facility, now: Date = new Date()): Availability {
  const asOfDate = f.asOf ? parseDate(f.asOf) : null;
  const asOf = asOfDate ? iso(asOfDate) : null;
  if (f.capacity === null || f.enrolled === null || f.vacancy === null) {
    return { status: "needs-check", label: "확인 필요 · 정원 정보 없음", asOf };
  }
  if (!asOfDate) return { status: "needs-check", label: "확인 필요 · 기준일 모름", asOf };
  const ageDays = (now.getTime() - asOfDate.getTime()) / 86_400_000;
  if (ageDays > FRESH_DAYS) return { status: "needs-check", label: `확인 필요 · ${FRESH_DAYS}일 지난 정보`, asOf };
  if (f.vacancy <= 0) return { status: "needs-check", label: "정원 마감", asOf };
  return { status: "available", label: "이용 가능", asOf };
}
