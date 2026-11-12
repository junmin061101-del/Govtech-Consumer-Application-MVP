// 시설 저장소(facilities)와 매일 수집. 지도는 화면 영역(bounds)으로만 조회한다.
import { encodeGeohash, geohashCover } from "@/lib/geohash";
import type { Bounds, Facility } from "@/lib/types";
import { coordToDong } from "./regions";
import { SOURCES, type FacilitySource } from "./sources";
import { store } from "./store";

export const FACILITIES = "facilities";
const META = "sync_runs";

type StoredFacility = Facility & { geohash: string; [k: string]: unknown };

export interface FacilityChange {
  id: string;
  prevVacancy: number | null;
  vacancy: number | null;
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  total: number;
  sample: boolean;
  sources: { id: string; label: string; count: number; parts: { key: string; count: number; error?: string; skipped?: string }[] }[];
  changes: FacilityChange[];
}

/** 원천 행 → 저장 문서. 지원 지역(행정동 경계) 밖 좌표는 null */
export function locate(f: Facility, collectedAt: string): StoredFacility | null {
  const region = coordToDong(f.lat, f.lng);
  if (!region) return null;
  return {
    ...f,
    sidoCode: region.sidoCode,
    sigunguCode: region.sigunguCode,
    emdCode: region.emdCode,
    geohash: encodeGeohash(f.lat, f.lng),
    collectedAt,
  };
}

export async function syncFacilities(sources: FacilitySource[] = SOURCES, now = new Date()): Promise<SyncReport> {
  const startedAt = now.toISOString();
  const s = store();
  const report: SyncReport = { startedAt, finishedAt: startedAt, total: 0, sample: false, sources: [], changes: [] };

  for (const src of sources) {
    const run = await src.run();
    report.sample ||= run.sample === true;
    const located = run.facilities.flatMap((f) => locate(f, startedAt) ?? []);

    const prev = new Map((await s.list<StoredFacility>(FACILITIES, [["source", "==", src.id]])).map((d) => [d.id, d]));
    for (const f of located) {
      const p = prev.get(f.id);
      if (p && p.vacancy !== f.vacancy) report.changes.push({ id: f.id, prevVacancy: p.vacancy, vacancy: f.vacancy });
    }
    await s.setMany(FACILITIES, located.map((f) => [f.id, f] as [string, StoredFacility]));

    // 이번에 성공적으로 받은 구에서 사라진 시설(폐지 등)은 지운다. 실패·건너뛴 구는 그대로 둔다.
    const okParts = new Set(run.parts.filter((p) => !p.error && !p.skipped).map((p) => p.key));
    if (!run.partial) {
      const seen = new Set(located.map((f) => f.id));
      for (const [id, p] of prev) {
        if (seen.has(id)) continue;
        if (run.complete || (p.sigunguCode && okParts.has(p.sigunguCode))) await s.delete(FACILITIES, id);
      }
    }

    report.sources.push({ id: src.id, label: src.label, count: located.length, parts: run.parts });
    report.total += located.length;
  }

  report.finishedAt = new Date().toISOString();
  await s.set(META, "latest", report as unknown as Record<string, unknown>);
  return report;
}

export async function lastSync(): Promise<SyncReport | null> {
  return store().get<SyncReport & Record<string, unknown>>(META, "latest");
}

/** 한 번에 보내는 최대 시설 수. 넘으면 화면 중심에서 가까운 순으로 자른다. */
export const MAX_IN_VIEW = 600;

export async function facilitiesInBounds(b: Bounds): Promise<{ facilities: Facility[]; truncated: boolean }> {
  // geohash 접두사별 범위 쿼리로 화면 근처만 읽고, 좌표로 한 번 더 거른다
  const lists = await Promise.all(
    geohashCover(b).map((p) =>
      store().list<StoredFacility>(FACILITIES, [
        ["geohash", ">=", p],
        ["geohash", "<", `${p}~`],
      ]),
    ),
  );
  const seen = new Set<string>();
  const inside = lists
    .flat()
    .filter((f) => !seen.has(f.id) && seen.add(f.id) && f.lat >= b.swLat && f.lat <= b.neLat && f.lng >= b.swLng && f.lng <= b.neLng);
  const truncated = inside.length > MAX_IN_VIEW;
  if (truncated) {
    const c = { lat: (b.swLat + b.neLat) / 2, lng: (b.swLng + b.neLng) / 2 };
    const d = (f: Facility) => (f.lat - c.lat) ** 2 + (f.lng - c.lng) ** 2;
    inside.sort((a, z) => d(a) - d(z));
  }
  return { facilities: inside.slice(0, MAX_IN_VIEW).map(({ geohash: _g, ...f }) => f as Facility), truncated };
}

export async function facilityById(id: string): Promise<Facility | null> {
  return store().get<StoredFacility>(FACILITIES, id);
}
