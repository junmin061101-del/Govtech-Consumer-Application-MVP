import type { DemandEventInput } from "@/lib/events";
import { logDemandEvent } from "@/lib/server/events";
import { handle, HttpError, json, rateLimit, readJson, requireMember } from "@/lib/server/http";

export function POST(req: Request) {
  return handle(async () => {
    const { uid } = await requireMember(req);
    await rateLimit(`events:${uid}`, 60, 60_000);
    const body = await readJson<DemandEventInput>(req);
    try {
      const r = await logDemandEvent(uid, body);
      return json({ ok: true, deduped: r.deduped });
    } catch (e) {
      if (e instanceof Error && e.message === "unknown event_type") throw new HttpError(400, "알 수 없는 이벤트예요");
      throw e;
    }
  });
}
