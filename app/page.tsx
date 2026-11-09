"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AlertSheet, { type AlertDraft } from "@/components/AlertSheet";
import { useAuth } from "@/components/AuthProvider";
import FilterBar, { type QuickPlace } from "@/components/FilterBar";
import KakaoMap from "@/components/KakaoMap";
import { FacilityDetail, ResultList } from "@/components/ResultPanel";
import { useRegions } from "@/components/RegionPicker";
import { useCurrentLocation, type Here } from "@/components/useCurrentLocation";
import { findCombos } from "@/lib/combos";
import { WIDEN_DIMENSIONS } from "@/lib/events";
import { logEvent } from "@/lib/logEvent";
import { dropDuplicates, loadExtraFacilities } from "@/lib/extras";
import { authFetch } from "@/lib/firebase";
import { matchFacilities, walkMinToM } from "@/lib/filter";
import type { Flags } from "@/lib/flags";
import { KIND_ORDER } from "@/lib/kinds";
import { defaultAge, type ProfileView } from "@/lib/profile";
import type { RegionsPayload } from "@/lib/regions";
import type { Bounds, FacilitiesPayload, Facility, Filters, Match } from "@/lib/types";
import { widenStep, type WidenStep } from "@/lib/widen";

/** 지도가 없을 때(카카오 키 없음 등) 기준점 주변 약 ±2km 를 조회한다 */
const boxAround = (c: { lat: number; lng: number }): Bounds => ({
  swLat: c.lat - 0.018,
  swLng: c.lng - 0.023,
  neLat: c.lat + 0.018,
  neLng: c.lng + 0.023,
});

const inBounds = (f: Facility, b: Bounds) => f.lat >= b.swLat && f.lat <= b.neLat && f.lng >= b.swLng && f.lng <= b.neLng;

/** 이보다 넓게 보면(축소하면) 시설 조회를 멈추고 확대를 안내한다 */
const MAX_LEVEL_FOR_FETCH = 8;
/** 카카오 장소 검색(유치원·센터)은 더 가까이 볼 때만 */
const MAX_LEVEL_FOR_EXTRAS = 6;

export default function Home() {
  const { profile, flags, loading } = useAuth();
  const regions = useRegions();
  if (loading || !regions) {
    return <p className="grid h-dvh place-items-center bg-stone-50 text-sm text-stone-500">불러오는 중…</p>;
  }
  return <MapApp profile={profile} regions={regions} flags={flags} />;
}

function MapApp({ profile, regions, flags }: { profile: ProfileView | null; regions: RegionsPayload; flags: Flags }) {
  // 관심 지역(행정동) → 지도 기본 위치·빠른 선택
  const quickPlaces: QuickPlace[] = useMemo(
    () =>
      (profile?.interestDongs ?? []).flatMap((code) => {
        const d = regions.dongs.find((x) => x.code === code);
        return d ? [{ label: d.name, ...d.center }] : [];
      }),
    [profile, regions],
  );
  const initialCenter = quickPlaces[0] ?? regions.sido[0].center;

  // 가입한 프로필로 검색 조건(연령, 지역)을 자동 채운다
  const defaults: Filters = useMemo(
    () => ({
      age: defaultAge(profile),
      kinds: [],
      day: "weekday",
      start: "09:00",
      end: "18:00",
      center: quickPlaces[0] ? { lat: quickPlaces[0].lat, lng: quickPlaces[0].lng, label: quickPlaces[0].label } : null,
      radiusM: walkMinToM(10),
    }),
    // 처음 한 번만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [loaded, setLoaded] = useState<Map<string, Facility>>(new Map());
  const [meta, setMeta] = useState<Omit<FacilitiesPayload, "facilities"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ bounds: Bounds; level: number }>({ bounds: boxAround(initialCenter), level: 6 });
  // draft: 입력 중인 조건 / filters: 검색 버튼으로 적용된 조건 (지도·목록은 이것만 본다)
  const [draft, setDraft] = useState<Filters>(defaults);
  const [filters, setFilters] = useState<Filters>(defaults);
  const [searchSeq, setSearchSeq] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [alertDraft, setAlertDraft] = useState<AlertDraft | null>(null);

  const merge = useCallback((list: Facility[]) => {
    setLoaded((cur) => {
      const next = new Map(cur);
      for (const f of list) next.set(f.id, f);
      return next;
    });
  }, []);
  // 카카오 장소 검색 결과는 공공데이터 시설과 겹치는 것을 빼고 더한다
  const mergeExtras = useCallback((list: Facility[]) => {
    setLoaded((cur) => {
      const next = new Map(cur);
      for (const f of dropDuplicates(list, cur.values())) next.set(f.id, f);
      return next;
    });
  }, []);

  // 화면 영역이 바뀌면 그 영역 시설만 서버에서 받는다 (서울 전체를 한 번에 받지 않는다)
  useEffect(() => {
    if (view.level > MAX_LEVEL_FOR_FETCH) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const b = view.bounds;
      authFetch(`/api/facilities?bounds=${[b.swLat, b.swLng, b.neLat, b.neLng].map((n) => n.toFixed(5)).join(",")}`, {
        signal: ctrl.signal,
      })
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? "불러오기 실패");
          const { facilities, ...rest } = j as FacilitiesPayload;
          merge(facilities);
          setMeta(rest);
          setError(null);
        })
        .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
      // 유치원·지역아동센터 등은 카카오맵 검색으로 따로 불러온다. 실패해도 어린이집 지도는 그대로 동작한다.
      if (view.level <= MAX_LEVEL_FOR_EXTRAS) loadExtraFacilities(b).then(mergeExtras).catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [view, merge, mergeExtras]);

  const onBounds = useCallback((bounds: Bounds, level: number) => setView({ bounds, level }), []);

  // 위치를 정하지 않았으면 지금 보이는 영역 안 시설만 대상으로 한다. 위치를 정했으면 구 경계와 무관하게 반경으로 찾는다.
  const all = useMemo(() => {
    const list = [...loaded.values()];
    return filters.center ? list : list.filter((f) => inBounds(f, view.bounds));
  }, [loaded, filters.center, view.bounds]);
  const availableKinds = useMemo(() => KIND_ORDER.filter((k) => loaded.size === 0 || [...loaded.values()].some((f) => f.kind === k)), [loaded]);
  const matches = useMemo(() => matchFacilities(all, filters), [all, filters]);
  const full = useMemo(() => (flags.vacancy ? matchFacilities(all, filters, { full: true }) : []), [all, filters, flags.vacancy]);
  const combos = useMemo(() => (flags.matching && matches.length === 0 ? findCombos(all, filters) : []), [all, filters, matches.length, flags.matching]);
  const widen = useMemo(
    () => (flags.matching ? WIDEN_DIMENSIONS.flatMap((d) => widenStep(filters, d) ?? []) : []),
    [filters, flags.matching],
  );

  // 지도 핀: 결과가 있으면 결과, 없으면 조합 시설
  const pins: Match[] = useMemo(() => {
    if (matches.length > 0 || combos.length === 0) return matches;
    const seen = new Map<string, Match>();
    for (const c of combos) {
      for (const f of [c.first, c.second]) {
        seen.set(f.id, { facility: f, distanceM: null, hours: { label: "조합 이용", confidence: "needs-check" } });
      }
    }
    return [...seen.values()];
  }, [matches, combos]);
  const selected =
    pins.find((m) => m.facility.id === selectedId) ?? full.find((m) => m.facility.id === selectedId) ?? null;

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(filters), [draft, filters]);

  // 검색 결과 이벤트: 검색 후 시설이 다 들어올 때까지 잠깐 기다렸다가 한 번 남긴다
  const latest = useRef({ matches: 0, combos: 0, filters });
  latest.current = { matches: matches.length, combos: combos.length, filters };
  useEffect(() => {
    if (searchSeq === 0) return;
    const t = setTimeout(() => {
      const { matches: n, combos: c, filters: f } = latest.current;
      const walkMin = Math.round(f.radiusM / 67);
      logEvent({
        event_type: n > 0 ? "search_result" : "search_no_result",
        center: f.center,
        day: f.day,
        start: f.start,
        end: f.end,
        age: f.age,
        facility_types: f.kinds,
        meta: n > 0 ? { result_count: n, combo_count: c, walk_min: walkMin } : { walk_min: walkMin, combo_count: c },
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [searchSeq]);

  const onChange = useCallback((patch: Partial<Filters>) => {
    setDraft((f) => ({ ...f, ...patch }));
  }, []);

  const onSearch = useCallback(() => {
    setFilters(draft);
    setSelectedId(null);
    setSearchSeq((n) => n + 1);
  }, [draft]);

  // 현재 위치: 지도 위 '📍 내 위치' 버튼, 또는 '현재 위치 사용' 설정이 켜져 있으면 처음부터 현재 위치로 찾는다
  const loc = useCurrentLocation();
  const hereCenter = (h: Here) => ({ lat: h.lat, lng: h.lng, label: `내 위치 · ${h.label.split(" ").pop()}` });
  const usingHere = Boolean(filters.center?.label.startsWith("내 위치"));
  const autoApplied = useRef(false);
  useEffect(() => {
    // 저장된 설정으로 위치를 받았고, 아직 사용자가 검색 조건을 바꾸지 않았을 때만 자동으로 옮긴다
    if (!loc.here || autoApplied.current || searchSeq > 0) return;
    autoApplied.current = true;
    const c = hereCenter(loc.here);
    setDraft((f) => ({ ...f, center: c }));
    setFilters((f) => ({ ...f, center: c }));
    // 첫 위치를 정하는 용도라 한 번만 반응한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.here]);

  const onHere = useCallback(async () => {
    if (usingHere) {
      // 끄면 관심 지역으로 돌아간다
      loc.disable();
      const c = defaults.center;
      setDraft((f) => ({ ...f, center: c }));
      setFilters((f) => ({ ...f, center: c }));
      return;
    }
    const h = await loc.enable();
    if (!h) return;
    const c = hereCenter(h);
    setDraft((f) => ({ ...f, center: c }));
    setFilters((f) => ({ ...f, center: c }));
    setSelectedId(null);
    setSearchSeq((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingHere, loc.enable, loc.disable, defaults.center]);

  const onWiden = useCallback(
    (step: WidenStep) => {
      const next = { ...filters, ...step.patch };
      logEvent({
        event_type: "search_widened",
        center: filters.center,
        day: filters.day,
        start: filters.start,
        end: filters.end,
        age: filters.age,
        facility_types: filters.kinds,
        meta: { dimension: step.dimension, from: step.from, to: step.to },
      });
      setDraft(next);
      setFilters(next);
      setSearchSeq((n) => n + 1);
    },
    [filters],
  );

  const onPick = useCallback((pos: { lat: number; lng: number }) => {
    setDraft((f) => ({ ...f, center: { ...pos, label: "선택한 위치" } }));
    setPickMode(false);
  }, []);

  const conditionAlert = flags.vacancy
    ? () =>
        setAlertDraft({
          type: "condition",
          center: filters.center,
          day: filters.day,
          start: filters.start,
          end: filters.end,
          age: filters.age,
          kinds: filters.kinds,
          fallbackDong: profile?.interestDongs[0] ?? null,
        })
    : null;

  const zoomedOut = view.level > MAX_LEVEL_FOR_FETCH;

  return (
    <main className="app-grid h-app bg-stone-50 text-stone-900">
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
          quickPlaces={quickPlaces}
          searchCenter={filters.center ?? initialCenter}
        />
        {meta?.source === "sample" && (
          <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
            샘플 데이터(일부 시설)로 동작 중이에요. 정식 데이터 연결 후 수집된 구의 시설이 모두 표시돼요.
          </p>
        )}
        {meta?.source === "empty" && (
          <p className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
            아직 수집된 시설 데이터가 없어요. 매일 새벽 수집 작업이 돌면 표시돼요.
          </p>
        )}
        {(zoomedOut || meta?.truncated) && (
          <p className="bg-stone-100 px-4 py-1.5 text-xs text-stone-600">
            {zoomedOut ? "지도를 조금 더 확대하면 시설이 보여요." : "시설이 많아 가까운 곳부터 보여요. 확대하면 더 보여요."}
          </p>
        )}
      </div>

      <div style={{ gridArea: "map" }} className="relative min-h-0">
        <KakaoMap
          matches={pins}
          selectedId={selectedId}
          onSelect={setSelectedId}
          center={filters.center}
          radiusM={filters.radiusM}
          pickMode={pickMode}
          onPick={onPick}
          initialCenter={initialCenter}
          onBounds={onBounds}
        />
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
          <button
            onClick={onHere}
            disabled={loc.busy}
            aria-pressed={usingHere}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold shadow-md ${
              usingHere ? "bg-emerald-600 text-white" : "bg-white text-stone-800"
            }`}
          >
            {loc.busy ? "위치 확인 중…" : usingHere ? `📍 ${filters.center?.label.replace("내 위치 · ", "")} · 끄기` : "📍 내 위치"}
          </button>
          {loc.error && <p className="max-w-56 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs text-red-600 shadow">{loc.error}</p>}
        </div>
      </div>

      <section style={{ gridArea: "list" }} className="min-h-0 overflow-y-auto border-t border-stone-200 bg-white">
        {error ? (
          <p className="p-6 text-center text-sm text-red-600">{error}</p>
        ) : !meta ? (
          <p className="p-6 text-center text-sm text-stone-500">돌봄 시설을 불러오는 중…</p>
        ) : selected ? (
          <FacilityDetail
            match={selected}
            age={filters.age}
            onClose={() => setSelectedId(null)}
            onAlert={
              flags.vacancy && selected.facility.vacancy !== null
                ? () => setAlertDraft({ type: "facility", facilityId: selected.facility.id, facilityName: selected.facility.name })
                : null
            }
          />
        ) : (
          <ResultList
            matches={matches}
            full={full}
            combos={combos}
            widen={widen}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onWiden={onWiden}
            onAlert={conditionAlert}
            showBadge={flags.matching}
          />
        )}
      </section>

      {alertDraft && <AlertSheet draft={alertDraft} onClose={() => setAlertDraft(null)} />}
    </main>
  );
}
