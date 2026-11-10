// 네이버 블로그 검색 (NAVER API HUB, 네이버 클라우드 플랫폼). https://api.ncloud-docs.com/docs/naver-api-hub-overview
// 약관(2026-09-20 API HUB 개정) 때문에 지키는 것:
//  - 검색 결과를 AI(Gemini) 입력에 넣지 않는다. AI 상담 기록에도 들어가지 않는다 (브라우저가 따로 불러 화면에만 보여 준다).
//  - 결과를 서버에 저장·캐시하지 않는다 (응답은 no-store).
//  - 순서·내용을 바꾸지 않는다. 강조 태그(<b>)와 HTML 엔티티만 화면용 글자로 바꾼다.
//  - 출처(네이버 블로그)와 원문 링크를 함께 보여 준다.
import { HttpError } from "./http";

const URL_BASE = "https://naverapihub.apigw.ntruss.com/search/v1/blog";
export const BLOG_DISPLAY = 5;

export interface BlogPost {
  title: string;
  description: string;
  link: string;
  blogger: string;
  /** YYYY-MM-DD. 모르면 "" */
  postdate: string;
}

interface RawItem {
  title?: string;
  description?: string;
  link?: string;
  bloggername?: string;
  postdate?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** 검색어 강조 태그를 빼고 HTML 엔티티를 글자로 바꾼다 (화면 표시용, 내용은 그대로) */
export function plainText(s: string | undefined): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}

export function toPost(r: RawItem): BlogPost | null {
  const link = String(r.link ?? "");
  if (!/^https?:\/\//i.test(link)) return null;
  const d = String(r.postdate ?? "");
  return {
    title: plainText(r.title),
    description: plainText(r.description),
    link,
    blogger: plainText(r.bloggername),
    postdate: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : "",
  };
}

export const naverConfigured = () => Boolean(process.env.NAVER_API_HUB_CLIENT_ID?.trim() && process.env.NAVER_API_HUB_CLIENT_SECRET?.trim());

/** 정확도순 상위 몇 건. 네이버가 준 순서 그대로 돌려준다 */
export async function searchBlog(query: string, f: typeof fetch = fetch): Promise<{ posts: BlogPost[]; total: number }> {
  const id = process.env.NAVER_API_HUB_CLIENT_ID?.trim();
  const secret = process.env.NAVER_API_HUB_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new HttpError(503, "블로그 검색이 아직 연결되지 않았어요");
  const q = new URLSearchParams({ query, display: String(BLOG_DISPLAY), sort: "sim" });
  const res = await f(`${URL_BASE}?${q}`, {
    headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("naver blog search failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
    throw new HttpError(502, "블로그 글을 불러오지 못했어요");
  }
  const d = (await res.json()) as { items?: RawItem[]; total?: number };
  return { posts: (d.items ?? []).flatMap((r) => toPost(r) ?? []), total: Number(d.total ?? 0) };
}
