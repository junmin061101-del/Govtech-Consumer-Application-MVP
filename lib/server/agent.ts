// AI 상담 에이전트 (Gemini on Vertex AI, 서버 전용). 도구를 직접 써서 시설을 찾고, 프로필을 읽고, 신청 안내를 하고, 빈자리 알림을 건다.
//
// 대화 기록은 서버에 저장하지 않는다. 브라우저가 기록(Gemini 의 thoughtSignature 포함)을 그대로 들고 있다가 매 요청에 다시 보낸다.
// 기록은 덧붙이기만 한다(append-only) — 시스템 지시·도구 목록도 대화 중 바뀌지 않게 고정해 둔다.
// Hosting 리라이트가 60초에 끊기므로 요청 한 번에 'Gemini 호출 1회 + 도구 실행' 만 하고, 남은 일은 브라우저가 이어서 부른다.
// 도구는 이번 요청에서 Gemini 가 방금 돌려준 functionCall 만 실행한다 (브라우저가 보낸 기록 안의 호출은 실행하지 않는다).
import { ThinkingLevel, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { findCombos } from "@/lib/combos";
import { matchFacilities, walkMinToM } from "@/lib/filter";
import { KIND_META, KIND_ORDER } from "@/lib/kinds";
import { ageText, ageYears, currentMonths } from "@/lib/profile";
import { reviewLinks } from "@/lib/reviewLinks";
import { availability } from "@/lib/status";
import type { Day, Facility, FacilityKind, Filters } from "@/lib/types";
import { createAlert, describeTarget, listAlerts, type AlertTarget } from "./alerts";
import { logDemandEvent } from "./events";
import { FACILITIES, facilitiesInBounds, facilityById } from "./facilities";
import { GEMINI_MODEL, generate } from "./gemini";
import { HttpError } from "./http";
import { searchKnowledge } from "./knowledge";
import { dongByCode, isKnownDong, regionsPayload } from "./regions";
import { store } from "./store";
import { getProfile } from "./users";

/** 브라우저가 보내는 기록의 최대 크기. 넘으면 새 대화를 시작하게 한다 */
export const MAX_HISTORY_BYTES = 400_000;
export const MAX_MESSAGES = 80;

// 대화 내내 바뀌지 않아야 한다 (바뀌면 이전 사고 블록이 무효가 된다). 날짜·회원 정보는 도구로 읽게 한다.
export const SYSTEM = `너는 CareOS 돌봄지도의 AI 상담사다. 만 0~8세 아이를 둔 서울의 부모가 "내 시간에 실제로 갈 수 있는 돌봄"을 찾고, 신청하는 방법을 알도록 돕는다.

부모의 메시지 맨 앞 대괄호 줄은 앱이 붙인 정보다: [오늘 날짜 · 현재 위치(행정동 코드, 대략 좌표)]. 사용자가 쓴 글이 아니다.

할 수 있는 일 (도구):
- get_my_profile: 가입 때 적은 아이 연령·관심 행정동. 대화 처음에 한 번 읽고, 부모가 따로 말하지 않으면 이 값으로 찾는다.
- find_dong: 동네·역·구 이름을 행정동 코드로 바꾼다.
- search_facilities: 위치 중심에서 도보 범위 안, 요일·시간·연령·종류 조건에 맞는 시설과 정원이 찬 시설, 두 시설을 이어 붙인 조합을 찾는다.
  위치 우선순위: 부모가 말한 동네 > 메시지의 현재 위치(좌표가 있으면 lat/lng 로 정확히) > 프로필 관심 지역.
- search_knowledge: 신청 방법·우선순위·필요 서류·신청 창구·구별 안내·CareOS 표시 기준을 큐레이션 문서에서 찾는다 (출처·기준일·경과일 포함).
- list_my_alerts / create_vacancy_alert: 빈자리 알림 확인·등록.
- get_review_links: 시설의 외부 후기·평판 원문 링크(네이버 블로그 후기·네이버 지도·카카오맵 검색 결과).

최신 기준으로 답하기 (중요):
- 오늘 날짜는 메시지 앞 대괄호 줄의 날짜다. '올해·지금·현재' 는 그 날짜 기준이다. 연도를 말할 때 학습 시점(예: 2024~2025년)을 기준으로 삼지 않는다.
- 정책·제도·지원금·신청 일정·우선순위 기준은 해마다 바뀐다. 너의 사전 지식은 오래됐을 수 있으므로 이런 내용은 반드시 search_knowledge 를 먼저 부르고, 그 결과에 있는 내용만 말한다. 결과에 없으면 "안내 문서에 없어요"라고 하고 공식 창구(출처 링크)로 안내한다.
- 안내할 때는 출처와 기준일(as_of)을 함께 적는다. stale 이 true(기준일 1년 초과 또는 모름)이거나 reviewed 가 false(검수 전 초안)면 "기준일이 오래되었거나 검수 전이라 최신 기준과 다를 수 있어요"라고 꼭 밝힌다.
- 시설 정보의 기준일(data_as_of)도 함께 말한다.

지켜야 할 것:
- 빈자리는 정원−현원 추정치다. 상태가 '확인 필요'면 그렇게 말하고, 자리 여부는 시설에 꼭 확인하라고 안내한다.
- 입소·입학 자격이 된다/안 된다, 들어갈 수 있다/없다는 판단하지 않는다.
- 빈자리 알림은 부모가 등록하겠다고 분명히 말한 뒤에만 create_vacancy_alert 를 부른다. 등록 전에 대상(시설 또는 동·요일·시간·연령)을 한 줄로 확인한다.
- 아이 이름·생년월일·사진·연락처·상세 주소는 묻지도 적지도 않는다. 부모가 적으면 그 정보 없이 답한다. 좌표 숫자는 답에 적지 않는다.
- 도구 결과에 없는 시설·숫자·설명을 지어내지 않는다. 시설 유형(국공립·직장·가정 등)별 이용 자격이나 규칙처럼 결과에 없는 일반 상식도 덧붙이지 않는다.
- search_knowledge 결과를 옮길 때는 질문한 상황에 해당한다고 문서에 적힌 항목만 고른다 (예: 맞벌이 서류를 물으면 맞벌이에 해당하는 서류와 공통 서류만).
- 후기·평판·리뷰·분위기를 물으면 get_review_links 를 부른다. 링크는 앱이 답 아래에 버튼으로 자동으로 보여 주므로 주소(URL)를
  답에 다시 적지 않는다. "아래 버튼으로 네이버 블로그 글·지도 리뷰를 볼 수 있어요" 정도로 한두 줄만 쓴다. 블로그 글 내용은 앱이 화면에만 보여 주고
  너에게는 주지 않는다(네이버 약관). 너는 후기 내용을 읽을 수
  없으므로 후기를 요약하거나 평가(좋다·나쁘다·평점)를 지어내지 않는다. "블로그 후기는 개인 의견이고 협찬 글이 있을 수 있어요"라고 덧붙인다.
- 결과가 없으면 범위를 넓히거나(도보 시간, 시간대, 시설 종류) 빈자리 알림을 제안한다.
- 답은 한국어로, 모바일 화면에 맞게 짧게 쓴다. 시설은 이름·종류·거리·상태·운영 정보 위주로 3~5곳까지만 추린다.`;

const DAYS = ["weekday", "sat", "sun"] as const;
const HHMM = "^([01]\\d|2[0-3]):[0-5]\\d$";

export const TOOLS: FunctionDeclaration[] = [
  {
    name: "get_my_profile",
    description: "회원의 아이 연령(현재 개월·만 나이)과 관심 행정동, 빈자리 알림 개수를 돌려준다.",
    parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "find_dong",
    description: "동네·행정동·구 이름(예: '노량진', '상도1동', '강남구 역삼')으로 서울 행정동 코드를 찾는다. 최대 8개.",
    parametersJsonSchema: {
      type: "object",
      properties: { query: { type: "string", description: "동·구 이름. 역 이름이면 '역' 을 빼고 동네 이름으로" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_facilities",
    description:
      "행정동 중심에서 도보 범위 안 돌봄 시설을 찾는다. 조건에 맞는 시설(가까운 순), 정원이 찬 시설 수, 한 곳으로 시간이 안 될 때의 두 시설 조합을 돌려준다.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        emd_code: { type: "string", description: "find_dong·get_my_profile·현재 위치에서 얻은 10자리 행정동 코드" },
        lat: { type: "number", description: "현재 위치 좌표를 중심으로 찾을 때 (메시지 앞 대괄호 줄의 좌표)" },
        lng: { type: "number" },
        age: { type: "integer", minimum: 0, maximum: 8, description: "만 나이. 모르면 생략" },
        day: { type: "string", enum: [...DAYS], description: "weekday(평일) | sat | sun" },
        start: { type: "string", pattern: HHMM, description: "필요 시작 시각 HH:MM" },
        end: { type: "string", pattern: HHMM, description: "필요 끝 시각 HH:MM" },
        kinds: { type: "array", items: { type: "string", enum: KIND_ORDER }, description: "시설 종류. 비우면 전체" },
        walk_min: { type: "integer", minimum: 5, maximum: 30, description: "도보 범위(분). 기본 15" },
      },
      required: ["emd_code", "day", "start", "end"],
      additionalProperties: false,
    },
  },
  {
    name: "search_knowledge",
    description:
      "신청 방법·입소 우선순위·필요 서류·신청 창구·구별 지원사업·CareOS 정보 표시 기준을 큐레이션 문서에서 검색한다. 결과마다 출처·기준일(as_of)·경과일(age_days)·stale·reviewed 가 붙는다.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "찾을 내용 (예: '어린이집 맞벌이 서류', '유치원 신청 기간')" },
        kind: { type: "string", enum: KIND_ORDER, description: "시설 종류로 좁힐 때" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_review_links",
    description:
      "시설의 외부 후기·평판 원문 링크(네이버 블로그 후기·네이버 지도·카카오맵 검색). search_facilities 결과의 id 를 주거나, 결과에 없는 시설이면 이름을 준다. 후기 내용은 돌려주지 않는다.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        facility_id: { type: "string", description: "search_facilities 결과의 id" },
        name: { type: "string", description: "facility_id 가 없을 때 시설 이름 (예: 서울신구유치원)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_my_alerts",
    description: "회원이 받고 있는 빈자리 알림 목록 (최대 3개).",
    parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_vacancy_alert",
    description:
      "빈자리 알림을 등록한다. 부모가 등록을 분명히 원할 때만 부른다. 시설 하나(facility) 또는 조건(condition: 행정동·요일·시간·연령·종류) 중 하나. 계정당 3개, 90일.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["facility", "condition"] },
        facility_id: { type: "string", description: "type=facility 일 때 search_facilities 결과의 id" },
        facility_name: { type: "string" },
        emd_code: { type: "string", description: "type=condition 일 때" },
        day: { type: "string", enum: [...DAYS] },
        start: { type: "string", pattern: HHMM },
        end: { type: "string", pattern: HHMM },
        age: { type: "integer", minimum: 0, maximum: 8, description: "모르면 생략" },
        kinds: { type: "array", items: { type: "string", enum: KIND_ORDER } },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
];

/** 화면에 보여 줄 도구 진행 문구 */
export const TOOL_LABELS: Record<string, string> = {
  get_my_profile: "프로필 확인",
  find_dong: "동네 찾기",
  search_facilities: "시설 검색",
  search_knowledge: "안내 문서 검색",
  list_my_alerts: "알림 확인",
  get_review_links: "후기 링크 찾기",
  create_vacancy_alert: "빈자리 알림 등록",
};

// --- 도구 실행 ---

const dongName = (code: string) => {
  const d = dongByCode(code);
  if (!d) return code;
  const gu = regionsPayload().sigungu.find((g) => g.code === d.sigungu_code)?.name ?? "";
  return `${gu} ${d.name}`.trim();
};

/** 행정동 중심 주변 영역 (도보 분 → 미터 → 도) */
function boundsAround(c: { lat: number; lng: number }, radiusM: number) {
  const dLat = radiusM / 111_000;
  const dLng = radiusM / (111_000 * Math.cos((c.lat * Math.PI) / 180));
  return { swLat: c.lat - dLat, swLng: c.lng - dLng, neLat: c.lat + dLat, neLng: c.lng + dLng };
}

const facilitySummary = (f: Facility, distanceM: number | null, hoursLabel?: string) => {
  const a = availability(f);
  return {
    id: f.id,
    name: f.name,
    kind: KIND_META[f.kind].label,
    type: f.type,
    address: f.address.replace("서울특별시 ", ""),
    distance_m: distanceM === null ? null : Math.round(distanceM / 10) * 10,
    status: a.label,
    data_as_of: a.asOf,
    vacancy_estimate: f.vacancy,
    capacity: f.capacity,
    enrolled: f.enrolled,
    staff: f.staff ?? null,
    waitlist_total: f.waitlist ? f.waitlist.reduce((x, y) => x + y, 0) : null,
    hours: hoursLabel ?? null,
    phone: f.phone || null,
  };
};

type ToolInput = Record<string, unknown>;

export async function runTool(uid: string, name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    case "get_my_profile": {
      const p = await getProfile(uid);
      if (!p) return { error: "회원 프로필이 없어요" };
      return {
        children: p.children.map((c, i) => {
          const m = currentMonths(c);
          return { order: i + 1, months: m, age_years: Math.min(8, ageYears(m)), text: ageText(m) };
        }),
        interest_dongs: p.interestDongs.map((code) => ({ emd_code: code, name: dongName(code) })),
        active_alerts: (await listAlerts(uid)).length,
        today: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
      };
    }

    case "find_dong": {
      const q = String(input.query ?? "").replace(/\s+/g, "").replace(/역$/, "");
      if (!q) return { error: "이름을 알려 주세요" };
      const r = regionsPayload();
      const guNames = new Map(r.sigungu.map((g) => [g.code, g.name]));
      const scored = r.dongs
        .map((d) => {
          const full = `${guNames.get(d.sigunguCode) ?? ""}${d.name}`;
          const base = d.name.replace(/\d*동$/, "").replace(/제\d+$/, "");
          const score = full === q || d.name === q ? 3 : d.name.startsWith(q) || q.includes(d.name) ? 2 : full.includes(q) || (base && q.includes(base)) ? 1 : 0;
          return { d, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      return { matches: scored.map(({ d }) => ({ emd_code: d.code, name: `${guNames.get(d.sigunguCode)} ${d.name}` })) };
    }

    case "search_facilities": {
      const emd = String(input.emd_code ?? "");
      const d = dongByCode(emd);
      if (!d) return { error: "행정동 코드가 올바르지 않아요. find_dong 으로 먼저 찾아 주세요" };
      // 현재 위치 좌표를 주면 그 지점을 중심으로 (서울 범위 안일 때만)
      const lat = Number(input.lat);
      const lng = Number(input.lng);
      const center = Number.isFinite(lat) && Number.isFinite(lng) && lat > 37.4 && lat < 37.72 && lng > 126.75 && lng < 127.2 ? { lat, lng } : d.center;
      const walk = Number.isInteger(input.walk_min) ? Math.min(30, Math.max(5, input.walk_min as number)) : 15;
      const age = Number.isInteger(input.age) ? Math.min(8, Math.max(0, input.age as number)) : null;
      const day = (DAYS as readonly string[]).includes(String(input.day)) ? (input.day as Day) : "weekday";
      const start = new RegExp(HHMM).test(String(input.start)) ? String(input.start) : "09:00";
      const end = new RegExp(HHMM).test(String(input.end)) ? String(input.end) : "18:00";
      const kinds = (Array.isArray(input.kinds) ? input.kinds : []).filter((k): k is FacilityKind => KIND_ORDER.includes(k as FacilityKind));
      const filters: Filters = { age, kinds, day, start, end, center: { ...center, label: d.name }, radiusM: walkMinToM(walk) };

      const { facilities } = await facilitiesInBounds(boundsAround(center, filters.radiusM));
      const matches = matchFacilities(facilities, filters);
      const full = matchFacilities(facilities, filters, { full: true });
      const combos = matches.length === 0 ? findCombos(facilities, filters) : [];

      await logDemandEvent(uid, {
        event_type: matches.length ? "search_result" : "search_no_result",
        emd_code: emd,
        day,
        start,
        end,
        age,
        facility_types: kinds,
        meta: matches.length ? { result_count: matches.length, combo_count: combos.length, walk_min: walk } : { walk_min: walk, combo_count: combos.length },
      }).catch(() => {});

      return {
        area: `${center === d.center ? `${dongName(emd)} 중심` : `현재 위치(${dongName(emd)})`} 도보 ${walk}분`,
        condition: `${day === "weekday" ? "평일" : day === "sat" ? "토요일" : "일요일"} ${start}~${end}${age !== null ? ` · 만 ${age}세` : ""}`,
        facilities_in_area: facilities.length,
        match_count: matches.length,
        matches: matches.slice(0, 8).map((m) => facilitySummary(m.facility, m.distanceM, m.hours.label)),
        full_count: full.length,
        full_examples: full.slice(0, 3).map((m) => facilitySummary(m.facility, m.distanceM)),
        combos: combos.map((c) => ({
          first: c.first.name,
          until: c.handoff,
          then: c.second.name,
          transfer_walk_min: c.transferMin,
        })),
        note:
          facilities.length === 0
            ? "이 지역은 아직 수집된 시설 데이터가 없어요 (지금은 수집된 구만 검색돼요)"
            : "빈자리는 정원−현원 추정치예요. 유치원·센터 일부는 지도 화면의 카카오 장소 검색으로만 보여 여기 결과에 빠질 수 있어요",
      };
    }

    case "search_knowledge": {
      const query = String(input.query ?? "").slice(0, 300);
      if (!query.trim()) return { error: "찾을 내용을 알려 주세요" };
      const kind = KIND_ORDER.includes(input.kind as FacilityKind) ? (input.kind as FacilityKind) : undefined;
      const p = await getProfile(uid);
      const gu = p?.interestDongs[0] ? dongByCode(p.interestDongs[0])?.sigungu_code : null;
      const hits = await searchKnowledge(query, { kind, sigunguCode: gu });
      return {
        today: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
        results: hits,
        note: hits.length ? "결과에 있는 내용만 안내하고, 출처·기준일을 함께 적어요" : "안내 문서에 관련 내용이 없어요. 공식 창구로 안내해 주세요",
      };
    }

    case "get_review_links": {
      const id = String(input.facility_id ?? "").slice(0, 120);
      let f = id ? await facilityById(id) : null;
      if (!f && input.name) {
        // 이름만 주면 수집한 시설에서 같은 이름을 찾아, 하나뿐이면 그 주소(구)로 검색을 좁힌다
        const same = await store().list<Facility & Record<string, unknown>>(FACILITIES, [["name", "==", String(input.name).trim().slice(0, 60)]]);
        if (same.length === 1) f = same[0];
      }
      const name = (f?.name ?? String(input.name ?? "")).trim().slice(0, 60);
      if (!name) return { error: "facility_id 또는 name 이 필요해요" };
      // URL 은 모델에 주지 않는다 (모델이 긴 주소를 옮겨 적다 멈추는 일이 있었다). 앱이 이름·주소로 같은 링크를 만들어 버튼으로 보여 준다.
      return {
        facility: name,
        address: f?.address ?? "",
        buttons_shown: reviewLinks({ name, address: f?.address ?? "" }).map((l) => l.label),
        note: "앱이 위 버튼들을 답 아래에 보여 준다. 주소(URL)는 적지 말고 한두 줄로 안내만 한다. 후기 내용은 CareOS 가 읽거나 저장하지 않는다.",
      };
    }

    case "list_my_alerts": {
      const list = await listAlerts(uid);
      return { alerts: list.map((a) => ({ id: a.id, target: describeTarget(a.target), expires_at: a.expires_at.slice(0, 10) })), max: 3 };
    }

    case "create_vacancy_alert": {
      let target: AlertTarget;
      if (input.type === "facility") {
        target = { type: "facility", facilityId: String(input.facility_id ?? ""), facilityName: String(input.facility_name ?? "") };
      } else {
        const emd = String(input.emd_code ?? "");
        if (!isKnownDong(emd)) return { error: "행정동 코드가 올바르지 않아요" };
        target = {
          type: "condition",
          emdCode: emd,
          day: (input.day as Day) ?? "weekday",
          start: String(input.start ?? ""),
          end: String(input.end ?? ""),
          age: Number.isInteger(input.age) ? (input.age as number) : null,
          kinds: (Array.isArray(input.kinds) ? input.kinds : []) as FacilityKind[],
        };
      }
      try {
        const a = await createAlert(uid, target);
        return { ok: true, alert: describeTarget(a.target), expires_at: a.expires_at.slice(0, 10) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "등록하지 못했어요" };
      }
    }
  }
  return { error: `알 수 없는 도구: ${name}` };
}

// --- 한 단계 실행 ---

/** 브라우저가 보낸 기록의 기본 모양만 확인한다 (내용은 Gemini 의 맥락으로만 쓰인다) */
export function validateHistory(contents: unknown): Content[] {
  if (!Array.isArray(contents) || contents.length === 0) throw new HttpError(400, "대화 기록이 올바르지 않아요");
  if (contents.length > MAX_MESSAGES || JSON.stringify(contents).length > MAX_HISTORY_BYTES) {
    throw new HttpError(413, "대화가 너무 길어졌어요. 새 대화를 시작해 주세요");
  }
  for (const c of contents) {
    if (!c || (c.role !== "user" && c.role !== "model") || !Array.isArray(c.parts) || c.parts.length === 0) {
      throw new HttpError(400, "대화 기록이 올바르지 않아요");
    }
  }
  if (contents[0].role !== "user" || contents[contents.length - 1].role !== "user") throw new HttpError(400, "대화 기록이 올바르지 않아요");
  return contents as Content[];
}

export interface StepResult {
  /** 이번 단계에서 기록에 덧붙일 내용 (model 응답, 필요하면 functionResponse) */
  append: Content[];
  /** true 면 답이 끝났다. false 면 도구 결과를 붙였으니 브라우저가 다시 불러야 한다 */
  done: boolean;
  /** 이번에 실행한 도구 (화면 표시용) */
  tools: string[];
}

const FALLBACK_TEXT = "지금은 답을 만들지 못했어요. 질문을 조금 바꿔 다시 물어봐 주세요.";

export async function agentStep(uid: string, history: Content[]): Promise<StepResult> {
  const res = await generate()({
    model: GEMINI_MODEL(),
    contents: history,
    config: {
      systemInstruction: SYSTEM,
      tools: [{ functionDeclarations: TOOLS }],
      // 모바일용 짧은 답. 상한을 낮게 둬 반복 생성이 시간 제한(45초)까지 가지 않게 한다
      maxOutputTokens: 2048,
      // 채팅이라 생각 수준을 낮춘다 (기본 대비 약 2~3배 빠름, 2026-11 측정). MINIMAL 은 이 모델에서 지원하지 않는다
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      // Hosting 리라이트 60초 안에 오류 안내까지 돌아오도록 한 번의 호출을 45초로 자른다
      abortSignal: AbortSignal.timeout(45_000),
    },
  });

  // 응답 parts 는 thoughtSignature 까지 그대로 기록에 남긴다 (다음 요청에 그대로 돌려줘야 한다)
  const parts: Part[] = res.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter((p) => p.functionCall?.name);
  if (parts.length === 0) {
    return { append: [{ role: "model", parts: [{ text: FALLBACK_TEXT }] }], done: true, tools: [] };
  }
  const model: Content = { role: "model", parts };
  if (calls.length === 0) return { append: [model], done: true, tools: [] };

  const responses: Part[] = await Promise.all(
    calls.map(async (p) => {
      const call = p.functionCall!;
      let out: unknown;
      try {
        out = await runTool(uid, call.name!, (call.args ?? {}) as ToolInput);
      } catch (e) {
        console.error("agent tool failed", call.name, e);
        out = { error: "도구 실행 중 오류가 났어요" };
      }
      const response = out && typeof out === "object" && !Array.isArray(out) ? (out as Record<string, unknown>) : { result: out };
      return { functionResponse: { id: call.id, name: call.name, response } };
    }),
  );
  return { append: [model, { role: "user", parts: responses }], done: false, tools: calls.map((p) => p.functionCall!.name!) };
}
