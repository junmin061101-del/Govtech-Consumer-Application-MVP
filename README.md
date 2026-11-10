# CareOS 돌봄지도 (부모용)

만 0~8세 자녀를 둔 부모가 **내 시간에 실제로 갈 수 있는 돌봄 시설**을 찾고, 신청하고, 자리가 나면 알림을 받는 앱.
돌봄을 찾다 멈춘 순간(결과 없음·신청 중단·빈자리 대기)은 개인을 알 수 없는 통계로 남긴다.

구성: **Firebase Hosting**(Next.js 정적 내보내기) + **Cloud Functions 2세대 `asia-northeast3`**(API·스케줄) +
**Firestore `asia-northeast3`** + **Firebase Auth**(이메일·비밀번호) + App Check + Remote Config.
선택 근거와 전체 계획은 [docs/firebase-plan.md](docs/firebase-plan.md).

## 로컬 실행 (에뮬레이터, 프로젝트·키 없이)

```bash
npm install && npm ci --prefix functions
cp .env.local.example .env.local      # NEXT_PUBLIC_USE_EMULATORS=true 그대로 두면 됨
npm run dev:emulators                 # 터미널 1: Auth·Firestore·Functions 에뮬레이터 (UI http://localhost:4000)
npm run dev                           # 터미널 2: http://localhost:3000 → /login
```

- `/login` 에서 이메일로 가입하거나(Auth 에뮬레이터라 메일은 실제로 가지 않는다), **개발용 로그인**(에뮬레이터 전용)으로
  바로 들어가 전체 흐름을 확인한다. 개발용 로그인 `admin` 은 게시판 관리자.
  휴대폰 인증번호는 화면과 에뮬레이터 로그에 표시된다(실제 프로젝트에서는 둘 다 꺼짐).
- 개발 서버는 `/api/**` 를 Functions 에뮬레이터로 넘긴다(`next.config.ts`). Codespaces 처럼 브라우저가 9099 에
  직접 못 닿으면 `NEXT_PUBLIC_AUTH_EMULATOR_URL=same-origin` 으로 Auth 요청도 개발 서버가 중계한다.
- Functions 코드를 고치면 `npm run build:functions` (에뮬레이터가 자동으로 다시 읽는다).
- 매일 작업을 손으로 돌리기: `curl http://127.0.0.1:5001/demo-careos/asia-northeast3/api/api/cron/daily`

## 테스트

| 명령 | 내용 |
| --- | --- |
| `npm test` | 단위 테스트 + API 시나리오 (메모리 저장소, 테스트 인증) |
| `npm run test:emulator` | Firestore 보안 규칙 · 저장소 계약(메모리·Firestore 결과 일치) |
| `npm run test:stack` | Functions 에뮬레이터에 HTTP 로 붙는 풀스택 E2E (Auth 에뮬레이터 실제 토큰) |
| `npm run typecheck` | 앱 + Functions 타입 검사 |
| `node scripts/check-bundle.mjs out` | 정적 빌드에 비밀값·서버 코드 흔적이 없는지 (CI 에서 실행) |

## 환경·배포

- 프로젝트: `careos-dev` / `careos-prod` (`.firebaserc` 별칭 `dev` / `prod`, 아직 자리표시 — 실제 ID 로 바꾼다). Blaze 요금제 필요.
- GitHub Actions
  - [`ci.yml`](.github/workflows/ci.yml): 모든 PR·main — 타입체크, 모든 테스트, 정적 빌드, 번들 검사
  - [`preview.yml`](.github/workflows/preview.yml): PR — dev 프로젝트 Hosting 미리보기 채널(7일) 배포, PR 에 링크 댓글
  - [`deploy.yml`](.github/workflows/deploy.yml): main — prod 에 Hosting·Functions·Firestore 규칙/색인·Remote Config 배포
  - 인증은 Workload Identity Federation. GitHub Environments `dev`/`prod` 에 vars 를 넣는다:
    `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID`,
    `KAKAO_MAP_KEY`, `RECAPTCHA_ENTERPRISE_KEY`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
- 손으로 배포: `firebase deploy --project dev` (Functions predeploy 가 `functions/` 를 빌드한다)

### 공개값 / 비밀값

| 공개 (웹 빌드에 포함, GitHub vars) | 비밀 (Secret Manager: `firebase functions:secrets:set <이름> --project <별칭>`) |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` 웹 설정 | `PKEY_SECRET` 통계 가명 키 솔트 — **한 번 정하면 바꾸지 않는다** |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | `NICKNAME_SECRET` 익명 닉네임 생성 |
| `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY` (App Check) | `SEOUL_OPEN_API_KEY`, `DATA_GO_KR_SERVICE_KEY` |

쓰지 않는 비밀값은 `-` 로 만들어 두면 없는 것으로 본다(Functions 배포는 선언된 비밀값이 모두 있어야 한다).
배포된 Functions 에서 `PKEY_SECRET`·`NICKNAME_SECRET` 이 없으면 오류를 낸다. 에뮬레이터용 값은 `functions/.secret.local`.

비밀이 아닌 서버 설정은 `functions/.env.<프로젝트ID>`: `ADMIN_EMAILS`(관리자 이메일, 쉼표 — 이메일 확인을 마친 계정만),
`ADMIN_UIDS`(관리자 uid), `APP_CHECK_ENFORCE=true`(prod),
`LLM_MODEL`, `SEOUL_CHILDCARE_SERVICE`.

### 보안

- **App Check**: 웹은 reCAPTCHA Enterprise, `api` 함수는 `APP_CHECK_ENFORCE=true` 일 때 `X-Firebase-AppCheck` 를 검증한다
  . dev 는 디버그 토큰(`NEXT_PUBLIC_APP_CHECK_DEBUG=true`)을 콘솔에 등록해 쓴다.
- **Firestore 규칙**: 기본 거부. 클라이언트 직접 접근은 본인 프로필 읽기와 리뷰뿐([firestore.rules](firestore.rules)).
- **요청 제한**: `api` 최대 인스턴스·동시성 상한 + uid/IP 기준 고정 창 카운터(`rate_limits`, `expires_at` TTL).
- **보안 헤더**: CSP·HSTS·X-Frame-Options 등 [firebase.json](firebase.json). 카카오맵·reCAPTCHA 도메인을 바꾸면 CSP 도 고친다.

### 분석

Google Analytics(광고 신호·Google 신호·광고 개인화 끔, 사용자 속성 없음)와 `demand_events` 를 BigQuery 에서 함께 본다:
[docs/bigquery.md](docs/bigquery.md).

## 로그인

- Firebase Authentication 이메일·비밀번호 (비밀번호 8자 이상, 가입 시 확인 메일 발송 — 가입을 막지는 않음, 비밀번호 재설정 메일).
- 새 프로젝트에서는 Authentication 을 시작하고 '이메일/비밀번호' 제공자를 켠다. 배포 도메인이 승인된 도메인에 있어야 한다
  (`<프로젝트>.web.app`·`firebaseapp.com` 은 기본 포함, 커스텀 도메인은 추가).
- 가입 완료 여부·익명 닉네임은 Admin SDK 로 사용자 클레임(`onboarded`, `nickname`)에 저장한다. 커스텀 토큰 서명이 필요 없어
  서비스 계정에 토큰 생성 권한을 줄 필요가 없다 (개발용 로그인의 커스텀 토큰은 에뮬레이터 전용).

## 카카오 개발자 콘솔 설정 (지도)

플랫폼 > Web > 사이트 도메인에 `http://localhost:3000`, dev/prod Hosting 도메인(`https://<프로젝트>.web.app`, 커스텀 도메인)을 등록한다.
카카오는 지도·장소 검색에만 쓴다.

## Vercel 에서 전환

1. dev 에 배포해 기존 기능(지도·필터·리뷰·로그인) 동작 확인
2. prod 배포 → 카카오 콘솔(지도)에 prod 도메인 등록
3. Vercel 은 1~2주 병행 후 새 도메인으로 리디렉션하고 내린다 (`vercel.json` 은 삭제함)

## 기능 플래그 (Remote Config)

Remote Config 매개변수 `flag_matching`, `flag_vacancy`, `flag_apply`, `flag_community` (기본값 [remoteconfig.template.json](remoteconfig.template.json)).
`api` 가 서버 템플릿을 1분 캐시로 읽어 꺼진 기능에 404 를 주고, `/api/me` 로 화면에도 같은 값을 내려 메뉴를 숨긴다.
에뮬레이터·테스트에서는 `FEATURE_FLAGS=community=off,apply=off` 환경변수를 쓴다.

| 플래그 | 기능 |
| --- | --- |
| `matching` | 돌봄 매칭 지도 — 상태 배지, 조합 탐색, 범위 넓혀 다시 찾기 |
| `vacancy` | 빈자리 알림 |
| `community` | 동네 게시판 |
| `agent` | AI 상담 (Gemini 에이전트) |

## 구조

```
app/                    화면 (모두 클라이언트 렌더링 → 정적 내보내기)
  page.tsx              지도 (화면 영역 기준 조회, 프로필로 조건 자동 채움)
  login, signup, me     로그인 · 가입(동의·연령·관심 행정동·휴대폰) · 내 정보(수정·알림·알림함·탈퇴)
  terms, privacy        이용약관 · 개인정보 처리방침 (법률 검토 전 초안)
  agent                 AI 상담 (Gemini 에이전트: 시설 찾기·신청 안내·빈자리 알림)
  community, admin/     동네 커뮤니티 · 관리자 검토
components/BottomNav    하단 탭: 지도 | AI 상담 | 동네 커뮤니티 | 내 정보
server/api/             API 핸들러 (표준 Request → Response). Functions api 가 경로로 찾아 부른다
functions/              Cloud Functions: api(HTTP), dailySync(매일 05:00 KST), onUserDeleted(Auth 삭제 → 탈퇴 정리)
lib/                    클라이언트·서버 공용 순수 로직 (필터·조합·배지·이벤트 정의·모더레이션·가입 가드 …)
lib/server/             서버 전용 (저장소·인증·지역 변환·이벤트 쓰기·수집·알림·게시판·LLM)
data/regions/           서울 행정동 경계·코드 (SGIS, vuski/admdongkor 가공, CC BY 4.0)
data/sources/           시설 소스 설정 (구별 OpenAPI 서비스명)
content/apply-guides/   신청 안내 문서 (출처·기준일 포함) — AI 상담 지식 검색(RAG) 원천
content/knowledge/      그 밖의 안내 문서 (CareOS 표시 기준 등) — RAG 원천
```

### 저장소 컬렉션 (Firestore 이전 시 그대로 옮긴다)

| 컬렉션 | 내용 | 접근 |
| --- | --- | --- |
| `users/{uid}` | 익명 닉네임, 아이 연령(개월·기준일), 관심 행정동, 동의 기록 | 본인(API 경유) |
| `user_contacts/{uid}` | 인증된 휴대폰 번호 | 서버만 |
| `pkey_salts/{uid}` | 가명 키 회원별 솔트 (탈퇴 시 폐기) | 서버만 |
| `facilities/{id}` | 정규화한 시설 + 시도·시군구·행정동 코드, geohash, 수집일 | 서버 → bounds 조회 |
| `demand_events/{id}` | 통계 이벤트 (아래) | 서버만 쓰기 |
| `vacancy_alerts`, `alert_deliveries`, `notifications` | 빈자리 알림·발송·알림함 | 본인(API 경유) |
| `knowledge_chunks`, `knowledge_meta` | AI 상담 지식 검색 색인 (문서 조각·임베딩·출처·기준일) | 서버만 |
| `community_posts` | 게시글 (uid 는 응답에 담지 않음) | 회원 읽기, 본인 쓰기 |

## 지역 (서울 25개 구, 이후 시·도 확장)

- 지역은 코드로 다룬다: `sido_code`(2) > `sigungu_code`(5) > `emd_code`(행정동 10자리). 동작구 하드코딩은 없다.
- `data/regions/seoul-emd.json`: 행정동 427개 경계(단순화)·중심점. 좌표 → 행정동 변환은 서버(`lib/server/regions.ts`)에서만 한다.
- 다른 시·도는 같은 형식 JSON 을 넣고 `REGION_FILES` 에 더한다.
- 지도 기본 위치는 관심 행정동 중심, 없으면 시·도 중심. 검색은 위치·반경 기준이라 구 경계와 무관하다.

## 시설 수집 (매일)

- 스케줄 함수 `dailySync` 가 매일 05:00 KST 에 돈다 (`lib/server/daily.ts`).
  1) 소스별 어댑터(`lib/server/sources/`)로 수집 → 행정동 코드·geohash·수집일 부여 → `facilities` 저장
  2) 정원·현원 변화 감지 → 빈자리 알림 매칭·만료 안내·후속 질문
- 첫 지도 요청 때 수집 기록이 없으면 한 번 수집한다.
- 지도는 `/api/facilities?bounds=…` 로 화면 영역 안 시설만 받는다. 서버는 영역을 덮는 geohash 접두사별 범위 쿼리로
  읽고(최대 600곳), 축소하면 확대를 안내한다.

| 소스 | 상태 |
| --- | --- |
| 서울시 어린이집 정보 (`ChildCareInfo`) | 서울 25개 구 전체를 한 서비스로 매일 수집 (약 4천 곳 운영 중). 중간에 끊긴 회차는 저장만 하고 폐지 정리는 건너뛴다 |
| 지역아동센터 | 공공데이터포털 [전국지역아동센터표준데이터](https://www.data.go.kr/data/15129438/standard.do) OpenAPI (`DATA_GO_KR_SERVICE_KEY`, 활용신청 필요). 정원·현원·종사자수·좌표·기준일. 지자체가 각자 등록하므로 수집 보고의 구별 건수로 범위 확인 |
| 우리동네키움센터 | 서울 열린데이터광장 OA-20965 (운영시간·정원 포함) 확인, API 서비스명·필드명 미확인이라 어댑터 대기 (TODO) |
| 다함께돌봄센터 | 서울 전체를 다루는 공개 데이터 없음 (2026-11 조사, 일부 타 지자체만 있음) |

어린이집 필드는 원천인 보육정보공개 API 서비스명세서(cpmsapi030 v1.7)와 같다: 보육교직원수 `CHCRTESCNT`,
영유아혼합반 `CLASS_CNT_M3`(만 2~3세), 연령별 입소대기 `EW_CNT_00~05` 를 읽는다. 공공데이터로 받은 시설과 겹치는
카카오 장소 검색 결과(약 60m 안 같은 종류)는 지도에서 뺀다.

## 통계 이벤트

- 쓰기는 `lib/server/events.ts` 의 `logDemandEvent` 한 곳 (`POST /api/events` 또는 서버 내부 호출). 클라이언트 직접 쓰기 없음.
- 종류: `search_result`, `search_no_result`, `search_widened`, `apply_step`, `apply_exit`, `apply_complete`,
  `vacancy_register`, `vacancy_resolved`, `community_need`
- 공통 필드: `event_type`, `emd_code`, `time_slot`(평일 07–09/09–18/18–20/20–22/주말, 걸치는 구간 배열), `target`(infant/school),
  `facility_types`, `pkey`, `created_at`, `meta` (+ `dedup_key`, `repeat_count`, `last_seen_at`)
- uid 원문·이름·연락처·좌표는 넣지 않는다. 좌표는 서버에서 행정동 코드로 바꾼 뒤 버린다. `meta` 는 종류별 허용 키·값만 남긴다.
- `pkey = HMAC(PKEY_SECRET, uid + 회원별 솔트)`. 탈퇴 시 솔트를 지워 기존 이벤트와 회원의 연결을 끊는다.
- 같은 pkey·같은 조건을 24시간 안에 반복하면 새 문서 대신 `repeat_count` 를 올린다.
- BigQuery 에서 Analytics 와 함께 조회: [docs/bigquery.md](docs/bigquery.md).

## 기능 메모

- **돌봄 매칭 지도**: 요일+시작~끝 시간 필터, 상태 배지(14일 이내 정원·현원으로 여유 확인 = 이용 가능, 그 밖 = 확인 필요, 기준일 표시),
  한 곳으로 못 채우면 운영시간을 아는 두 시설을 이어 붙인 조합 최대 3개(직선거리 도보 이동 시간 포함, 20분 이내),
  결과 없음 시 거리/시간/종류 한 단계 넓히기 + 빈자리 알림 버튼.
- **빈자리 알림**: 시설 또는 조건(행정동·요일·시간·연령·종류). 계정당 3개, 90일, 만료 7일 전 안내, 언제든 해지·연장.
  같은 알림은 하루 1회, 문구에 "자리 여부는 시설에 꼭 확인" 포함. 발송 3일 뒤 알림함에서 원탭 응답 → `vacancy_resolved`.
  발송은 `lib/server/notify.ts` 에서 추상화: 수신 동의 + 인증 번호 → 알림톡, 아니면 앱 푸시(FCM). 지금은 둘 다 미연결이라 앱 알림함에만 쌓인다.
- **동네 커뮤니티**: 행정동 단위, 자동 익명 닉네임, 4개 카테고리. 전화번호·아이 이름·상세 주소 패턴은 게시 차단,
  링크·연락처는 검토 대기, 신고 3건이면 자동 숨김, `/admin/community` 에서 공개·숨김·삭제. 이미지 업로드 없음.
  '이 시간에 맡길 곳 찾아요'는 요일·시간·연령·행정동 필드만 `community_need` 로 집계한다.

## AI (Gemini on Vertex AI)

API 키가 없다. Cloud Functions 의 기본 서비스 계정이 이 Firebase 프로젝트의 Vertex AI 로 Gemini 를 부른다
(Vertex AI API 사용 설정 필요, 요금은 프로젝트로 청구). 모델은 `AGENT_MODEL`(기본 `gemini-3.8-flash`), 위치는 `GEMINI_LOCATION`(기본 `global`).
로컬·에뮬레이터에서는 기본적으로 꺼져 있고(503 안내), Google 자격 증명이 있을 때 `GEMINI_LOCAL=on` 으로 켠다.

- **AI 상담 (`/agent`)**: 지도 화면의 'AI 상담' 메뉴·'AI에게 물어보기' 버튼. Gemini 가 도구를 직접 써서 답한다:
  프로필 읽기, 동네 → 행정동, 시설 검색(시간·연령·종류·도보 범위, 상태 배지, 조합), 신청 안내 문서(출처·기준일), 빈자리 알림 확인·등록(사용자 확인 후).
  - 대화 기록은 서버에 저장하지 않는다. 브라우저 탭이 기록(Gemini `thoughtSignature` 포함)을 그대로 들고 매 요청에 다시 보낸다(덧붙이기만).
  - Hosting 리라이트 60초 제한 때문에 요청 한 번 = Gemini 호출 1회 + 도구 실행. 도구를 썼으면 브라우저가 이어서 다시 부른다(최대 8단계).
  - 도구는 그 요청에서 Gemini 가 방금 돌려준 호출만 실행한다. 검색은 통계 이벤트(`search_result`/`search_no_result`)로도 남는다.
  - 코드: `lib/server/agent.ts`(지시·도구·한 단계 실행), `lib/server/gemini.ts`(클라이언트), `server/api/agent/route.ts`, `app/agent/page.tsx`
- **신청 안내는 AI 상담이 맡는다** (별도 신청 도우미 화면은 없앴다). 안내 문서는 RAG 로 찾는다:
  - `content/apply-guides/**/*.md`, `content/knowledge/*.md` 를 `##` 섹션 단위로 나눠 `gemini-embedding-2`(768차원)로 임베딩,
    Firestore `knowledge_chunks` 에 저장한다. 문서 내용이 바뀌면(해시) 첫 검색 또는 매일 작업에서 다시 색인한다 — 별도 색인 명령 없음.
  - 검색 결과마다 출처·기준일(`as_of`)·경과일·`stale`(1년 초과)·`reviewed`(검수 여부)를 붙인다.
- **최신 기준 가이드라인**: 앱이 메시지마다 `[오늘 날짜 · 현재 위치]` 줄을 붙이고(화면에는 숨김), 지시문에서
  "오늘 날짜 기준으로 답하고, 학습 시점(예: 2024~2025년) 지식으로 정책·금액·일정을 말하지 말 것, 반드시 문서 검색 결과만 근거로,
  오래되거나 검수 전 문서면 그렇게 밝힐 것"을 요구한다. 새 기준이 나오면 문서의 내용·`as_of` 를 고쳐 배포하면 된다.
- **위치 연동**: AI 상담의 '📍 현재 위치 사용'을 켜면 브라우저 위치를 서버에서 행정동으로 바꾸고, AI 에는 행정동과 대략 좌표(소수 3자리)만 보낸다.
  시설 검색은 그 좌표를 중심으로 한다. 켜 두면 다음 방문에도 자동으로 다시 켠다.
- **속도**: 채팅이라 생각 수준 `LOW`(기본 대비 약 2~3배 빠름). 한 번의 호출은 45초로 자른다(Hosting 60초 제한).

## 알림톡 설정 (TODO)

발송 대행사·발신 프로필·템플릿이 정해지면 `lib/server/notify.ts` 의 `alimtalk.send` 를 구현하고 `ALIMTALK_*` 를 넣는다.
알림톡은 승인된 템플릿 문구만 보낼 수 있어, 빈자리·만료 안내·후속 질문 세 가지 템플릿 승인이 필요하다.

## 운영 전 확인할 것 (TODO 목록)

- 서울 24개 구 어린이집 OpenAPI 서비스명 (`data/sources/seoul-childcare.json`)
- 우리동네키움센터 OA-20965 API 명세, 다함께돌봄센터 서울 데이터
- Firebase 프로젝트(dev/prod) 생성, `.firebaserc` 실제 ID, Workload Identity 연결, reCAPTCHA Enterprise 키
- Stream Firestore to BigQuery 확장 설치 후 설정 내보내기 (`docs/bigquery.md`)
- SMS 인증 사업자 (`lib/server/phone.ts`), 알림톡 대행사 (`lib/server/notify.ts`)
- 안내 문서 검수 (`reviewed: false` → AI 가 '검수 전이라 최신 기준과 다를 수 있어요'라고 밝힘) 와 구별 문서 작성, 기준이 바뀌면 `as_of` 갱신
- 이용약관·개인정보 처리방침 법률 검토, 운영 주체·보호책임자 기재
- CSP 를 dev 미리보기에서 카카오맵·로그인·App Check 로 실제 확인 (막히는 도메인이 있으면 `firebase.json` 에 추가)

## 데이터 한계

- 빈자리는 **정원 − 현원 추정치**이며 연령별 정원은 없다. 상세 화면에 그대로 고지한다.
- 야간연장·휴일보육은 `CRSPEC` 에서 읽는다. 평일 07:30~19:30 밖 검색은 `야간연장형`·`휴일보육` 시설만 통과하고,
  종료 시각을 모르면 "확인 필요"로 표시한다. 시설별 운영시간은 `data/hours-overrides.json` 으로 덮어쓸 수 있다:
  `{ "<STCODE>": { "night": true, "closeTime": "22:00", "weekend": true } }`
- 유치원·센터는 카카오맵에 **등록된 곳만** 나오며 카카오 약관상 저장하지 않고 화면 영역 기준 실시간 조회만 한다.
- 데이터셋 이용 조건(공공누리 유형)은 상용 전환 전에 확인한다.
