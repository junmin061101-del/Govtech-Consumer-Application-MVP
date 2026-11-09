import { deleteOwnPost, reportPost } from "@/lib/server/community";
import { handle, json, rateLimit, requireFlag, requireMember } from "@/lib/server/http";

/** 신고 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireFlag("community");
    const { uid } = await requireMember(req);
    await rateLimit(`report:${uid}`, 30, 3600_000);
    return json(await reportPost(uid, (await ctx.params).id));
  });
}

export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireFlag("community");
    const { uid } = await requireMember(req);
    await deleteOwnPost(uid, (await ctx.params).id);
    return json({ ok: true });
  });
}
