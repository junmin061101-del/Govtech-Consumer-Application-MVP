// 카카오맵 JS SDK 로더. 공식 타입 패키지가 없어 필요한 부분만 any 로 다룬다.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Kakao = any;

declare global {
  interface Window {
    kakao?: Kakao;
  }
}

export const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";

let sdk: Promise<Kakao> | null = null;

export function loadKakao(): Promise<Kakao> {
  if (!KAKAO_KEY) return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_MAP_KEY 가 설정되지 않았습니다"));
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => {
      sdk = null;
      reject(new Error("카카오맵을 불러오지 못했습니다. 앱 키와 등록된 도메인을 확인해 주세요"));
    };
    document.head.appendChild(s);
  });
  return sdk;
}

export interface PlaceHit {
  label: string;
  sub: string;
  lat: number;
  lng: number;
}

/** 동작구 중심 반경 6km 안에서 키워드 검색 */
export async function searchPlaces(query: string, center: { lat: number; lng: number }): Promise<PlaceHit[]> {
  const kakao = await loadKakao();
  return new Promise((resolve) => {
    new kakao.maps.services.Places().keywordSearch(
      query,
      (data: any[], status: string) => {
        if (status !== kakao.maps.services.Status.OK) return resolve([]);
        resolve(
          data.slice(0, 6).map((d) => ({
            label: d.place_name,
            sub: d.road_address_name || d.address_name,
            lat: Number(d.y),
            lng: Number(d.x),
          })),
        );
      },
      { location: new kakao.maps.LatLng(center.lat, center.lng), radius: 6000 },
    );
  });
}
