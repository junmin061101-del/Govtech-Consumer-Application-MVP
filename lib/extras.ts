// 유치원·지역아동센터·다함께돌봄센터: 정원·빈자리 공개 API를 아직 못 구해 카카오맵 장소 정보로 위치만 채운다.
// 카카오 약관상 검색 결과를 저장·재배포하지 않고, 브라우저에서 실시간 조회해 지도에 그대로 표시한다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { KIND_META } from "./kinds";
import { loadKakao, type Kakao } from "./kakao";
import { AGES, type Facility, type FacilityKind } from "./types";

// 카카오 검색은 쿼리당 최대 45건이라 동작구 법정동별로 나눠 검색한다.
const DONGS = ["노량진동", "상도동", "본동", "흑석동", "동작동", "사당동", "대방동", "신대방동"];

// name: 시설 이름 패턴, category: 카카오 카테고리 패턴(애견유치원 같은 동명 업종을 걸러낸다)
const SEARCHES: {
  kind: FacilityKind;
  type: string;
  keyword: string;
  name: RegExp;
  category: RegExp;
  perDong: boolean;
}[] = [
  { kind: "kindergarten", type: "유치원", keyword: "유치원", name: /유치원/, category: /유아교육/, perDong: true },
  {
    kind: "localcenter",
    type: "지역아동센터",
    keyword: "지역아동센터",
    name: /지역아동|아동복지센터|아동센터/,
    category: /사회복지시설/,
    perDong: true,
  },
  { kind: "togethercare", type: "다함께돌봄센터", keyword: "다함께돌봄센터", name: /다함께돌봄/, category: /사회복지시설|아동/, perDong: false },
];

// 이름에 휴원·폐업이 표시된 곳은 지도에서 뺀다
const CLOSED = /휴원|폐원|폐업|휴업|폐쇄/;

const CACHE_KEY = "careos:extras:v1";

function ageOpenFor(kind: FacilityKind): boolean[] {
  const [lo, hi] = KIND_META[kind].ages;
  return AGES.map((a) => a >= lo && a <= hi);
}

/** 한 검색어의 결과를 마지막 페이지까지(최대 3쪽) 모은다. */
function searchAllPages(kakao: Kakao, ps: any, query: string): Promise<any[]> {
  return new Promise((resolve) => {
    const acc: any[] = [];
    const go = (page: number) => {
      ps.keywordSearch(
        query,
        (data: any[], status: string, pagination: any) => {
          if (status !== kakao.maps.services.Status.OK) return resolve(acc);
          acc.push(...data);
          if (pagination.current < pagination.last && page < 3) go(page + 1);
          else resolve(acc);
        },
        { page, size: 15 },
      );
    };
    go(1);
  });
}

function readCache(): Facility[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Facility[]) : null;
  } catch {
    return null;
  }
}

function writeCache(list: Facility[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* 저장소를 못 쓰는 환경이면 캐시 없이 동작 */
  }
}

export async function loadExtraFacilities(): Promise<Facility[]> {
  const cached = readCache();
  if (cached) return cached;

  const kakao = await loadKakao();
  const ps = new kakao.maps.services.Places();
  const found = new Map<string, Facility>();

  for (const s of SEARCHES) {
    const queries = s.perDong ? DONGS.map((d) => `${d} ${s.keyword}`) : [`동작구 ${s.keyword}`];
    const results = await Promise.all(queries.map((q) => searchAllPages(kakao, ps, q)));

    for (const d of results.flat()) {
      if (!/동작구/.test(d.address_name) || !s.name.test(d.place_name)) continue;
      if (!s.category.test(d.category_name ?? "") || CLOSED.test(d.place_name)) continue;
      const id = `kakao:${d.id}`;
      if (found.has(id)) continue;
      found.set(id, {
        id,
        kind: s.kind,
        name: d.place_name,
        type: s.type,
        address: d.road_address_name || d.address_name,
        phone: d.phone ?? "",
        homepage: "",
        lat: Number(d.y),
        lng: Number(d.x),
        capacity: null,
        enrolled: null,
        vacancy: null,
        ageOpen: ageOpenFor(s.kind),
        extended: {},
        asOf: "",
        detailUrl: d.place_url,
      });
    }
  }

  const list = [...found.values()];
  writeCache(list);
  return list;
}
