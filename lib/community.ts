// 동네 게시판 카테고리 (클라이언트·서버 공용)
export const CATEGORIES = [
  { id: "vacancy", label: "빈자리·대기 정보" },
  { id: "need_care", label: "이 시간에 맡길 곳 찾아요" },
  { id: "question", label: "질문" },
  { id: "free", label: "자유" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
