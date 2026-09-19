"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FilterBar from "@/components/FilterBar";
import KakaoMap from "@/components/KakaoMap";
import { FacilityDetail, ResultList } from "@/components/ResultPanel";
import { loadExtraFacilities } from "@/lib/extras";
import { matchFacilities, walkMinToM } from "@/lib/filter";
import { KIND_ORDER } from "@/lib/kinds";
import type { FacilitiesPayload, Facility, Filters } from "@/lib/types";

const DEFAULTS: Filters = {
  age: null,
  kinds: [],
  day: "weekday",
  start: "09:00",
  end: "18:00",
  center: null,
  radiusM: walkMinToM(10),
};

export default function Home() {
  const [data, setData] = useState<FacilitiesPayload | null>(null);
  const [extras, setExtras] = useState<Facility[]>([]);
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

  // 유치원·지역아동센터 등은 카카오맵 검색으로 따로 불러온다. 실패해도 어린이집 지도는 그대로 동작한다.
  useEffect(() => {
    loadExtraFacilities()
      .then(setExtras)
      .catch(() => setExtras([]));
  }, []);

  const all = useMemo(() => (data ? [...data.facilities, ...extras] : []), [data, extras]);
  const availableKinds = useMemo(() => KIND_ORDER.filter((k) => all.some((f) => f.kind === k)), [all]);
  const matches = useMemo(() => matchFacilities(all, filters), [all, filters]);
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
          availableKinds={availableKinds}
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
