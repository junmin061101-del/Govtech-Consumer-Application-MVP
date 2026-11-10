import { handle, HttpError, json, rateLimit, requireMember } from "@/lib/server/http";
import { searchBlog } from "@/lib/server/naverBlog";

/**
 * GET ?q=시설 이름 — 네이버 블로그 검색 결과 상위 5건을 그대로 돌려준다.
 * 화면에 바로 보여 주기만 한다: 저장·캐시하지 않고 AI 에도 넣지 않는다 (lib/server/naverBlog.ts 약관 메모).
 */
export function GET(req: Request) {
  return handle(async () => {
    const { uid } = await requireMember(req);
    await rateLimit(`blog:${uid}`, 60, 600_000);
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 60) throw new HttpError(400, "시설 이름이 필요해요");
    const r = await searchBlog(q);
    return json(
      { ...r, query: q, source: "네이버 블로그 검색 (NAVER API HUB)" },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
