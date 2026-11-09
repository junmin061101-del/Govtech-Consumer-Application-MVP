// 행정동 경계·코드 테이블과 좌표 → 행정동 변환 (서버 전용).
// 다른 시·도를 추가하려면 같은 형식의 JSON 을 data/regions/ 에 넣고 REGION_FILES 에 더한다.
import seoul from "@/data/regions/seoul-emd.json";
import type { Dong, RegionsPayload, Sido, Sigungu } from "@/lib/regions";

interface RawDong {
  emd_code: string;
  name: string;
  sigungu_code: string;
  sido_code: string;
  center: { lat: number; lng: number };
  /** [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
  /** 외곽 링 목록. 좌표는 [lng, lat] */
  rings: [number, number][][];
}

interface RegionFile {
  version: string;
  source: string;
  sido: { code: string; name: string };
  sigungu: Record<string, string>;
  dongs: RawDong[];
}

const REGION_FILES: RegionFile[] = [
  {
    ...(seoul as unknown as Omit<RegionFile, "sido" | "sigungu">),
    sido: { code: "11", name: "서울특별시" },
    sigungu: {
      "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구", "11215": "광진구",
      "11230": "동대문구", "11260": "중랑구", "11290": "성북구", "11305": "강북구", "11320": "도봉구",
      "11350": "노원구", "11380": "은평구", "11410": "서대문구", "11440": "마포구", "11470": "양천구",
      "11500": "강서구", "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
      "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구", "11740": "강동구",
    },
  },
];

const DONGS: RawDong[] = REGION_FILES.flatMap((f) => f.dongs);
const BY_CODE = new Map(DONGS.map((d) => [d.emd_code, d]));

const avg = (pts: { lat: number; lng: number }[]) => ({
  lat: Math.round((pts.reduce((s, p) => s + p.lat, 0) / pts.length) * 1e5) / 1e5,
  lng: Math.round((pts.reduce((s, p) => s + p.lng, 0) / pts.length) * 1e5) / 1e5,
});

let payload: RegionsPayload | null = null;

export function regionsPayload(): RegionsPayload {
  if (payload) return payload;
  const sido: Sido[] = REGION_FILES.map((f) => ({ ...f.sido, center: avg(f.dongs.map((d) => d.center)) }));
  const sigungu: Sigungu[] = REGION_FILES.flatMap((f) =>
    Object.entries(f.sigungu).map(([code, name]) => ({
      code,
      name,
      sidoCode: f.sido.code,
      center: avg(f.dongs.filter((d) => d.sigungu_code === code).map((d) => d.center)),
    })),
  );
  const dongs: Dong[] = DONGS.map((d) => ({ code: d.emd_code, name: d.name, sigunguCode: d.sigungu_code, center: d.center }));
  payload = { sido, sigungu, dongs, attribution: REGION_FILES.map((f) => f.source).join(" / ") };
  return payload;
}

export const isKnownDong = (code: string) => BY_CODE.has(code);
export const dongByCode = (code: string) => BY_CODE.get(code) ?? null;

/** 한 링 안에 점이 있는지 (ray casting). ring 좌표는 [lng, lat] */
export function inRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 좌표 → 행정동. 지원 지역 밖이면 null */
export function coordToDong(lat: number, lng: number): { emdCode: string; sigunguCode: string; sidoCode: string } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const d of DONGS) {
    const [minLat, minLng, maxLat, maxLng] = d.bbox;
    if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
    if (d.rings.some((r) => inRing(lat, lng, r))) {
      return { emdCode: d.emd_code, sigunguCode: d.sigungu_code, sidoCode: d.sido_code };
    }
  }
  return null;
}
