import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plainText, searchBlog, toPost } from "@/lib/server/naverBlog";
import { GET } from "@/server/api/reviews/blog/route";
import { fresh, req } from "./helpers";

// NAVER API HUB 블로그 검색 실제 응답 모양 (2026-11)
const items = [
  { title: "<b>서울신구유치원</b> 전통농경체험 &amp; 가을 소풍", link: "https://blog.naver.com/a/1", description: "압구정 &quot;신구&quot; <b>유치원</b> 아이들이…", bloggername: "드니맘", postdate: "20261028" },
  { title: "강남구 유치원 총정리", link: "https://blog.naver.com/b/2", description: "공립·사립 비교", bloggername: "공모주 이야기", postdate: "20261104" },
  { title: "잘못된 링크", link: "javascript:alert(1)", description: "", bloggername: "x", postdate: "" },
];

let calls: { url: string; headers: Record<string, string> }[] = [];
const realFetch = globalThis.fetch;

describe("네이버 블로그 검색 (NAVER API HUB)", () => {
  beforeEach(() => {
    fresh();
    calls = [];
    process.env.NAVER_API_HUB_CLIENT_ID = "id";
    process.env.NAVER_API_HUB_CLIENT_SECRET = "secret";
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({ total: 6260, items }));
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    delete process.env.NAVER_API_HUB_CLIENT_SECRET;
  });

  it("강조 태그·엔티티만 글자로 바꾸고 내용은 그대로, 날짜는 YYYY-MM-DD", () => {
    expect(plainText(items[0].title)).toBe("서울신구유치원 전통농경체험 & 가을 소풍");
    expect(toPost(items[0])).toMatchObject({ description: '압구정 "신구" 유치원 아이들이…', blogger: "드니맘", postdate: "2026-10-28" });
    expect(toPost(items[2])).toBeNull(); // http(s) 가 아닌 링크는 버린다
  });

  it("API HUB 주소·인증 헤더로 정확도순 5건을 요청하고, 네이버가 준 순서를 그대로 돌려준다", async () => {
    const r = await searchBlog("서울신구유치원");
    expect(calls[0].url).toMatch(/^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/blog\?/);
    expect(calls[0].url).toContain("display=5");
    expect(calls[0].url).toContain("sort=sim");
    expect(calls[0].headers).toMatchObject({ "X-NCP-APIGW-API-KEY-ID": "id", "X-NCP-APIGW-API-KEY": "secret" });
    expect(r.posts.map((p) => p.link)).toEqual(["https://blog.naver.com/a/1", "https://blog.naver.com/b/2"]);
    expect(r.total).toBe(6260);
  });

  it("경로: 회원만, 캐시 금지 헤더, 키가 없으면 503", async () => {
    expect((await GET(req("/api/reviews/blog?q=서울신구유치원"))).status).toBe(401);
    const ok = await GET(req(`/api/reviews/blog?q=${encodeURIComponent("서울신구유치원")}`, { uid: "u1" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect((await ok.json()).posts).toHaveLength(2);
    expect((await GET(req("/api/reviews/blog?q=a", { uid: "u1" }))).status).toBe(400);
    delete process.env.NAVER_API_HUB_CLIENT_ID;
    expect((await GET(req("/api/reviews/blog?q=서울신구유치원", { uid: "u1" }))).status).toBe(503);
  });
});
