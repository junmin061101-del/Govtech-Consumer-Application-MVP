// 지역은 코드로만 다룬다: 시·도(sido_code 2자리) > 시·군·구(sigungu_code 5자리) > 행정동(emd_code 10자리).
// 경계·좌표 원본은 data/regions/*.json 이고, 서버(lib/server/regions.ts)가 읽어 /api/regions 로 가볍게 내려준다.

export interface Sido {
  code: string;
  name: string;
  center: { lat: number; lng: number };
}

export interface Sigungu {
  code: string;
  name: string;
  sidoCode: string;
  center: { lat: number; lng: number };
}

export interface Dong {
  code: string;
  name: string;
  sigunguCode: string;
  center: { lat: number; lng: number };
}

export interface RegionsPayload {
  sido: Sido[];
  sigungu: Sigungu[];
  dongs: Dong[];
  /** 경계 데이터 출처 표기 (라이선스상 필수) */
  attribution: string;
}

let cache: Promise<RegionsPayload> | null = null;

/** 브라우저에서 지역 목록을 한 번만 받아 둔다. */
export function loadRegions(): Promise<RegionsPayload> {
  if (!cache) {
    cache = fetch("/api/regions").then(async (r) => {
      if (!r.ok) {
        cache = null;
        throw new Error("지역 정보를 불러오지 못했어요");
      }
      return r.json();
    });
  }
  return cache;
}

export function dongLabel(regions: RegionsPayload | null, code: string): string {
  const d = regions?.dongs.find((x) => x.code === code);
  if (!d) return code;
  const g = regions?.sigungu.find((x) => x.code === d.sigunguCode);
  return g ? `${g.name} ${d.name}` : d.name;
}
