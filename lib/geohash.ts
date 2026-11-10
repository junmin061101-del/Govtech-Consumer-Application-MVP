// 시설 문서에 geohash 를 함께 저장해 두면 Firestore 이전 후 화면 영역(bounds) 조회를 범위 쿼리로 바꿀 수 있다.
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lng: number, precision = 9): string {
  let latLo = -90,
    latHi = 90,
    lngLo = -180,
    lngHi = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngLo = mid;
      } else {
        ch <<= 1;
        lngHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latLo = mid;
      } else {
        ch <<= 1;
        latHi = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** 정밀도별 셀 크기 (도). 경도 비트가 위도보다 하나 많거나 같다. */
function cellSize(precision: number) {
  const bits = precision * 5;
  const lngBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { lat: 180 / 2 ** latBits, lng: 360 / 2 ** lngBits };
}

/**
 * 화면 영역을 덮는 geohash 접두사 목록. 접두사 하나당 범위 쿼리 하나(geohash >= p && < p + "~")가 된다.
 * 접두사가 maxCells 개를 넘지 않는 가장 정밀한 단계를 고른다.
 */
export function geohashCover(
  b: { swLat: number; swLng: number; neLat: number; neLng: number },
  maxCells = 12,
): string[] {
  for (let p = 7; p >= 1; p--) {
    const { lat, lng } = cellSize(p);
    const rows = Math.floor(b.neLat / lat) - Math.floor(b.swLat / lat) + 1;
    const cols = Math.floor(b.neLng / lng) - Math.floor(b.swLng / lng) + 1;
    if (rows * cols > maxCells && p > 1) continue;
    const out = new Set<string>();
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const la = Math.min(b.neLat, (Math.floor(b.swLat / lat) + i) * lat + lat / 2);
        const ln = Math.min(b.neLng, (Math.floor(b.swLng / lng) + j) * lng + lng / 2);
        out.add(encodeGeohash(Math.max(b.swLat, la), Math.max(b.swLng, ln), p));
      }
    }
    return [...out];
  }
  return [""];
}
