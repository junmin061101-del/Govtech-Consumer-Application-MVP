// 풀스택 E2E: Functions 에뮬레이터의 api 함수에 HTTP 로 요청한다. 인증은 Auth 에뮬레이터에서 받은 실제 ID 토큰.
// 실행: npm run test:stack
import { describe, expect, it } from "vitest";

const PROJECT = "demo-careos";
const API = `http://127.0.0.1:5001/${PROJECT}/asia-northeast3/api`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const DONG = "1159051000";

async function call(path: string, init: { token?: string; method?: string; json?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
    headers: {
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** 개발용 로그인 → 커스텀 토큰 → Auth 에뮬레이터에서 ID 토큰 교환 */
async function login(name: string) {
  const { body } = await call("/api/auth/dev", { json: { name } });
  const r = await fetch(`${AUTH}/accounts:signInWithCustomToken?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: body.token, returnSecureToken: true }),
  });
  const j = await r.json();
  return { idToken: j.idToken as string, refreshToken: j.refreshToken as string };
}

async function refreshed(refreshToken: string) {
  const r = await fetch(`http://127.0.0.1:9099/securetoken.googleapis.com/v1/token?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  return (await r.json()).id_token as string;
}

describe("Functions 에뮬레이터 E2E", () => {
  it("로그인 → 가입(클레임 갱신) → 이벤트·알림 → 탈퇴(Auth 계정 삭제)", async () => {
    const name = `stack${Date.now() % 100000}`;
    let { idToken, refreshToken } = await login(name);

    expect((await call("/api/events", { token: idToken, json: { event_type: "apply_step", meta: { step: 1 } } })).status).toBe(403);
    expect((await call("/api/me", { token: "forged" })).body.user).toBeNull();

    const s = await call("/api/signup", {
      token: idToken,
      json: { consents: { terms: true, privacy: true, age14: true, notify: false }, children: [{ months: 30 }], interestDongs: [DONG] },
    });
    expect(s.status).toBe(200);
    // 클레임은 토큰을 새로 받아야 반영된다
    idToken = await refreshed(refreshToken);
    const me = await call("/api/me", { token: idToken });
    expect(me.body.user).toMatchObject({ uid: `dev:${name}`, onboarded: true });
    expect(me.body.profile.interestDongs).toEqual([DONG]);

    const ev = await call("/api/events", { token: idToken, json: { event_type: "search_no_result", emd_code: DONG, day: "weekday", start: "19:00", end: "21:00", age: 2 } });
    expect(ev.body).toMatchObject({ ok: true, deduped: false });
    const again = await call("/api/events", { token: idToken, json: { event_type: "search_no_result", emd_code: DONG, day: "weekday", start: "19:00", end: "21:00", age: 2 } });
    expect(again.body.deduped).toBe(true);

    const alert = await call("/api/alerts", {
      token: idToken,
      json: { target: { type: "condition", emdCode: DONG, day: "weekday", start: "19:00", end: "21:00", age: 2, kinds: [] } },
    });
    expect(alert.status).toBe(201);

    expect((await call("/api/me", { token: idToken, method: "DELETE" })).status).toBe(200);
    // Auth 계정이 지워져 기존 갱신 토큰으로는 새 토큰을 못 받는다
    expect(await refreshed(refreshToken)).toBeUndefined();
  });

  it("이메일·비밀번호 가입 → 프로필 작성 → 가입 완료 클레임", async () => {
    const email = `parent${Date.now()}@example.com`;
    const r = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
    });
    const { idToken, refreshToken, localId } = await r.json();
    const before = await call("/api/me", { token: idToken });
    expect(before.body.user).toMatchObject({ uid: localId, onboarded: false });
    expect(before.body.profile).toBeNull();

    const s = await call("/api/signup", {
      token: idToken,
      json: { consents: { terms: true, privacy: true, age14: true, notify: false }, children: [{ months: 50 }], interestDongs: [DONG] },
    });
    expect(s.status).toBe(200);
    const after = await call("/api/me", { token: await refreshed(refreshToken) });
    expect(after.body.user.onboarded).toBe(true);
    // 프로필에는 이메일을 따로 저장하지 않는다
    expect(JSON.stringify(after.body.profile)).not.toContain(email);
  });

  it("없는 경로 404, 메서드 405, 요청 형식 오류 400", async () => {
    expect((await call("/api/nope")).status).toBe(404);
    expect((await call("/api/regions", { method: "DELETE" })).status).toBe(405);
    const { idToken } = await login(`bad${Date.now() % 100000}`);
    const r = await fetch(`${API}/api/signup`, { method: "POST", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" }, body: "{" });
    expect(r.status).toBe(400);
  });

  it("행정동 목록은 공개, 좌표 → 행정동 변환", async () => {
    const r = await call("/api/regions");
    expect(r.body.sigungu).toHaveLength(25);
    const hit = await call("/api/regions/locate?lat=37.5131&lng=126.9426");
    expect(hit.body.sigunguCode).toBe("11590");
  });
});
