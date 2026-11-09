import { ADMIN_ACTIONS, moderatePost, moderationQueue } from "@/lib/server/community";
import { handle, HttpError, isAdmin, json, readJson, requireMember } from "@/lib/server/http";

async function requireAdmin(req: Request) {
  const s = await requireMember(req);
  if (!isAdmin(s.uid, s.email)) throw new HttpError(403, "관리자만 볼 수 있어요");
}

export function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    return json({ posts: await moderationQueue() });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const { id, action } = await readJson<{ id: string; action: (typeof ADMIN_ACTIONS)[number] }>(req);
    if (!ADMIN_ACTIONS.includes(action)) throw new HttpError(400, "처리 방법을 골라 주세요");
    await moderatePost(String(id), action);
    return json({ ok: true });
  });
}
