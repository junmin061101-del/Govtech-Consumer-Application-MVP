import { respondToNotification } from "@/lib/server/alerts";
import { handle, HttpError, json, readJson, requireMember } from "@/lib/server/http";
import { NOTIFICATIONS, type AppNotification } from "@/lib/server/notify";
import { store } from "@/lib/server/store";

/** { read: true } 로 읽음 표시, { response: "applied" } 로 빈자리 후속 질문에 원탭 응답 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { uid } = await requireMember(req);
    const { id } = await ctx.params;
    const body = await readJson<{ read?: boolean; response?: string }>(req);
    if (body.response) {
      await respondToNotification(uid, id, body.response);
    } else {
      const n = await store().get<AppNotification>(NOTIFICATIONS, id);
      if (!n || n.uid !== uid) throw new HttpError(404, "알림을 찾을 수 없어요");
      await store().set(NOTIFICATIONS, id, { ...n, read_at: n.read_at ?? new Date().toISOString() });
    }
    return json({ ok: true });
  });
}
