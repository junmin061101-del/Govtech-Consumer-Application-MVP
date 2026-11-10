import { handle, json, requireMember } from "@/lib/server/http";
import { NOTIFICATIONS, type AppNotification } from "@/lib/server/notify";
import { store } from "@/lib/server/store";

export function GET(req: Request) {
  return handle(async () => {
    const { uid } = await requireMember(req);
    const list = await store().list<AppNotification>(NOTIFICATIONS, [["uid", "==", uid]]);
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json({
      notifications: list.slice(0, 50).map(({ uid: _u, ref: _r, ...n }) => n),
    });
  });
}
