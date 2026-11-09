// 회원 프로필 정의와 검증. 아이 이름·생년월일·사진은 받지 않는다(연령만).

/** 약관·처리방침 버전. 문서를 바꾸면 올리고, 동의 기록에 함께 남긴다. */
export const TERMS_VERSION = "2026-11-03";
export const PRIVACY_VERSION = "2026-11-09";

/** AI 상담 대화 내용(수집 동의한 경우만) 보관 기간 */
export const AI_LOG_RETENTION_DAYS = 90;

/** 만 0~8세 = 0~107개월 */
export const MAX_CHILD_MONTHS = 8 * 12 + 11;
export const MAX_CHILDREN = 5;
export const MAX_INTEREST_DONGS = 2;

export interface ChildAge {
  /** 등록(또는 수정) 시점의 개월 수 */
  months: number;
  /** months 를 적은 날 (YYYY-MM-DD). 이후 나이는 여기서부터 계산한다. */
  asOf: string;
}

export interface Consent {
  agreed: boolean;
  version?: string;
  at: string;
}

export interface Profile {
  nickname: string;
  children: ChildAge[];
  /** 관심 행정동 코드 1~2개 */
  interestDongs: string[];
  /** aiLog: AI 상담 대화 내용 수집·이용 (선택, 2026-11-09 추가 — 그 전 가입자는 없음 = 미동의) */
  consents: { terms: Consent; privacy: Consent; age14: Consent; notify: Consent; aiLog?: Consent };
  createdAt: string;
  updatedAt: string;
}

/** 화면에 보여 줄 때 덧붙는 값 */
export interface ProfileView extends Profile {
  /** 마스킹된 인증 번호 (예: 010-****-1234). 없으면 null */
  phone: string | null;
}

export function currentMonths(child: ChildAge, now: Date = new Date()): number {
  const [y, m, d] = child.asOf.split("-").map(Number);
  let elapsed = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (now.getDate() < d) elapsed -= 1;
  return child.months + Math.max(0, elapsed);
}

/** 만 나이(세). 개월 수 기준 근사값이다. */
export const ageYears = (months: number) => Math.floor(months / 12);

export const ageText = (months: number) =>
  months < 24 ? `${months}개월` : `만 ${ageYears(months)}세 (${months}개월)`;

/** 지도 기본 나이: 등록한 아이 중 첫째의 현재 만 나이. 8세를 넘으면 null */
export function defaultAge(profile: Pick<Profile, "children"> | null, now = new Date()): number | null {
  const c = profile?.children[0];
  if (!c) return null;
  const y = ageYears(currentMonths(c, now));
  return y <= 8 ? y : null;
}

export interface ProfileInput {
  children: { months: number }[];
  interestDongs: string[];
}

/** 오류 메시지 목록. 비어 있으면 통과 */
export function validateProfileInput(input: ProfileInput, knownDong: (code: string) => boolean): string[] {
  const errors: string[] = [];
  if (!Array.isArray(input.children) || input.children.length === 0) errors.push("아이 연령을 한 명 이상 입력해 주세요");
  else if (input.children.length > MAX_CHILDREN) errors.push(`아이는 ${MAX_CHILDREN}명까지 등록할 수 있어요`);
  else if (
    input.children.some((c) => !Number.isInteger(c?.months) || c.months < 0 || c.months > MAX_CHILD_MONTHS)
  ) {
    errors.push("아이 연령은 0개월~만 8세 사이로 입력해 주세요");
  }
  const dongs = Array.isArray(input.interestDongs) ? input.interestDongs : [];
  if (dongs.length < 1 || dongs.length > MAX_INTEREST_DONGS) errors.push("관심 지역(행정동)을 1~2개 골라 주세요");
  else if (new Set(dongs).size !== dongs.length || dongs.some((d) => typeof d !== "string" || !knownDong(d))) {
    errors.push("관심 지역이 올바르지 않아요");
  }
  return errors;
}

/** 휴대폰 번호 → 숫자만 (01X 로 시작하는 10~11자리). 아니면 null */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

export const maskPhone = (digits: string) => `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;

const ADJ = ["포근한", "다정한", "씩씩한", "느긋한", "반짝이는", "따뜻한", "부지런한", "명랑한", "든든한", "산뜻한"];
const NOUN = ["다람쥐", "고래", "참새", "토끼", "부엉이", "펭귄", "수달", "코알라", "판다", "돌고래"];

/** 자동 생성 익명 닉네임. seed 는 서버가 uid 를 비밀값으로 해시한 바이트 */
export function nicknameFromSeed(seed: Uint8Array): string {
  const n = ((seed[2] << 8) | seed[3]) % 1000;
  return `${ADJ[seed[0] % ADJ.length]} ${NOUN[seed[1] % NOUN.length]} ${String(n).padStart(3, "0")}`;
}
