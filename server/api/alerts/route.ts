import { createAlert, listAlerts, MAX_ACTIVE_ALERTS, type AlertTarget } from "@/lib/server/alerts";
import { handle, json, readJson, requireFlag, requireMember } from "@/lib/server/http";

export function GET(req: Request) {
  return handle(async () => {
    await requireFlag("vacancy");
    const { uid } = await requireMember(req);
    return json({ alerts: await listAlerts(uid), max: MAX_ACTIVE_ALERTS });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    await requireFlag("vacancy");
    const { uid } = await requireMember(req);
    const { target } = await readJson<{ target: AlertTarget }>(req);
    return json({ alert: await createAlert(uid, target) }, { status: 201 });
  });
}
