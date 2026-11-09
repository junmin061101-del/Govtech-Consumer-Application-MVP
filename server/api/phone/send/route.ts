import { clientIp, handle, json, rateLimit, readJson, requireLogin } from "@/lib/server/http";
import { startVerification } from "@/lib/server/phone";

export function POST(req: Request) {
  return handle(async () => {
    const { uid } = await requireLogin(req);
    await rateLimit(`sms:${uid}`, 5, 3600_000);
    await rateLimit(`sms-ip:${clientIp(req)}`, 20, 3600_000);
    const { phone } = await readJson<{ phone: string }>(req);
    return json({ ok: true, ...(await startVerification(uid, phone)) });
  });
}
