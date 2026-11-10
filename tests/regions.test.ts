import { describe, expect, it } from "vitest";
import { coordToDong, isKnownDong, regionsPayload } from "@/lib/server/regions";

describe("행정동 경계·코드", () => {
  it("서울 25개 구와 행정동 코드 테이블을 갖고 있다", () => {
    const r = regionsPayload();
    expect(r.sigungu).toHaveLength(25);
    expect(r.dongs.length).toBeGreaterThan(400);
    expect(r.dongs.every((d) => /^11\d{8}$/.test(d.code) && d.code.startsWith(d.sigunguCode))).toBe(true);
    expect(r.attribution).toContain("SGIS");
  });

  it("좌표를 행정동으로 바꾼다 (구 경계와 무관하게 서울 전역)", () => {
    expect(coordToDong(37.5131, 126.9426)?.sigunguCode).toBe("11590"); // 노량진역 → 동작구
    expect(coordToDong(37.5663, 126.9779)?.sigunguCode).toBe("11140"); // 서울시청 → 중구
    expect(coordToDong(37.4979, 127.0276)?.sigunguCode).toBe("11650"); // 강남역 서쪽 → 서초구
    const hit = coordToDong(37.5131, 126.9426)!;
    expect(isKnownDong(hit.emdCode)).toBe(true);
  });

  it("지원 지역 밖이면 null", () => {
    expect(coordToDong(35.1796, 129.0756)).toBeNull(); // 부산
    expect(coordToDong(NaN, 127)).toBeNull();
  });
});
