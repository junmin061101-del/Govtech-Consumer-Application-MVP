import { flags, json } from "@/lib/server/http";

export async function GET() {
  return json({ flags: await flags() });
}
