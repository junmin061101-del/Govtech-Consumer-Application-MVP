// 시설 데이터 소스 어댑터. 소스마다 같은 Facility 스키마로 돌려주면 수집기(facilities.ts)가
// 행정동 코드·geohash·수집일을 붙여 저장한다. 새 소스(아이돌봄서비스 등)는 여기에 어댑터를 더한다.
import type { Facility, FacilityKind } from "@/lib/types";
import { seoulKiumCenter, seoulLocalCenter } from "./seoulCareCenter";
import { seoulChildcare } from "./seoulChildcare";
import { seoulKindergarten } from "./seoulKindergarten";

export interface SourceRun {
  facilities: Facility[];
  /** 구·하위 단위별 결과 (수집 보고용) */
  parts: { key: string; count: number; error?: string; skipped?: string }[];
  /** 샘플 키처럼 일부만 받은 경우 */
  partial: boolean;
  /** 소스 전체를 빠짐없이 받았으면 true → 이번에 없던 시설은 지운다 (구 단위 정리 대신) */
  complete?: boolean;
  /** 인증키 없이 샘플 키로 일부만 받은 경우 (화면에 '샘플 데이터' 안내). 오류로 못 받은 것과 구분한다 */
  sample?: boolean;
}

export interface FacilitySource {
  id: string;
  kind: FacilityKind;
  label: string;
  run(): Promise<SourceRun>;
}

/** 공개 데이터 확인 전까지 비워 두는 소스. 지도에는 카카오 장소 검색(lib/extras.ts)으로 위치만 보인다. */
function pending(id: string, kind: FacilityKind, label: string, todo: string): FacilitySource {
  return {
    id,
    kind,
    label,
    async run() {
      return { facilities: [], parts: [{ key: id, count: 0, skipped: todo }], partial: true };
    },
  };
}

export const SOURCES: FacilitySource[] = [
  seoulChildcare,
  // 유치원: 서울시 유치원 일반현황(childSchoolInfo) + 카카오 주소 → 좌표
  seoulKindergarten,
  // 지역아동센터: 서울시 지역아동센터 시설현황정보(OA-20967). 공공데이터포털 전국 표준데이터 어댑터(localCenterStd.ts)는
  // 서울 자료가 이쪽과 겹쳐 쓰지 않는다 (다른 시·도로 넓힐 때 쓴다).
  seoulLocalCenter,
  // 우리동네키움센터: 서울시 우리동네키움센터 시설현황정보(OA-20965)
  seoulKiumCenter,
  // 다함께돌봄센터: 서울 전체를 다루는 공개 데이터 없음 (2026-11 조사: 공공데이터포털에는 대전 서구·부산·대구·경기 등
  // 일부 지자체 자료만 있다). 지도에는 카카오 장소 검색으로 위치만 보인다.
  pending("togethercare", "togethercare", "다함께돌봄센터", "서울 공개 데이터 없음"),
];
