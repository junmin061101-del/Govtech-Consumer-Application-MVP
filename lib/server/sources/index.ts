// 시설 데이터 소스 어댑터. 소스마다 같은 Facility 스키마로 돌려주면 수집기(facilities.ts)가
// 행정동 코드·geohash·수집일을 붙여 저장한다. 새 소스(아이돌봄서비스 등)는 여기에 어댑터를 더한다.
import type { Facility, FacilityKind } from "@/lib/types";
import { localCenterStd } from "./localCenterStd";
import { seoulChildcare } from "./seoulChildcare";

export interface SourceRun {
  facilities: Facility[];
  /** 구·하위 단위별 결과 (수집 보고용) */
  parts: { key: string; count: number; error?: string; skipped?: string }[];
  /** 샘플 키처럼 일부만 받은 경우 */
  partial: boolean;
  /** 소스 전체를 빠짐없이 받았으면 true → 이번에 없던 시설은 지운다 (구 단위 정리 대신) */
  complete?: boolean;
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
  localCenterStd,
  // 다함께돌봄센터: 서울 전체를 다루는 공개 데이터 없음 (2026-11 조사: 공공데이터포털에는 대전 서구·부산·대구·경기 등
  // 일부 지자체 자료만 있다). 서울 자치구 자료가 생기면 어댑터를 붙인다.
  pending("togethercare", "togethercare", "다함께돌봄센터", "서울 공개 데이터 없음"),
  // TODO: 우리동네키움센터 — 서울 열린데이터광장 OA-20965 '서울시 우리동네키움센터 시설현황정보'
  // (시설명·자치구·주소·좌표·상시/일시 정원·평일/방학/토요일 운영시간·이용료). OpenAPI 서비스명·응답 필드명을
  // 데이터셋 페이지 'Open API' 탭에서 확인한 뒤 구현한다 (개발 환경에서 열린데이터광장 접속 불가).
  pending("kiumcenter-seoul", "kiumcenter", "우리동네키움센터", "OA-20965 API 명세 미확인"),
];
