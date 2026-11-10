import { beforeEach, describe, expect, it } from "vitest";
import { currentMonths, defaultAge, normalizePhone, validateProfileInput } from "@/lib/profile";
import { readFlags } from "@/lib/flags";
import { confirmVerification, startVerification } from "@/lib/server/phone";
import { guardRedirect } from "@/lib/guard";
import { getProfile, signup, updateProfile } from "@/lib/server/users";
import { store } from "@/lib/server/store";
import { fresh } from "./helpers";

const DONG = "1159051000";
const ok = { consents: { terms: true, privacy: true, age14: true, notify: false }, children: [{ months: 30 }], interestDongs: [DONG] };

describe("프로필 검증", () => {
  const known = (c: string) => c === DONG || c === "1159052000";
  it("아이 연령 0개월~만 8세, 관심 행정동 1~2개", () => {
    expect(validateProfileInput({ children: [{ months: 0 }], interestDongs: [DONG] }, known)).toEqual([]);
    expect(validateProfileInput({ children: [], interestDongs: [DONG] }, known)).toHaveLength(1);
    expect(validateProfileInput({ children: [{ months: 120 }], interestDongs: [DONG] }, known)).toHaveLength(1);
    expect(validateProfileInput({ children: [{ months: 3 }], interestDongs: [] }, known)).toHaveLength(1);
    expect(validateProfileInput({ children: [{ months: 3 }], interestDongs: [DONG, DONG] }, known)).toHaveLength(1);
    expect(validateProfileInput({ children: [{ months: 3 }], interestDongs: ["00000"] }, known)).toHaveLength(1);
  });
  it("등록 후 지난 개월만큼 나이를 올려 계산하고, 첫째 나이로 검색을 채운다", () => {
    const c = { months: 23, asOf: "2026-01-15" };
    expect(currentMonths(c, new Date("2026-03-14"))).toBe(24);
    expect(currentMonths(c, new Date("2026-03-15"))).toBe(25);
    expect(defaultAge({ children: [c] }, new Date("2026-03-15"))).toBe(2);
    expect(defaultAge({ children: [] })).toBeNull();
  });
  it("휴대폰 번호는 01X 10~11자리만", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("02-123-4567")).toBeNull();
  });
});

describe("가입 필수 가드", () => {
  it("로그인 전엔 /login, 가입 전엔 /signup 으로 보내고, 약관·처리방침은 열어 둔다", () => {
    const out = { signedIn: false, onboarded: false };
    expect(guardRedirect("/", out)).toBe("/login");
    expect(guardRedirect("/community", out)).toBe("/login?next=%2Fcommunity");
    expect(guardRedirect("/terms", out)).toBeNull();
    expect(guardRedirect("/privacy/", out)).toBeNull();
    const pending = { signedIn: true, onboarded: false };
    expect(guardRedirect("/", pending)).toBe("/signup");
    expect(guardRedirect("/signup", pending)).toBeNull();
    // 로그인 화면에서 막 로그인·가입한 경우 (실제 배포에서 멈췄던 경우)
    expect(guardRedirect("/login", pending)).toBe("/signup");
    expect(guardRedirect("/login", { signedIn: true, onboarded: true })).toBe("/");
    // 가입 전이어도 약관·처리방침은 볼 수 있다
    expect(guardRedirect("/terms", pending)).toBeNull();
    const member = { signedIn: true, onboarded: true };
    expect(guardRedirect("/signup", member)).toBe("/");
    expect(guardRedirect("/me", member)).toBeNull();
  });
});

describe("회원가입", () => {
  beforeEach(fresh);

  it("필수 동의·만 14세 확인이 없으면 가입할 수 없다", async () => {
    await expect(signup("u1", { ...ok, consents: { ...ok.consents, terms: false } })).rejects.toThrow(/필수/);
    await expect(signup("u1", { ...ok, consents: { ...ok.consents, age14: false } })).rejects.toThrow(/14세/);
  });

  it("동의 버전·시각을 남기고, 익명 닉네임을 만들며, 아이 이름 같은 값은 저장하지 않는다", async () => {
    await signup("u1", { ...ok, ...({ childName: "지우", birth: "2024-01-01" } as object) });
    const p = (await getProfile("u1"))!;
    expect(p.consents.terms.version).toBeTruthy();
    expect(p.nickname).toMatch(/^\S+ \S+ \d{3}$/);
    expect(JSON.stringify(p)).not.toContain("지우");
    expect(JSON.stringify(p)).not.toContain("2024-01-01");
    await expect(signup("u1", ok)).rejects.toThrow(/이미/);
  });

  it("휴대폰 인증 없이도 가입할 수 있고(알림톡 동의만 기록), 인증한 번호는 user_contacts 에 따로 둔다", async () => {
    await signup("u3", { ...ok, consents: { ...ok.consents, notify: true } });
    expect((await getProfile("u3"))!.consents.notify.agreed).toBe(true);
    expect(await store().get("user_contacts", "u3")).toBeNull();
    const { devCode } = await startVerification("u2", "010-9876-5432");
    await expect(confirmVerification("u2", "000000" === devCode ? "111111" : "000000")).rejects.toThrow();
    await confirmVerification("u2", devCode!);
    await signup("u2", { ...ok, consents: { ...ok.consents, notify: true }, usePhone: true });
    expect(JSON.stringify(await getProfile("u2"))).not.toContain("9876");
    expect(await store().get("user_contacts", "u2")).toMatchObject({ phone: "01098765432" });
    await updateProfile("u2", { removePhone: true });
    expect(await store().get("user_contacts", "u2")).toBeNull();
    expect((await getProfile("u2"))!.consents.notify.agreed).toBe(false);
  });
});

describe("기능 플래그", () => {
  it("적지 않은 플래그는 켜져 있고 off 로 끈다", () => {
    expect(readFlags(undefined)).toEqual({ matching: true, vacancy: true, community: true, agent: true });
    expect(readFlags("community=off, agent=false")).toMatchObject({ community: false, agent: false, vacancy: true });
  });
});
