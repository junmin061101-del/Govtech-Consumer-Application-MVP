// 외부 후기·평판 원문으로 가는 검색 링크. API·키 없이 시설 이름과 구 이름으로 검색 결과 페이지를 연다.
// 후기 내용은 가져오거나 저장하지 않는다 (네이버 지도 리뷰는 공식 API가 없고 수집이 약관상 금지).
import type { Facility } from "./types";

export interface ReviewLink {
  id: "naver_blog" | "naver_map" | "kakao_map";
  label: string;
  url: string;
}

/** "서울특별시 강남구 압구정로…" → "강남구" (같은 이름 시설을 구로 구분) */
export const guOf = (address: string) => address.match(/(?:^|\s)(\S+구)(?=\s|$)/)?.[1] ?? "";

export function reviewQuery(f: Pick<Facility, "name" | "address">): string {
  const gu = guOf(f.address);
  return gu && !f.name.includes(gu.replace(/구$/, "")) ? `${f.name} ${gu}` : f.name;
}

export function reviewLinks(f: Pick<Facility, "name" | "address" | "detailUrl">): ReviewLink[] {
  const q = encodeURIComponent(reviewQuery(f));
  return [
    { id: "naver_blog", label: "네이버 블로그 후기", url: `https://search.naver.com/search.naver?where=blog&query=${q}` },
    { id: "naver_map", label: "네이버 지도", url: `https://map.naver.com/p/search/${q}` },
    // 카카오 장소 검색으로 찾은 시설은 그 장소 페이지(후기 탭 포함)로 바로 간다
    { id: "kakao_map", label: "카카오맵", url: f.detailUrl || `https://map.kakao.com/link/search/${q}` },
  ];
}
