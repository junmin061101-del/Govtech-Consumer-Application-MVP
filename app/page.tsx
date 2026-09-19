"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FilterBar from "@/components/FilterBar";
import KakaoMap from "@/components/KakaoMap";
import { FacilityDetail, ResultList } from "@/components/ResultPanel";
import { matchFacilities, walkMinToM } from "@/lib/filter";
import type { FacilitiesPayload, Filters } from "@/lib/types";

const DEFAULTS: Filters = {
  age: null,
  day: "weekday",
  start: "09:00",
  end: "18:00",
  center: null,
  radiusM: walkMinToM(10),
};

export default function Home() {
  const [data, setData] = useState<FacilitiesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // draft: 입력 중인 조건 / filters: 검색 버튼으로 적용된 조건 (지도·목록은 이것만 본다)
  const [draft, setDraft] = useState<Filters>(DEFAULTS);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);

  useEffect(() => {
    fetch("/api/facilities")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "불러오기 실패");
        setData(j);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const matches = useMemo(() => (data ? matchFacilities(data.facilities, filters) : []), [data, filters]);
  const selected = matches.find((m) => m.facility.id === selectedId) ?? null;

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(filters), [draft, filters]);

  const onChange = useCallback((patch: Partial<Filters>) => {
    setDraft((f) => ({ ...f, ...patch }));
  }, []);

  const onSearch = useCallback(() => {
    setFilters(draft);
    setSelectedId(null);
  }, [draft]);

  const onPick = useCallback((pos: { lat: number; lng: number }) => {
    setDraft((f) => ({ ...f, center: { ...pos, label: "선택한 위치" } }));
    setPickMode(false);
  }, []);

  return (
    <main className="app-grid h-dvh bg-stone-50 text-stone-900">
      <div style={{ gridArea: "filter" }} className="relative z-30">
        <FilterBar
          filters={draft}
          onChange={onChange}
          pickMode={pickMode}
          onPickMode={setPickMode}
          resultCount={matches.length}
          dirty={dirty}
          onSearch={onSearch}
        />
        {data?.source === "sample" && (
          <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
            샘플 데이터(5곳)로 동작 중이에요. SEOUL_OPEN_API_KEY 를 설정하면 동작구 전체가 표시돼요.
          </p>
        )}
      </div>

      <div style={{ gridArea: "map" }} className="relative min-h-0">
        <KakaoMap
          matches={matches}
          selectedId={selectedId}
          onSelect={setSelectedId}
          center={filters.center}
          radiusM={filters.radiusM}
          pickMode={pickMode}
          onPick={onPick}
        />
      </div>

      <section style={{ gridArea: "list" }} className="min-h-0 overflow-y-auto border-t border-stone-200 bg-white">
        {error ? (
          <p className="p-6 text-center text-sm text-red-600">{error}</p>
        ) : !data ? (
          <p className="p-6 text-center text-sm text-stone-500">동작구 어린이집을 불러오는 중…</p>
        ) : selected ? (
          <FacilityDetail match={selected} age={filters.age} onClose={() => setSelectedId(null)} />
        ) : (
          <ResultList matches={matches} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </section>
    </main>
  );
}
