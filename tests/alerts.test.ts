import { beforeEach, describe, expect, it } from "vitest";
import {
  ALERTS,
  CHECK_NOTICE,
  createAlert,
  extendAlert,
  listAlerts,
  respondToNotification,
  runAlertJob,
  type VacancyAlert,
} from "@/lib/server/alerts";
import { EVENTS, type DemandEvent } from "@/lib/server/events";
import { FACILITIES, locate } from "@/lib/server/facilities";
import { NOTIFICATIONS, setChannelsForTests, type AppNotification } from "@/lib/server/notify";
import { store } from "@/lib/server/store";
import type { Facility } from "@/lib/types";
import { fresh, NORYANGJIN } from "./helpers";

const UID = "dev:alert";
const DAY = 86_400_000;
const facility: Facility = {
  id: "fac1",
  kind: "daycare",
  name: "햇살어린이집",
  type: "국공립",
  address: "",
  phone: "",
  homepage: "",
  ...NORYANGJIN,
  capacity: 20,
  enrolled: 20,
  vacancy: 0,
  ageOpen: [true, true, true, false, false, false, false, false, false],
  extended: {},
  asOf: "2026-11-01",
};

async function seed() {
  const f = locate(facility, new Date().toISOString())!;
  await store().set(FACILITIES, f.id, f);
  return f;
}
const notices = () => store().list<AppNotification>(NOTIFICATIONS, [["uid", "==", UID]]);
const opening = [{ id: "fac1", prevVacancy: 0, vacancy: 2 }];

describe("빈자리 알림", () => {
  beforeEach(() => {
    fresh();
    setChannelsForTests([]);
  });

  it("계정당 활성 알림은 3개까지, 유효기간은 90일", async () => {
    const t0 = new Date("2026-11-01T00:00:00Z");
    const a = await createAlert(UID, { type: "facility", facilityId: "x1", facilityName: "X1" }, t0);
    expect(Date.parse(a.expires_at) - t0.getTime()).toBe(90 * DAY);
    await createAlert(UID, { type: "facility", facilityId: "x2", facilityName: "X2" }, t0);
    await createAlert(UID, { type: "facility", facilityId: "x3", facilityName: "X3" }, t0);
    await expect(createAlert(UID, { type: "facility", facilityId: "x4", facilityName: "X4" }, t0)).rejects.toThrow(/3개/);
    expect(await listAlerts(UID)).toHaveLength(3);
    // 등록은 vacancy_register 이벤트로 남는다
    const evs = await store().list<DemandEvent>(EVENTS);
    expect(evs.every((e) => e.event_type === "vacancy_register")).toBe(true);
  });

  it("정원·현원 변화로 매칭하고, 같은 알림은 하루 1회만, 문구에 시설 확인 안내를 넣는다", async () => {
    const f = await seed();
    await createAlert(UID, { type: "condition", emdCode: f.emdCode!, day: "weekday", start: "09:00", end: "17:00", age: 1, kinds: [] });
    const now = new Date("2026-11-02T01:00:00Z");
    expect((await runAlertJob(opening, now)).sent).toBe(1);
    expect((await runAlertJob(opening, new Date(now.getTime() + 3600_000))).sent).toBe(0);
    expect((await runAlertJob(opening, new Date(now.getTime() + DAY))).sent).toBe(1);
    const [n] = await notices();
    expect(n.body).toContain(CHECK_NOTICE);
    expect(n.body).toContain("햇살어린이집");
  });

  it("조건이 맞지 않거나 빈자리가 줄어든 변화는 보내지 않는다", async () => {
    const f = await seed();
    await createAlert(UID, { type: "condition", emdCode: f.emdCode!, day: "weekday", start: "09:00", end: "17:00", age: 4, kinds: [] });
    expect((await runAlertJob(opening)).sent).toBe(0);
    await createAlert(UID, { type: "facility", facilityId: "fac1", facilityName: "햇살" });
    expect((await runAlertJob([{ id: "fac1", prevVacancy: 3, vacancy: 1 }])).sent).toBe(0);
  });

  it("만료 7일 전 한 번 연장 안내, 만료되면 종료, 연장하면 90일 다시", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const a = await createAlert(UID, { type: "facility", facilityId: "x", facilityName: "X" }, t0);
    expect((await runAlertJob([], new Date(t0.getTime() + 84 * DAY))).renewNotices).toBe(1);
    expect((await runAlertJob([], new Date(t0.getTime() + 85 * DAY))).renewNotices).toBe(0);
    const ext = await extendAlert(UID, a.id, new Date(t0.getTime() + 85 * DAY));
    expect(Date.parse(ext.expires_at)).toBe(t0.getTime() + 175 * DAY);
    expect((await runAlertJob([], new Date(t0.getTime() + 176 * DAY))).expired).toBe(1);
    expect((await store().get<VacancyAlert>(ALERTS, a.id))!.status).toBe("expired");
  });

  it("발송 3일 뒤 원탭 응답을 묻고, 응답은 vacancy_resolved 로 남는다", async () => {
    await seed();
    await createAlert(UID, { type: "facility", facilityId: "fac1", facilityName: "햇살" });
    const t0 = new Date("2026-11-02T00:00:00Z");
    await runAlertJob(opening, t0);
    expect((await runAlertJob([], new Date(t0.getTime() + 2 * DAY))).followups).toBe(0);
    expect((await runAlertJob([], new Date(t0.getTime() + 3 * DAY))).followups).toBe(1);
    const follow = (await notices()).find((n) => n.kind === "vacancy_followup")!;
    expect(follow.actions?.map((a) => a.id)).toEqual(["applied", "not_yet", "not_needed"]);

    await respondToNotification(UID, follow.id, "applied");
    await expect(respondToNotification(UID, follow.id, "applied")).rejects.toThrow(/이미/);
    const resolved = (await store().list<DemandEvent>(EVENTS)).find((e) => e.event_type === "vacancy_resolved")!;
    expect(resolved.meta).toEqual({ response: "applied" });
    expect(resolved.emd_code).toMatch(/^11590/);
  });

  it("알림톡 수신 동의 + 인증 번호가 있으면 알림톡, 아니면 앱 푸시로 보낸다", async () => {
    const sent: string[] = [];
    const ch = (id: "alimtalk" | "push") => ({ id, configured: () => true, send: async () => void sent.push(id) });
    setChannelsForTests([ch("alimtalk"), ch("push")]);
    await seed();
    await createAlert(UID, { type: "facility", facilityId: "fac1", facilityName: "햇살" });
    await runAlertJob(opening, new Date("2026-11-02T00:00:00Z"));
    expect(sent).toEqual(["push"]);

    await store().set("users", UID, { consents: { notify: { agreed: true } } });
    await store().set("user_contacts", UID, { phone: "01012345678" });
    await runAlertJob(opening, new Date("2026-11-03T00:00:00Z"));
    expect(sent).toEqual(["push", "alimtalk"]);
  });
});
