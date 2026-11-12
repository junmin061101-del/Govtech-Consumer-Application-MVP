import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRawMessage, mailtoUrl } from "@/lib/gmail";
import { runTool } from "@/lib/server/agent";
import { topicsOf } from "@/lib/server/agentLog";
import { sendNaverMail, setTransportForTests, validateMail } from "@/lib/server/mail";
import { POST } from "@/server/api/mail/naver/route";
import { fresh, req } from "./helpers";

const ok = { naverId: "parent01", appPassword: "app-pass-1234", to: "daycare@example.com", subject: "결석 안내", body: "안녕하세요. 김하늘 엄마입니다." };
let sent: Record<string, unknown>[] = [];
let auth: { user: string; pass: string }[] = [];

describe("메일 보내기", () => {
  beforeEach(() => {
    fresh();
    sent = [];
    auth = [];
    setTransportForTests((user, pass) => {
      auth.push({ user, pass });
      return { sendMail: async (m) => (sent.push(m), { messageId: "x" }) };
    });
  });
  afterEach(() => setTransportForTests(null));

  it("네이버: 입력을 검증하고 그 계정으로 한 번 보낸다 (제목 줄바꿈 주입 차단)", async () => {
    await sendNaverMail({ ...ok, naverId: "parent01@naver.com", subject: "결석\r\nBcc: evil@x.com" });
    expect(auth).toEqual([{ user: "parent01", pass: "app-pass-1234" }]);
    expect(sent[0]).toMatchObject({ from: "parent01@naver.com", to: "daycare@example.com", subject: "결석 Bcc: evil@x.com", text: ok.body });
  });

  it("빈칸([아이 이름])이 남았거나 주소가 이상하면 보내지 않는다", () => {
    expect(() => validateMail({ ...ok, body: "[아이 이름] 결석합니다" })).toThrow("빈칸");
    expect(() => validateMail({ ...ok, to: "daycare" })).toThrow("이메일");
    expect(() => validateMail({ ...ok, to: "a@b.com, c@d.com" })).toThrow("이메일");
    expect(() => validateMail({ ...ok, naverId: "a b" })).toThrow("아이디");
  });

  it("네이버 로그인 실패는 친절한 안내로, 비밀번호는 응답·로그에 남지 않는다", async () => {
    setTransportForTests(() => ({ sendMail: async () => Promise.reject(Object.assign(new Error("Invalid login app-pass-1234"), { responseCode: 535 })) }));
    await expect(sendNaverMail(ok)).rejects.toThrow("앱 비밀번호");
    const r = await POST(req("/api/mail/naver", { uid: "u1", json: ok }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).not.toContain("app-pass-1234");
  });

  it("경로: 회원만, 캐시 금지", async () => {
    expect((await POST(req("/api/mail/naver", { json: ok }))).status).toBe(401);
    const r = await POST(req("/api/mail/naver", { uid: "u1", json: ok }));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("Gmail 메시지: UTF-8 제목·본문, 받는 주소 줄바꿈 제거", () => {
    const raw = buildRawMessage({ to: "a@b.com\r\nBcc: x@y.com", subject: "결석 안내", body: "안녕하세요\n내일 결석합니다" });
    const text = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(text).toContain("To: a@b.com Bcc: x@y.com");
    expect(text).not.toMatch(/\r\nBcc:/);
    expect(text).toContain(`Subject: =?UTF-8?B?${Buffer.from("결석 안내").toString("base64")}?=`);
    const bodyB64 = text.split("\r\n\r\n")[1];
    expect(Buffer.from(bodyB64, "base64").toString("utf8")).toBe("안녕하세요\r\n내일 결석합니다");
    expect(mailtoUrl({ to: "a@b.com", subject: "제목", body: "본문" })).toBe(`mailto:a%40b.com?subject=${encodeURIComponent("제목")}&body=${encodeURIComponent("본문")}`);
  });

  it("AI 도구 draft_email: 카드로 보여 주라고만 답하고, 주제에 '시설 연락·메일'", async () => {
    const r = await runTool("u1", "draft_email", { facility_name: "구립상도어린이집", subject: "결석 안내", body: "[아이 이름] 결석" });
    expect(r).toMatchObject({ shown: true, facility: "구립상도어린이집" });
    expect(await runTool("u1", "draft_email", { facility_name: "x" })).toHaveProperty("error");
    expect(topicsOf({ question: "어린이집에 결석 메일 써줘", tools: ["draft_email"] })).toContain("email");
  });
});
