// 행정동 단위 게시판. 작성자는 자동 생성 익명 닉네임으로만 보이고 uid 는 응답에 담지 않는다.
import { CATEGORIES, type Category } from "@/lib/community";
import { HIDE_AFTER_REPORTS, moderate } from "@/lib/moderation";
import type { Day } from "@/lib/types";
import { logDemandEvent } from "./events";
import { HttpError } from "./http";
import { dongByCode, isKnownDong } from "./regions";
import { newId, store } from "./store";
import { getProfile } from "./users";

export const POSTS = "community_posts";


export const MAX_TITLE = 60;
export const MAX_BODY = 1000;

export interface NeedFields {
  day: Day;
  start: string;
  end: string;
  age: number | null;
}

export interface Post {
  uid: string;
  nickname: string;
  emd_code: string;
  sigungu_code: string;
  category: Category;
  title: string;
  body: string;
  need: NeedFields | null;
  status: "published" | "pending" | "hidden" | "removed";
  /** 검토 대기 사유 (링크·연락처 등) */
  flags: string[];
  reporters: string[];
  created_at: string;
  [k: string]: unknown;
}

/** 다른 회원에게 보이는 형태 (uid·신고자 목록 제외) */
export interface PostView {
  id: string;
  nickname: string;
  emd_code: string;
  category: Category;
  title: string;
  body: string;
  need: NeedFields | null;
  status: Post["status"];
  report_count: number;
  created_at: string;
  mine: boolean;
  reported: boolean;
}

export const toView = (id: string, p: Post, viewer: string): PostView => ({
  id,
  nickname: p.nickname,
  emd_code: p.emd_code,
  category: p.category,
  title: p.title,
  body: p.body,
  need: p.need,
  status: p.status,
  report_count: p.reporters.length,
  created_at: p.created_at,
  mine: p.uid === viewer,
  reported: p.reporters.includes(viewer),
});

export async function listPosts(viewer: string, emdCode: string, category?: string) {
  if (!isKnownDong(emdCode)) throw new HttpError(400, "행정동을 골라 주세요");
  const list = (
    await store().list<Post>(POSTS, [
      ["emd_code", "==", emdCode],
      ["status", "in", ["published", "pending"]],
    ])
  ).filter(
    // 공개 글 + 내 검토 대기 글
    (p) => (!category || p.category === category) && (p.status === "published" || p.uid === viewer),
  );
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map((p) => toView(p.id, p, viewer));
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface NewPost {
  emd_code: string;
  category: Category;
  title: string;
  body: string;
  need?: NeedFields | null;
}

export async function createPost(uid: string, input: NewPost, now = new Date()) {
  const profile = await getProfile(uid);
  if (!profile) throw new HttpError(403, "회원만 글을 쓸 수 있어요");
  if (!isKnownDong(input?.emd_code)) throw new HttpError(400, "행정동을 골라 주세요");
  if (!CATEGORIES.some((c) => c.id === input.category)) throw new HttpError(400, "카테고리를 골라 주세요");
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!title || title.length > MAX_TITLE) throw new HttpError(400, `제목은 1~${MAX_TITLE}자로 적어 주세요`);
  if (!body || body.length > MAX_BODY) throw new HttpError(400, `내용은 1~${MAX_BODY}자로 적어 주세요`);

  let need: NeedFields | null = null;
  if (input.category === "need_care") {
    const n = input.need;
    if (!n || !["weekday", "sat", "sun"].includes(n.day) || !HHMM.test(n.start) || !HHMM.test(n.end) || n.end <= n.start) {
      throw new HttpError(400, "필요한 요일과 시간을 골라 주세요");
    }
    const age = n.age === null || (Number.isInteger(n.age) && n.age >= 0 && n.age <= 8) ? n.age : null;
    need = { day: n.day, start: n.start, end: n.end, age };
  }

  const mod = moderate(`${title}\n${body}`);
  if (mod.block.length) {
    throw new HttpError(
      422,
      `${mod.block.join("·")}로 보이는 내용이 있어 올릴 수 없어요. 아이 이름·전화번호·상세 주소는 적지 말아 주세요`,
    );
  }

  const id = newId();
  const post: Post = {
    uid,
    nickname: profile.nickname,
    emd_code: input.emd_code,
    sigungu_code: dongByCode(input.emd_code)!.sigungu_code,
    category: input.category,
    title,
    body,
    need,
    status: mod.review.length ? "pending" : "published",
    flags: mod.review,
    reporters: [],
    created_at: now.toISOString(),
  };
  await store().set(POSTS, id, post);

  // 구조화 필드만 집계한다 (본문은 집계하지 않는다)
  if (need) {
    await logDemandEvent(
      uid,
      { event_type: "community_need", emd_code: post.emd_code, day: need.day, start: need.start, end: need.end, age: need.age, meta: { category: "need_care" } },
      now,
    );
  }
  return toView(id, post, uid);
}

export async function reportPost(uid: string, id: string) {
  const p = await store().get<Post>(POSTS, id);
  if (!p || p.status === "removed") throw new HttpError(404, "글을 찾을 수 없어요");
  if (p.uid === uid) throw new HttpError(400, "내 글은 신고할 수 없어요");
  if (p.reporters.includes(uid)) throw new HttpError(409, "이미 신고했어요");
  const reporters = [...p.reporters, uid];
  const status = reporters.length >= HIDE_AFTER_REPORTS && p.status === "published" ? "hidden" : p.status;
  await store().set(POSTS, id, { ...p, reporters, status });
  return { hidden: status === "hidden" };
}

export async function deleteOwnPost(uid: string, id: string) {
  const p = await store().get<Post>(POSTS, id);
  if (!p || p.uid !== uid) throw new HttpError(404, "글을 찾을 수 없어요");
  await store().delete(POSTS, id);
}

// --- 관리자 ---

export async function moderationQueue() {
  const list = await store().list<Post>(POSTS, [["status", "in", ["pending", "hidden"]]]);
  return list
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => ({ ...toView(p.id, p, ""), flags: p.flags }));
}

export const ADMIN_ACTIONS = ["publish", "hide", "remove"] as const;

export async function moderatePost(id: string, action: (typeof ADMIN_ACTIONS)[number]) {
  const p = await store().get<Post>(POSTS, id);
  if (!p) throw new HttpError(404, "글을 찾을 수 없어요");
  if (action === "remove") {
    await store().delete(POSTS, id);
    return;
  }
  // 게시 승인 시 신고 기록을 비워 다시 숨겨지지 않게 한다
  await store().set(POSTS, id, {
    ...p,
    status: action === "publish" ? "published" : "hidden",
    ...(action === "publish" ? { reporters: [], flags: [] } : {}),
  });
}
