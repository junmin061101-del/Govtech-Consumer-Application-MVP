import type { FacilityKind } from "./types";

interface KindMeta {
  label: string;
  /** 핀 안에 빈자리 수를 못 보여줄 때 쓰는 한 글자 */
  short: string;
  color: string;
  /** 대상 만 나이 (양 끝 포함). 어린이집은 반 개설 정보로 따로 계산한다. */
  ages: [number, number];
  /** 신청 창구. null 이면 시설에 직접 문의 */
  apply: { label: string; url: string } | null;
}

export const KIND_META: Record<FacilityKind, KindMeta> = {
  daycare: {
    label: "어린이집",
    short: "어",
    color: "#059669",
    ages: [0, 5],
    apply: { label: "입소 신청하기 (아이사랑)", url: "https://www.childcare.go.kr" },
  },
  kindergarten: {
    label: "유치원",
    short: "유",
    color: "#d97706",
    ages: [3, 5],
    apply: { label: "입학 신청하기 (처음학교로)", url: "https://www.go-firstschool.go.kr" },
  },
  localcenter: {
    label: "지역아동센터",
    short: "지",
    color: "#2563eb",
    ages: [6, 8],
    apply: null,
  },
  togethercare: {
    label: "다함께돌봄센터",
    short: "다",
    color: "#7c3aed",
    ages: [6, 8],
    apply: null,
  },
};

export const KIND_ORDER: FacilityKind[] = ["daycare", "kindergarten", "localcenter", "togethercare"];
