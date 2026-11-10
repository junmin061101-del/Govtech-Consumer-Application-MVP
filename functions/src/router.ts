// /api 경로 → 라우트 핸들러. 핸들러는 server/api/**/route.ts 의 표준 Request → Response 함수를 그대로 쓴다.
import * as adminCommunity from "@/server/api/admin/community/route";
import * as agent from "@/server/api/agent/route";
import * as alertById from "@/server/api/alerts/[id]/route";
import * as alerts from "@/server/api/alerts/route";
import * as authDev from "@/server/api/auth/dev/route";
import * as postById from "@/server/api/community/posts/[id]/route";
import * as posts from "@/server/api/community/posts/route";
import * as config from "@/server/api/config/route";
import * as cronDaily from "@/server/api/cron/daily/route";
import * as events from "@/server/api/events/route";
import * as facilities from "@/server/api/facilities/route";
import * as me from "@/server/api/me/route";
import * as notificationById from "@/server/api/notifications/[id]/route";
import * as notifications from "@/server/api/notifications/route";
import * as phoneSend from "@/server/api/phone/send/route";
import * as phoneVerify from "@/server/api/phone/verify/route";
import * as regionsLocate from "@/server/api/regions/locate/route";
import * as regions from "@/server/api/regions/route";
import * as reviewsBlog from "@/server/api/reviews/blog/route";
import * as signup from "@/server/api/signup/route";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

export const ROUTES: [pattern: string, mod: RouteModule][] = [
  ["/api/admin/community", adminCommunity],
  ["/api/agent", agent],
  ["/api/alerts/:id", alertById as RouteModule],
  ["/api/alerts", alerts],
  ["/api/auth/dev", authDev],
  ["/api/community/posts/:id", postById as RouteModule],
  ["/api/community/posts", posts],
  ["/api/config", config as RouteModule],
  ["/api/cron/daily", cronDaily as RouteModule],
  ["/api/events", events],
  ["/api/facilities", facilities],
  ["/api/me", me],
  ["/api/notifications/:id", notificationById as RouteModule],
  ["/api/notifications", notifications],
  ["/api/phone/send", phoneSend],
  ["/api/phone/verify", phoneVerify],
  ["/api/regions/locate", regionsLocate],
  ["/api/regions", regions as RouteModule],
  ["/api/reviews/blog", reviewsBlog as RouteModule],
  ["/api/signup", signup],
];

/** App Check 헤더를 붙일 수 없는 경로 (브라우저 이동으로 들어오는 경로 등). 지금은 없다 */
export const APP_CHECK_EXEMPT: string[] = [];

export function match(path: string): { mod: RouteModule; params: Record<string, string> } | null {
  const clean = path.replace(/\/+$/, "") || "/";
  for (const [pattern, mod] of ROUTES) {
    const keys: string[] = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
    const m = clean.match(re);
    if (m) return { mod, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/** 표준 Request 를 받아 라우트를 찾아 부른다 */
export async function dispatch(req: Request): Promise<Response> {
  const hit = match(new URL(req.url).pathname);
  if (!hit) return Response.json({ error: "not found" }, { status: 404 });
  const fn = hit.mod[req.method as keyof RouteModule];
  if (!fn) return Response.json({ error: "method not allowed" }, { status: 405 });
  return fn(req, { params: Promise.resolve(hit.params) });
}
