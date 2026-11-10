// 커뮤니티 글 안전장치. 정규식 기반 1차 필터이며, 놓친 글은 신고·관리자 검토로 거른다.

export interface ModerationResult {
  /** 게시 차단 사유 (개인정보 노출 위험) */
  block: string[];
  /** 검토 대기로 돌리는 사유 (외부 연락·링크) */
  review: string[];
}

const BLOCK_RULES: { reason: string; re: RegExp }[] = [
  { reason: "휴대폰 번호", re: /01[016789][\s.\-)]*\d{3,4}[\s.\-]*\d{4}/ },
  { reason: "전화번호", re: /\b0\d{1,2}[\s.\-)]+\d{3,4}[\s.\-]+\d{4}\b/ },
  { reason: "아이 이름", re: /(아이|우리\s*애|애기|아기|딸|아들|첫째|둘째|셋째)\s*(의\s*)?이름(은|이|:)?\s*[가-힣]{2,4}/ },
  { reason: "아이 이름", re: /이름(은|이)\s*[가-힣]{2,4}(이고|이에요|예요|입니다|이야)/ },
  { reason: "상세 주소", re: /\d{1,4}\s*동\s*\d{1,4}\s*호/ },
  { reason: "상세 주소", re: /\d+(-\d+)?\s*번지/ },
  // 도로명 주소 번호 (예: 상도로 123, 여의대방로10길 5). '버스로 10분' 같은 표현은 제외
  { reason: "상세 주소", re: /[가-힣\d]+(로|길)\s?\d{1,4}(-\d{1,4})?(?![\d\s]*(분|시간|시|세|명|개|곳|번째|km|m\b|살|개월))/ },
];

const REVIEW_RULES: { reason: string; re: RegExp }[] = [
  { reason: "링크", re: /https?:\/\/|www\.|\b[\w-]+\.(com|net|kr|org|io|me|ly)\b/i },
  { reason: "이메일", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { reason: "메신저 연락처", re: /(카톡|카카오톡|오픈\s*채팅|오픈톡|open\.kakao|텔레그램|라인\s*아이디|kakao\s*id|톡\s*아이디)/i },
];

export function moderate(text: string): ModerationResult {
  const t = text.normalize("NFC");
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    block: uniq(BLOCK_RULES.filter((r) => r.re.test(t)).map((r) => r.reason)),
    review: uniq(REVIEW_RULES.filter((r) => r.re.test(t)).map((r) => r.reason)),
  };
}

/** 신고가 이만큼 쌓이면 자동으로 숨긴다 */
export const HIDE_AFTER_REPORTS = 3;
