// 핵심 E2E 시나리오 (API 수준). Functions 의 api 가 부르는 것과 같은 라우트 핸들러를 요청 객체로 호출한다.
// 인증은 테스트 백엔드(토큰 "test:<uid>")로 대신한다. 에뮬레이터 대상 시나리오는 tests/emulator/ 참고.
import { beforeEach, describe, expect, it } from "vitest";
import * as admin from "@/server/api/admin/community/route";
import * as alertById from "@/server/api/alerts/[id]/route";
import * as alerts from "@/server/api/alerts/route";
import * as devLogin from "@/server/api/auth/dev/route";
import * as posts from "@/server/api/community/posts/route";
import * as events from "@/server/api/events/route";
import * as me from "@/server/api/me/route";
import * as phoneSend from "@/server/api/phone/send/route";
import * as phoneVerify from "@/server/api/phone/verify/route";
import * as signup from "@/server/api/signup/route";
import { EVENTS, EVENT_FIELDS, type DemandEvent } from "@/lib/server/events";
import { store } from "@/lib/server/store";
import { fresh, NORYANGJIN, params, req } from "../helpers";

const DONG = "1159051000";

async function joinVia(name: string, opts: { phone?: boolean } = {}) {
  const login = await devLogin.POST(req("/api/auth/dev", { json: { name } }));
  const { token } = await login.json();
  if (opts.phone) {
    const sent = await (await phoneSend.POST(req("/api/phone/send", { token, json: { phone: "010-2222-3333" } }))).json();
    expect((await phoneVerify.POST(req("/api/phone/verify", { token, json: { code: sent.devCode } }))).status).toBe(200);
  }
  const res = await signup.POST(
    req("/api/signup", {
      token,
      json: {
        consents: { terms: true, privacy: true, age14: true, notify: Boolean(opts.phone) },
        children: [{ months: 26 }, { months: 80 }],
        interestDongs: [DONG],
        usePhone: Boolean(opts.phone),
      },
    }),
  );
  expect(res.status).toBe(200);
  return token as string;
}

describe("E2E: 가입 → 검색 → 알림 → 탈퇴", () => {
  beforeEach(fresh);

  it("회원가입 필수: 로그인 전·가입 전에는 API 가 막힌다", async () => {
    expect((await events.POST(req("/api/events", { json: { event_type: "apply_step" } }))).status).toBe(401);
    expect((await events.POST(req("/api/events", { token: "forged", json: { event_type: "apply_step" } }))).status).toBe(401);

    const { token } = await (await devLogin.POST(req("/api/auth/dev", { json: { name: "p1" } }))).json();
    expect((await events.POST(req("/api/events", { token, json: { event_type: "apply_step" } }))).status).toBe(403);
    expect((await (await me.GET(req("/api/me", { token }))).json()).profile).toBeNull();
  });

  it("가입 → 프로필로 검색 조건 채움 → 결과 없음 이벤트 → 조건 알림 → 탈퇴 시 개인정보 삭제·연결 해제", async () => {
    const token = await joinVia("p2", { phone: true });
    expect((await (await me.GET(req("/api/me", { token }))).json()).user.onboarded).toBe(true);

    const profile = (await (await me.GET(req("/api/me", { token }))).json()).profile;
    expect(profile.interestDongs).toEqual([DONG]);
    expect(profile.phone).toBe("010-****-3333");
    expect(profile.children.map((c: { months: number }) => c.months)).toEqual([26, 80]);

    // 결과 없음 → 범위 넓히기 → 빈자리 알림
    await events.POST(req("/api/events", { token, json: { event_type: "search_no_result", center: NORYANGJIN, day: "weekday", start: "19:00", end: "22:00", age: 2, meta: { walk_min: 10 } } }));
    await events.POST(req("/api/events", { token, json: { event_type: "search_widened", center: NORYANGJIN, day: "weekday", start: "19:00", end: "22:00", age: 2, meta: { dimension: "distance", from: "10분", to: "15분" } } }));
    const created = await alerts.POST(
      req("/api/alerts", { token, json: { target: { type: "condition", emdCode: DONG, day: "weekday", start: "19:00", end: "22:00", age: 2, kinds: [] } } }),
    );
    expect(created.status).toBe(201);
    const alertId = (await created.json()).alert.id;
    expect((await alertById.PATCH(req(`/api/alerts/${alertId}`, { token, method: "PATCH" }), params(alertId))).status).toBe(200);

    const evs = await store().list<DemandEvent>(EVENTS);
    expect(evs.map((e) => e.event_type).sort()).toEqual(["search_no_result", "search_widened", "vacancy_register"]);
    for (const e of evs) {
      const { id: _id, ...doc } = e;
      expect(Object.keys(doc).every((k) => (EVENT_FIELDS as readonly string[]).includes(k))).toBe(true);
      expect(JSON.stringify(doc)).not.toMatch(/dev:p2|2222|3333|37\.51|126\.94/);
      expect(doc.emd_code).toMatch(/^11590/);
    }

    // 탈퇴
    expect((await me.DELETE(req("/api/me", { token, method: "DELETE" }))).status).toBe(200);
    // Auth 계정도 지워져 가입 상태가 남지 않는다
    expect((await (await me.GET(req("/api/me", { token }))).json()).user.onboarded).toBe(false);
    const uid = "dev:p2";
    expect(await store().get("users", uid)).toBeNull();
    expect(await store().get("user_contacts", uid)).toBeNull();
    expect(await store().get("pkey_salts", uid)).toBeNull();
    expect(await store().list("vacancy_alerts", [["uid", "==", uid]])).toHaveLength(0);
    // 통계 이벤트는 남지만 회원과 다시 연결할 수 없다
    expect(await store().list(EVENTS)).toHaveLength(3);
  });

  it("빈자리 알림은 플래그로 끌 수 있다", async () => {
    const token = await joinVia("p3");
    process.env.FEATURE_FLAGS = "vacancy=off";
    try {
      expect((await alerts.GET(req("/api/alerts", { token }))).status).toBe(404);
      const flags = (await (await me.GET(req("/api/me", { token }))).json()).flags;
      expect(flags).toMatchObject({ vacancy: false, community: true });
    } finally {
      process.env.FEATURE_FLAGS = "";
    }
  });
});

describe("E2E: 동네 게시판 검토", () => {
  beforeEach(fresh);

  it("링크 글은 검토 대기 → 관리자 공개 / 일반 회원은 관리자 화면 접근 불가", async () => {
    const token = await joinVia("p5");
    const adminToken = await joinVia("admin");
    const created = await posts.POST(req("/api/community/posts", { token, json: { emd_code: DONG, category: "vacancy", title: "대기", body: "공지 www.example.com" } }));
    const { post } = await created.json();
    expect(post.status).toBe("pending");
    expect((await admin.GET(req("/api/admin/community", { token }))).status).toBe(403);
    const queue = (await (await admin.GET(req("/api/admin/community", { token: adminToken }))).json()).posts;
    expect(queue.map((p: { id: string }) => p.id)).toEqual([post.id]);
    await admin.POST(req("/api/admin/community", { token: adminToken, json: { id: post.id, action: "publish" } }));
    const list = (await (await posts.GET(req(`/api/community/posts?emd=${DONG}`, { token: adminToken }))).json()).posts;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("dev:p5");
  });
});
