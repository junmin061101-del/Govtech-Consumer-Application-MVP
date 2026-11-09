import { beforeEach, describe, expect, it } from "vitest";
import { moderate } from "@/lib/moderation";
import { createPost, listPosts, moderatePost, moderationQueue, reportPost } from "@/lib/server/community";
import { EVENTS, type DemandEvent } from "@/lib/server/events";
import { store } from "@/lib/server/store";
import { signup } from "@/lib/server/users";
import { fresh } from "./helpers";

const DONG = "1159051000"; // 동작구 노량진1동
const join = (uid: string) =>
  signup(uid, { consents: { terms: true, privacy: true, age14: true, notify: false }, children: [{ months: 30 }], interestDongs: [DONG] });

describe("게시글 안전장치", () => {
  it("전화번호·아이 이름·상세 주소는 차단한다", () => {
    expect(moderate("연락은 010-1234-5678 로 주세요").block).toContain("휴대폰 번호");
    expect(moderate("010 1234 5678").block).toContain("휴대폰 번호");
    expect(moderate("우리 아이 이름은 김지우예요").block).toContain("아이 이름");
    expect(moderate("101동 1203호 살아요").block).toContain("상세 주소");
    expect(moderate("상도로 123 앞이에요").block).toContain("상세 주소");
  });
  it("평범한 글과 '버스로 10분' 같은 표현은 통과시킨다", () => {
    const r = moderate("노량진역에서 버스로 10분 거리 어린이집 대기 3번이에요. 저녁 7시 이후 맡길 곳 있을까요?");
    expect(r).toEqual({ block: [], review: [] });
  });
  it("링크·이메일·메신저 연락처는 검토 대기로 돌린다", () => {
    expect(moderate("https://open.kakao.com/xyz").review).toEqual(expect.arrayContaining(["링크", "메신저 연락처"]));
    expect(moderate("메일 주세요 a@b.com").review).toContain("이메일");
    expect(moderate("카톡 주세요").review).toContain("메신저 연락처");
  });
});

describe("동네 게시판", () => {
  beforeEach(async () => {
    fresh();
    await join("dev:a");
    await join("dev:b");
    await join("dev:c");
    await join("dev:d");
  });

  it("익명 닉네임으로 올리고, 응답에 uid 를 담지 않는다", async () => {
    const p = await createPost("dev:a", { emd_code: DONG, category: "question", title: "질문", body: "연장보육 되는 곳 있나요?" });
    expect(p.status).toBe("published");
    const [seen] = await listPosts("dev:b", DONG);
    expect(JSON.stringify(seen)).not.toContain("dev:a");
    expect(seen.nickname).toMatch(/^\S+ \S+ \d{3}$/);
    expect(seen.mine).toBe(false);
  });

  it("개인정보 패턴은 게시 차단, 링크는 검토 대기(작성자에게만 보임)", async () => {
    await expect(createPost("dev:a", { emd_code: DONG, category: "free", title: "연락", body: "010-1111-2222" })).rejects.toThrow(/휴대폰 번호/);
    const p = await createPost("dev:a", { emd_code: DONG, category: "free", title: "후기", body: "블로그 www.example.com" });
    expect(p.status).toBe("pending");
    expect(await listPosts("dev:a", DONG)).toHaveLength(1);
    expect(await listPosts("dev:b", DONG)).toHaveLength(0);
    expect((await moderationQueue()).map((q) => q.id)).toEqual([p.id]);
    await moderatePost(p.id, "publish");
    expect(await listPosts("dev:b", DONG)).toHaveLength(1);
  });

  it("신고가 3건 쌓이면 자동으로 숨긴다 (1인 1회, 본인 글 신고 불가)", async () => {
    const p = await createPost("dev:a", { emd_code: DONG, category: "free", title: "글", body: "내용" });
    await expect(reportPost("dev:a", p.id)).rejects.toThrow();
    await reportPost("dev:b", p.id);
    await expect(reportPost("dev:b", p.id)).rejects.toThrow(/이미/);
    await reportPost("dev:c", p.id);
    expect((await reportPost("dev:d", p.id)).hidden).toBe(true);
    expect(await listPosts("dev:b", DONG)).toHaveLength(0);
  });

  it("'이 시간에 맡길 곳 찾아요'는 구조화 필드만 community_need 로 집계한다", async () => {
    await createPost("dev:a", {
      emd_code: DONG,
      category: "need_care",
      title: "저녁 돌봄",
      body: "퇴근이 늦어서 걱정이에요",
      need: { day: "weekday", start: "19:00", end: "21:00", age: 3 },
    });
    const [ev] = await store().list<DemandEvent>(EVENTS);
    expect(ev.event_type).toBe("community_need");
    expect(ev.emd_code).toBe(DONG);
    expect(ev.time_slot).toEqual(["wd_18_20", "wd_20_22"]);
    expect(JSON.stringify(ev)).not.toContain("퇴근");
    await expect(
      createPost("dev:a", { emd_code: DONG, category: "need_care", title: "x", body: "y" }),
    ).rejects.toThrow(/시간/);
  });
});
