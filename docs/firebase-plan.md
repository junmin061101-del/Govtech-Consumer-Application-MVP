# Vercel → Firebase 이전 계획

작성·승인 2026-11-03 (정적 Hosting + Functions, 프로젝트 생성 전 에뮬레이터로 먼저).

## 진행 상황

| 항목 | 상태 |
| --- | --- |
| Firestore 저장소 구현 · geohash 영역 조회 | 완료 — 저장소 계약 테스트로 메모리·Firestore 결과 일치 확인 |
| Firebase Auth 전환 (onboarded 클레임, 가입 가드) | 완료 — 2026-11-03 카카오 로그인을 빼고 이메일·비밀번호로 변경 |
| API → Functions `api` (asia-northeast3), Hosting 리라이트, 정적 내보내기 | 완료 — Functions 에뮬레이터 풀스택 E2E 통과 |
| 스케줄 `dailySync`, Auth 삭제 트리거 `onUserDeleted` | 완료 (에뮬레이터 로드 확인, 실제 스케줄 실행은 배포 후) |
| Firestore 규칙(기본 거부)·색인·TTL | 완료 — 규칙 테스트 통과 |
| App Check · 요청 제한 · 보안 헤더 | 완료 (App Check 실제 검증·CSP 는 dev 배포 후 확인) |
| Remote Config 플래그 · Analytics | 완료 (실제 값 확인은 배포 후) |
| BigQuery 내보내기 | 문서화 — 확장은 콘솔 설치 후 설정 내보내기 (`docs/bigquery.md`) |
| GitHub Actions (CI · PR 미리보기 · main 배포) | 작성 — 프로젝트·WIF 준비 후 동작 |
| dev/prod 프로젝트 생성, 배포, 카카오 도메인 등록, Vercel 종료 | **대기 (사용자)** |

## 1. 호스팅: Firebase Hosting(정적) + Cloud Functions 2세대(asia-northeast3)

| 판단 근거 | 내용 |
| --- | --- |
| SSR 필요 여부 | **필요 없다.** 모든 화면이 클라이언트 컴포넌트이고, 약관·처리방침도 정적이다. 서버가 필요한 것은 API 와 스케줄 작업뿐이다. |
| App Hosting | Next.js 를 그대로 올릴 수 있지만 **서울(asia-northeast3) 리전 지원을 확인하지 못했다.** 요구사항(Functions 서울 리전, Hosting 리라이트)과도 다르다. |
| 선택 | `next build` 정적 내보내기(`output: "export"`) → Hosting. `/api/**` 는 Hosting 리라이트로 Functions `api` (asia-northeast3) 에 연결. |
| 바뀌는 것 | `proxy.ts`(가입 필수 리디렉션)는 정적 내보내기에서 못 쓰므로 클라이언트 가드로 옮긴다. API 는 지금처럼 요청마다 권한을 확인하므로 보안 수준은 같다. |
| 보안 헤더 | `firebase.json` headers: CSP(카카오맵·Firebase·reCAPTCHA 도메인만 허용), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy(geolocation=self). |

## 2. 서버 코드 이전

- 지금의 `app/api/**/route.ts` 는 표준 `Request → Response` 함수다. Functions 에는 **얇은 어댑터 하나**(`functions/src/api.ts`)를 두고
  같은 핸들러를 경로로 찾아 부른다. 서버 로직(`lib/server/**`)은 그대로 쓰고 esbuild 로 함께 묶는다. 코드 중복 없음.
- 저장소: `lib/server/store.ts` 에 **Firestore 구현**을 더하고(`DATA_DIR` 대신 `STORE=firestore`), 컬렉션 구조는 지금과 같다.
  파일 저장소는 로컬·테스트용으로만 남긴다.
- 화면 영역 조회: `facilities` 의 `geohash` 범위 쿼리(+ 좌표 재필터).

### Functions 목록 (모두 asia-northeast3)

| 함수 | 종류 | 내용 |
| --- | --- | --- |
| `api` | HTTPS (Hosting `/api/**`) | 지금의 API 전체. App Check 검증, uid·IP 요청 제한, 최대 인스턴스 제한 |
| `kakaoAuth` | `api` 내부 경로 | 카카오 로그인 → Firebase 커스텀 토큰 (지금 흐름 유지) |
| `dailySync` | 스케줄 (매일 05:00 KST) | 시설 수집 → 정원·현원 변화 → 빈자리 알림 매칭·만료 안내·후속 질문 |
| `onUserDeleted` | Auth 트리거 | Auth 계정이 지워지면 탈퇴 정리 (`withdraw`) — 콘솔에서 지운 경우 대비 |
| `logDemandEvent` | `api` 내부 (`POST /api/events`) | 이벤트 쓰기 유일 경로 (지금과 같음) |

## 3. 인증: 세션 쿠키 → Firebase Auth

- 카카오 로그인: 지금처럼 서버가 카카오 사용자를 확인하고 **커스텀 토큰**을 발급 → 브라우저가 `signInWithCustomToken`.
  uid 는 그대로 `kakao:{회원번호}` 라 기존 리뷰 데이터와 이어진다.
- 앱 요청은 `Authorization: Bearer <ID 토큰>` 으로 보내고, `api` 가 Admin SDK 로 검증한다. 가입 완료 여부는 커스텀 클레임 `onboarded`.
- 세션 쿠키·`SESSION_SECRET` 은 없어진다. 익명 닉네임 생성용 비밀값은 `NICKNAME_SECRET` 으로 남긴다.
- 휴대폰 인증: **보류 중(발송 사업자 결정)**. Firebase Phone Auth 로 하면 사업자 계약 없이 해결되는 선택지가 있다 — 결정 시 반영.
- 개발용 로그인: Auth 에뮬레이터에서만 동작.

## 4. Firestore (asia-northeast3)

컬렉션은 지금 구조 그대로다(README '저장소 컬렉션'). 규칙은 **기본 거부**, 클라이언트 직접 접근은 아래만 허용한다.

```
match /databases/{db}/documents {
  match /{document=**} { allow read, write: if false; }        // 기본 거부

  match /users/{uid} {                                          // 본인만 읽기 (쓰기는 api 경유 — 검증 때문)
    allow read: if request.auth != null && request.auth.uid == uid;
  }
  match /reviews/{reviewId} { ...지금 규칙 그대로... }            // 리뷰는 기존처럼 클라이언트 직접
  // user_contacts, pkey_salts, demand_events, facilities, vacancy_alerts, alert_deliveries,
  // notifications, apply_summaries, community_posts, phone_verifications: 클라이언트 접근 없음 (Admin SDK 만)
}
```

색인: `facilities(geohash)`, `vacancy_alerts(uid, status)`, `vacancy_alerts(status, expires_at)`, `notifications(uid, created_at desc)`,
`community_posts(emd_code, status, created_at desc)`, `community_posts(status, created_at)`, `demand_event_dedup` 는 문서 ID 조회만.

## 5. 비밀값·공개값

| 공개 (빌드에 포함) | 비밀 (Secret Manager → Functions `defineSecret`) |
| --- | --- |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` |
| `NEXT_PUBLIC_FIREBASE_*` (웹 설정) | `PKEY_SECRET`, `NICKNAME_SECRET` |
| `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY` (App Check 사이트 키) | `SEOUL_OPEN_API_KEY`, `DATA_GO_KR_SERVICE_KEY` |
| | `ANTHROPIC_API_KEY`, (보류) 알림톡 키 |

`FIREBASE_SERVICE_ACCOUNT`·`CRON_SECRET` 은 필요 없어진다(Functions 기본 서비스 계정, 스케줄 함수).
빌드 후 번들에 비밀값이 없는지 확인하는 검사를 CI 에 넣는다.

## 6. 보안

- **App Check**(reCAPTCHA Enterprise): 웹 앱 등록, `api` 에서 `X-Firebase-AppCheck` 검증(에뮬레이터·dev 는 디버그 토큰). Firestore·Auth 도 App Check 적용.
- **요청 제한**: `api` `maxInstances`·`concurrency` 상한 + uid/IP 기준 제한을 Firestore 카운터 문서로(인스턴스 간 공유). 지금의 메모리 제한은 대체.
- **Firestore 기본 거부** (위 규칙), 규칙 단위 테스트(`@firebase/rules-unit-testing`)로 확인.

## 7. 분석

- **Google Analytics for Firebase**: 광고 신호·Google 신호 끔, 사용자 속성에 개인정보 없음(연령대·관심 구 수준도 넣지 않음). 화면 조회만.
- **BigQuery 내보내기**: Analytics → BigQuery 연결(콘솔), `demand_events` 는 확장 프로그램 *Stream Firestore to BigQuery* 로 같은 데이터셋에.
  두 데이터를 이벤트 시간·행정동 기준으로 함께 조회하는 예시 쿼리를 `docs/` 에 둔다.

## 8. 기능 플래그 → Remote Config

`matching`, `vacancy`, `apply`, `community` 를 Remote Config 매개변수로. 클라이언트는 Remote Config 로 메뉴를 숨기고,
`api` 는 서버 템플릿(Admin SDK `getServerTemplate`)으로 같은 값을 읽어 꺼진 기능에 404 를 준다. 지금의 `FEATURE_FLAGS` 는 에뮬레이터 대체값.

## 9. 환경·배포

- 프로젝트 2개: `careos-dev`, `careos-prod` (`.firebaserc` 별칭 `dev`/`prod`). Blaze 요금제 필요(Functions·Secret Manager·스케줄러).
- GitHub Actions
  - PR: 테스트·타입체크·규칙 테스트 → dev 프로젝트 Hosting **미리보기 채널** 배포, PR 에 링크 댓글
  - main: 같은 검사 → prod 배포 (Hosting + Functions + 규칙·색인)
  - 인증: Workload Identity Federation (서비스 계정 키 파일을 저장소에 두지 않음)
- 로컬: `firebase emulators:start` (Auth·Firestore·Functions·Hosting) + `npm run dev`.

## 10. 전환 절차

1. dev 에서 기존 기능(지도·필터·리뷰·로그인) 동작 비교 확인
2. prod 배포 → 카카오 개발자 콘솔에 새 도메인 등록(사이트 도메인·Redirect URI) — README 에 명시
3. 데이터: 지금 파일 저장소에는 운영 데이터가 없으므로 이전할 것 없음 (리뷰는 이미 Firestore)
4. Vercel 은 1~2주 병행 후 새 도메인으로 리디렉션하고 내린다

## 11. 필요한 것 (사용자 쪽)

- Firebase 프로젝트 2개 생성(또는 ID 결정)과 Blaze 요금제 — 생성 권한이 이 환경에 없다
- GitHub Actions 용 Workload Identity 연결(명령은 README 에 적어 둠) 또는 배포용 서비스 계정
- reCAPTCHA Enterprise 사이트 키 (App Check)
- 카카오 콘솔 도메인 등록 (prod 도메인 확정 후)

에뮬레이터로 위 1~9 를 프로젝트 없이 먼저 구현·테스트할 수 있고, 프로젝트가 준비되면 dev 배포로 확인한다.
