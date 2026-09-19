import { NextResponse } from "next/server";
import overrides from "@/data/hours-overrides.json";
import { normalizeRows, type HoursOverrides, type RawRow } from "@/lib/normalize";
import type { FacilitiesPayload } from "@/lib/types";

// 어린이집 현원은 자주 바뀌지 않으므로 1시간 캐시
export const revalidate = 3600;

const BASE = "http://openapi.seoul.go.kr:8088";

export async function GET() {
  const key = process.env.SEOUL_OPEN_API_KEY?.trim();
  const isSample = !key;
  // sample 키는 5건까지만 허용된다.
  const url = `${BASE}/${key || "sample"}/json/ChildCareInfoDJ/1/${isSample ? 5 : 1000}/`;

  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();

    const body = json.ChildCareInfoDJ;
    if (!body?.row) {
      const msg = body?.RESULT?.MESSAGE ?? json.RESULT?.MESSAGE ?? "응답 형식이 올바르지 않습니다";
      throw new Error(msg);
    }

    const payload: FacilitiesPayload = {
      facilities: normalizeRows(body.row as RawRow[], overrides as HoursOverrides),
      source: isSample ? "sample" : "live",
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: `시설 데이터를 불러오지 못했습니다 (${message})` }, { status: 502 });
  }
}
