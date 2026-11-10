# BigQuery 에서 통계 이벤트와 Analytics 함께 보기

## 연결 (프로젝트별 1회, 콘솔)

1. **Analytics → BigQuery**: Firebase 콘솔 > 프로젝트 설정 > 통합 > BigQuery > Google Analytics 연결 (일별 내보내기).
   데이터셋 `analytics_<속성ID>` 가 생긴다.
2. **Firestore `demand_events` → BigQuery**: Firebase 콘솔 > Extensions > *Stream Firestore to BigQuery* 설치
   - 컬렉션 경로 `demand_events`, 데이터셋 `careos_events`, 테이블 `demand_events`, 위치 `asia-northeast3`
   - 설치 후 `firebase ext:export --project <프로젝트>` 로 설정을 저장소(`extensions/`)에 내보내 두면 이후 배포에 포함된다.
   - TODO: 확장 버전·매개변수는 설치 화면 기준으로 내보낸 파일을 커밋한다 (명세를 추측해 미리 쓰지 않았다).
   - 이벤트 문서에는 uid·이름·연락처·좌표가 없다(테스트로 확인). 가명 키 `pkey` 만 있다.

## 예시 쿼리

행정동·시간대별 '결과 없음' (같은 사람이 24시간 안에 반복한 것은 이미 한 건으로 묶여 있다):

```sql
SELECT
  JSON_VALUE(data, '$.emd_code') AS emd_code,
  slot,
  COUNT(*) AS no_result,
  COUNT(DISTINCT JSON_VALUE(data, '$.pkey')) AS people
FROM `careos_events.demand_events_raw_latest`,
  UNNEST(JSON_VALUE_ARRAY(data, '$.time_slot')) AS slot
WHERE JSON_VALUE(data, '$.event_type') = 'search_no_result'
  AND operation != 'DELETE'
GROUP BY 1, 2
ORDER BY no_result DESC;
```

신청 도우미 단계별 이탈:

```sql
SELECT
  CAST(JSON_VALUE(data, '$.meta.step') AS INT64) AS step,
  JSON_VALUE(data, '$.meta.reason') AS reason,
  COUNT(*) AS exits
FROM `careos_events.demand_events_raw_latest`
WHERE JSON_VALUE(data, '$.event_type') = 'apply_exit'
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

Analytics 화면 조회와 같은 날짜로 묶기 (Analytics 에는 사용자 속성을 넣지 않으므로 날짜·화면 단위로만 비교한다):

```sql
WITH views AS (
  SELECT PARSE_DATE('%Y%m%d', event_date) AS d, COUNT(*) AS map_views
  FROM `analytics_XXXX.events_*`
  WHERE event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%/'
  GROUP BY 1
), misses AS (
  SELECT DATE(TIMESTAMP(JSON_VALUE(data, '$.created_at')), 'Asia/Seoul') AS d, COUNT(*) AS no_result
  FROM `careos_events.demand_events_raw_latest`
  WHERE JSON_VALUE(data, '$.event_type') = 'search_no_result'
  GROUP BY 1
)
SELECT d, map_views, no_result, SAFE_DIVIDE(no_result, map_views) AS miss_rate
FROM views LEFT JOIN misses USING (d)
ORDER BY d DESC;
```

> `demand_events_raw_latest` 는 확장이 만드는 뷰 이름이다. 설치 시 테이블 이름을 바꾸면 그에 맞춘다.
