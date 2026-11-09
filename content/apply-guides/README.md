# 신청 도우미 지침 문서

신청 도우미(`/apply`)와 LLM 안내는 **이 폴더의 문서 내용만** 근거로 쓴다. 문서에 없는 정책은 안내하지 않고 공식 창구로 보낸다.

## 형식

```
---
id: daycare                  # 파일 이름과 같게
title: 어린이집 입소 신청 안내
kinds: daycare               # 쉼표 구분. lib/kinds.ts 의 FacilityKind
source: 출처 기관·문서 이름
source_url: https://...
as_of: 2026-11-03            # 기준일 (내용을 확인한 날)
reviewed: false              # 담당자 검수 전이면 false → 화면에 '검수 전 초안' 표시
---

## 개요
자유 문단.

## 우선순위
- {항목ID} 화면에 보일 문구

## 필요 서류
- {서류ID} 문구
- {서류ID} 문구 | when: 우선순위ID, 우선순위ID   ← 그 우선순위를 고른 경우만 표시

## 신청 창구
- [링크 이름](https://...) 설명
```

구별 안내는 `sigungu/{sigungu_code}.md` 에 같은 frontmatter(`sigungu_code` 추가)로 `## 구청 연락처`, `## 구별 지원사업` 섹션을 둔다.
해당 구 파일이 없으면 구별 안내 없이 공통 문서만 보인다. `_template.md` 를 복사해 쓴다.

**`reviewed: false` 문서는 운영 공개 전에 반드시 담당자가 출처와 대조해 검수하고 `reviewed: true` 로 바꾼다.**
