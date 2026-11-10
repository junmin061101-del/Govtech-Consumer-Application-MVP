import { cancelAlert, extendAlert } from "@/lib/server/alerts";
import { handle, json, requireFlag, requireMember } from "@/lib/server/http";

/** 언제든 해지 */
export function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireFlag("vacancy");
    const { uid } = await requireMember(req);
    await cancelAlert(uid, (await ctx.params).id);
    return json({ ok: true });
  });
}

/** 90일 연장 */
export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireFlag("vacancy");
    const { uid } = await requireMember(req);
    return json({ alert: await extendAlert(uid, (await ctx.params).id) });
  });
}
