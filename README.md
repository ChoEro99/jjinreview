리뷰랩은 매장 리뷰를 AI로 분석해 광고 의심 비율과 리뷰 신뢰 점수를 계산하는 Next.js 앱입니다.

## 핵심 기능

- 매장 목록 + 매장 상세
- 앱 리뷰 작성
- 리뷰별 AI 판정 저장(`review_analyses`)
- 매장 집계 캐시(`store_metrics`)
- 증분 배치 분석 크론 API

## 1) 환경 변수

`.env.local`에 아래 값을 넣어주세요.

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
OPENAI_API_KEY=... # 선택, 없으면 휴리스틱 엔진 사용
OPENAI_REVIEW_MODEL=gpt-5-mini # 선택
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

## 2) Supabase 스키마 적용

`supabase/schema.sql`을 SQL Editor에서 실행하세요.

## 3) 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## API

- `GET /api/stores`
- `GET /api/stores/:id`
- `POST /api/stores/:id/reviews`

요청 바디 예시:

```json
{
  "rating": 5,
  "content": "직원분이 친절했고 음식도 깔끔했어요.",
  "authorName": "홍길동",
  "isDisclosedAd": false
}
```

### 일배치(증분) 분석

- `POST /api/cron/analyze-reviews`
- 인증: `x-cron-secret` 또는 `Authorization: Bearer <CRON_SECRET>`
- 쿼리 파라미터 지원: `?limit=200&force=false`

요청 바디 예시:

```json
{
  "limit": 100,
  "force": false
}
```

## Vercel Cron 설정

- 루트 `vercel.json`에 하루 1회 스케줄이 추가되어 있습니다.
- 현재 설정: 매일 `03:10 UTC` 실행, 경로 `/api/cron/analyze-reviews?limit=200`
- Vercel 프로젝트 환경 변수에 `CRON_SECRET`을 반드시 설정하세요.
