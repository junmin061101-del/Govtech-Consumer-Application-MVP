import { handle, json, rateLimit, readJson, requireLogin } from "@/lib/server/http";
import { confirmVerification } from "@/lib/server/phone";

export function POST(req: Request) {
  return handle(async () => {
    const { uid } = await requireLogin(req);
    await rateLimit(`sms-verify:${uid}`, 20, 3600_000);
    const { code } = await readJson<{ code: string }>(req);
    await confirmVerification(uid, String(code ?? ""));
    return json({ ok: true });
  });
}
