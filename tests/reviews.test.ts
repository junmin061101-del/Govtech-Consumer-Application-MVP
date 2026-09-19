import { describe, expect, it } from "vitest";
import { maskNickname, reviewId, summarize } from "@/lib/reviews";

describe("reviews helpers", () => {
  it("닉네임은 첫 글자만 보이게 가린다", () => {
    expect(maskNickname("김민수")).toBe("김**");
    expect(maskNickname("Kim")).toBe("K**");
    expect(maskNickname("지")).toBe("지");
    expect(maskNickname("  ")).toBe("익명");
    // 너무 긴 닉네임에서 길이를 노출하지 않는다
    expect(maskNickname("가나다라마바사아")).toBe("가***");
  });

  it("평균 별점과 개수를 계산하고, 리뷰가 없으면 0 이다", () => {
    expect(summarize([])).toEqual({ count: 0, avg: 0 });
    expect(summarize([{ rating: 5 }, { rating: 4 }, { rating: 3 }])).toEqual({ count: 3, avg: 4 });
  });

  it("문서 ID 는 시설당 1인 1리뷰가 되도록 시설ID_uid 이다", () => {
    expect(reviewId("kakao:123", "kakao:999")).toBe("kakao:123_kakao:999");
  });
});
