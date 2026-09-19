# CareOS 동작구 돌봄지도 (시민용 MVP)

우리 아이 나이·원하는 시간·선호 위치를 입력하면, 조건에 맞고 빈자리가 있는 동작구 어린이집만 지도에 띄우고 바로 신청 창구로 연결한다.

## 실행

```bash
npm install
cp .env.local.example .env.local   # 키 입력
npm run dev                        # http://localhost:3000
npm test                           # 필터·정규화 로직 테스트
```

| 환경변수 | 용도 |
| --- | --- |
| `SEOUL_OPEN_API_KEY` | 서울 열린데이터광장 인증키. 없으면 sample 키(5곳)로 동작 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 JavaScript 키. 사이트 도메인(localhost, Vercel 도메인) 등록 필수 |

Vercel 배포 시 위 두 값을 Project Settings > Environment Variables 에 넣는다.

## 구조

- `app/api/facilities/route.ts` — `ChildCareInfoDJ` 조회·정규화 (서버에서만 키 사용, 1시간 캐시)
- `lib/normalize.ts` — 원본 row → `Facility` (빈자리 = 정원 − 현원, 연령별 반 개설 여부)
- `lib/filter.ts` — 나이·시간·위치·빈자리 필터와 정렬
- `components/` — 카카오맵, 필터바, 결과 목록/상세

## 데이터 한계 (MVP 가정)

- 빈자리는 **정원 − 현원 추정치**이며 연령별 정원은 없다. 상세 화면에 그대로 고지한다.
- 야간연장·휴일보육은 API의 `CRSPEC`(어린이집 특성) 필드에서 읽는다. 평일 07:30~19:30 밖의 검색은
  `야간연장형`·`휴일보육` 시설만 통과한다. 다만 **종료 시각·운영 시간대는 데이터에 없어** 상세 화면에서
  "확인 필요"로 표시한다. 24시간형만 심야까지 확정한다.
- 시설별로 정확한 운영시간을 알게 되면 `data/hours-overrides.json` 으로 덮어쓸 수 있다(API 값보다 우선). 형식:
  `{ "<STCODE>": { "night": true, "closeTime": "22:00", "weekend": true } }`
- 이 데이터셋의 이용 조건(공공누리 유형)은 상용 서비스 전환 전에 확인해야 한다.
- 예약은 자체 시스템 없이 아이사랑(입소 신청)·전화·시설 홈페이지로 연결한다.
