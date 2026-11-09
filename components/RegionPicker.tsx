"use client";

import { useEffect, useState } from "react";
import { loadRegions, type RegionsPayload } from "@/lib/regions";
import { chip, select } from "@/lib/ui";

export function useRegions() {
  const [regions, setRegions] = useState<RegionsPayload | null>(null);
  useEffect(() => {
    loadRegions()
      .then(setRegions)
      .catch(() => setRegions(null));
  }, []);
  return regions;
}

/** 구 → 행정동 선택. max 개까지 고를 수 있다. */
export function DongPicker({
  value,
  onChange,
  max = 1,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  max?: number;
}) {
  const regions = useRegions();
  const firstGu = regions?.dongs.find((d) => d.code === value[0])?.sigunguCode;
  const [gu, setGu] = useState<string>("");
  const curGu = gu || firstGu || "";

  if (!regions) return <p className="text-xs text-stone-500">지역 목록을 불러오는 중…</p>;

  const dongs = regions.dongs.filter((d) => d.sigunguCode === curGu);
  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else if (max === 1) onChange([code]);
    else if (value.length < max) onChange([...value, code]);
  };

  return (
    <div className="space-y-2">
      <select aria-label="구 선택" className={`${select} w-full`} value={curGu} onChange={(e) => setGu(e.target.value)}>
        <option value="">구를 골라 주세요</option>
        {regions.sigungu.map((g) => (
          <option key={g.code} value={g.code}>
            {g.name}
          </option>
        ))}
      </select>
      {dongs.length > 0 && (
        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {dongs.map((d) => (
            <button key={d.code} type="button" className={chip(value.includes(d.code))} onClick={() => toggle(d.code)}>
              {d.name}
            </button>
          ))}
        </div>
      )}
      {value.length > 0 && (
        <p className="text-xs text-stone-600">
          선택:{" "}
          {value
            .map((c) => {
              const d = regions.dongs.find((x) => x.code === c);
              const g = regions.sigungu.find((x) => x.code === d?.sigunguCode);
              return d ? `${g?.name ?? ""} ${d.name}` : c;
            })
            .join(", ")}
        </p>
      )}
    </div>
  );
}
