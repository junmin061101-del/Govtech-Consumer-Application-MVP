"use client";

import { MAX_CHILD_MONTHS, MAX_CHILDREN } from "@/lib/profile";
import { secondaryBtn, select } from "@/lib/ui";

export interface ChildDraft {
  unit: "months" | "years";
  value: number;
}

export const toMonths = (c: ChildDraft) => (c.unit === "months" ? c.value : c.value * 12);
export const fromMonths = (m: number): ChildDraft => (m < 24 ? { unit: "months", value: m } : { unit: "years", value: Math.floor(m / 12) });

/** 아이 연령만 받는다 (이름·생년월일·사진은 받지 않는다). 여러 명 가능 */
export default function ChildAgesInput({ value, onChange }: { value: ChildDraft[]; onChange: (v: ChildDraft[]) => void }) {
  const set = (i: number, patch: Partial<ChildDraft>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch, ...(patch.unit ? { value: 0 } : {}) } : c)));

  return (
    <div className="space-y-2">
      {value.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-sm text-stone-600">{i + 1}번째</span>
          <select aria-label="단위" className={select} value={c.unit} onChange={(e) => set(i, { unit: e.target.value as ChildDraft["unit"] })}>
            <option value="months">개월</option>
            <option value="years">만 나이</option>
          </select>
          <select aria-label="연령" className={`${select} flex-1`} value={c.value} onChange={(e) => set(i, { value: Number(e.target.value) })}>
            {(c.unit === "months"
              ? Array.from({ length: 24 }, (_, m) => m)
              : Array.from({ length: Math.floor(MAX_CHILD_MONTHS / 12) + 1 }, (_, y) => y)
            ).map((n) => (
              <option key={n} value={n}>
                {c.unit === "months" ? `${n}개월` : `만 ${n}세`}
              </option>
            ))}
          </select>
          {value.length > 1 && (
            <button type="button" aria-label="삭제" className="rounded-full p-2 text-stone-400 hover:bg-stone-100" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </button>
          )}
        </div>
      ))}
      {value.length < MAX_CHILDREN && (
        <button type="button" className={`${secondaryBtn} w-full`} onClick={() => onChange([...value, { unit: "years", value: 0 }])}>
          + 아이 추가
        </button>
      )}
    </div>
  );
}
