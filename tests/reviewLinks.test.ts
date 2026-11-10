import { beforeEach, describe, expect, it } from "vitest";
import { guOf, reviewLinks, reviewQuery } from "@/lib/reviewLinks";
import { runTool } from "@/lib/server/agent";
import { topicsOf } from "@/lib/server/agentLog";
import { FACILITIES } from "@/lib/server/facilities";
import { store } from "@/lib/server/store";
import { fresh } from "./helpers";

const kg = { name: "서울신구유치원", address: "서울특별시 강남구 압구정로14길 21" };

describe("외부 후기 링크", () => {
  beforeEach(fresh);

  it("이름 + 구로 검색해 같은 이름 시설을 구분한다 (이름에 구가 있으면 덧붙이지 않음)", () => {
    expect(guOf(kg.address)).toBe("강남구");
    expect(reviewQuery(kg)).toBe("서울신구유치원 강남구");
    expect(reviewQuery({ name: "강남구립 역삼어린이집", address: "서울특별시 강남구 역삼로 1" })).toBe("강남구립 역삼어린이집");
    expect(reviewQuery({ name: "열린지역아동센터", address: "" })).toBe("열린지역아동센터");
  });

  it("네이버 블로그·네이버 지도·카카오맵 링크 (카카오 장소 페이지가 있으면 그곳으로)", () => {
    const [blog, nmap, kmap] = reviewLinks(kg);
    const q = encodeURIComponent("서울신구유치원 강남구");
    expect(blog.url).toBe(`https://search.naver.com/search.naver?where=blog&query=${q}`);
    expect(nmap.url).toBe(`https://map.naver.com/p/search/${q}`);
    expect(kmap.url).toBe(`https://map.kakao.com/link/search/${q}`);
    expect(reviewLinks({ ...kg, detailUrl: "http://place.map.kakao.com/123" })[2].url).toBe("http://place.map.kakao.com/123");
  });

  it("AI 도구: 시설 id 로 저장된 이름·주소를 주고 이름만 줘도 동작한다 (URL·후기 내용은 모델에 주지 않음)", async () => {
    await store().set(FACILITIES, "kg:1", { id: "kg:1", kind: "kindergarten", ...kg, lat: 37.52, lng: 127.02 });
    const r = (await runTool("u1", "get_review_links", { facility_id: "kg:1" })) as Record<string, unknown>;
    expect(r).toMatchObject({ facility: "서울신구유치원", address: kg.address, buttons_shown: ["네이버 블로그 후기", "네이버 지도", "카카오맵"] });
    // 모델에는 URL 을 주지 않는다 (앱이 이름·주소로 만든다)
    expect(JSON.stringify(r)).not.toMatch(/https?:/);
    // 이름만 줘도 수집한 시설 중 같은 이름이 하나면 그 주소를 쓴다
    expect(await runTool("u1", "get_review_links", { name: "서울신구유치원" })).toMatchObject({ address: kg.address });
    const byName = (await runTool("u1", "get_review_links", { name: "열린지역아동센터" })) as Record<string, unknown>;
    expect(byName).toMatchObject({ facility: "열린지역아동센터", address: "" });
    expect(await runTool("u1", "get_review_links", {})).toHaveProperty("error");
  });

  it("대시보드 주제 분류에 '후기·평판'이 잡힌다", () => {
    expect(topicsOf({ question: "여기 유치원 후기 알려줘", tools: [] })).toContain("reviews");
    expect(topicsOf({ question: "알려줘", tools: ["get_review_links"] })).toContain("reviews");
  });
});
