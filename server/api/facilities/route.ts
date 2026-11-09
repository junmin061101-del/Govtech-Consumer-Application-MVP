import { facilitiesInBounds, lastSync, syncFacilities } from "@/lib/server/facilities";
import { clientIp, handle, HttpError, json, rateLimit } from "@/lib/server/http";
import type { Bounds, FacilitiesPayload } from "@/lib/types";

// 수집 전 첫 요청이면 한 번만 수집을 기다린다 (개발 편의). 운영에서는 매일 cron 이 채운다.
const g = globalThis as unknown as { __careosFirstSync?: Promise<unknown> };

/** ?bounds=swLat,swLng,neLat,neLng — 화면 영역 안 시설만 돌려준다 (전체를 한 번에 내려주지 않는다) */
export function GET(req: Request) {
  return handle(async () => {
    await rateLimit(`facilities:${clientIp(req)}`, 120, 60_000);
    const parts = (new URL(req.url).searchParams.get("bounds") ?? "").split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw new HttpError(400, "bounds 가 필요해요");
    const [swLat, swLng, neLat, neLng] = parts;
    if (neLat <= swLat || neLng <= swLng || neLat - swLat > 1 || neLng - swLng > 1) {
      throw new HttpError(400, "지도 영역이 너무 넓어요");
    }
    const b: Bounds = { swLat, swLng, neLat, neLng };

    let sync = await lastSync();
    if (!sync) {
      g.__careosFirstSync ??= syncFacilities().catch((e) => console.error("first sync failed", e));
      await g.__careosFirstSync;
      sync = await lastSync();
    }

    const { facilities, truncated } = await facilitiesInBounds(b);
    const payload: FacilitiesPayload = {
      facilities,
      truncated,
      source: !sync || sync.total === 0 ? "empty" : sync.sample ? "sample" : "live",
      syncedAt: sync?.finishedAt ?? null,
    };
    return json(payload, { headers: { "Cache-Control": "private, max-age=300" } });
  });
}
