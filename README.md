찐리뷰는 매장 리뷰를 AI로 분석해 광고 의심 비율과 리뷰 신뢰 점수를 계산하는 Next.js 앱입니다.

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
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=... # 카카오맵 JavaScript 키
KAKAO_REST_API_KEY=... # 카카오 로컬 REST API 키(장소 자동수집)

# AdSense 설정 (선택)
NEXT_PUBLIC_ADSENSE_CLIENT=... # 예: ca-pub-1234567890123456
NEXT_PUBLIC_ADSENSE_SLOT=...   # 예: 1234567890
NEXT_PUBLIC_ADSENSE_FORMAT=auto # 기본값: auto
```

**AdSense 환경 변수 설명:**
- `NEXT_PUBLIC_ADSENSE_CLIENT`: AdSense 클라이언트 ID (ca-pub-으로 시작)
- `NEXT_PUBLIC_ADSENSE_SLOT`: AdSense 광고 슬롯 ID
- `NEXT_PUBLIC_ADSENSE_FORMAT`: 광고 형식 (기본값: auto)
- 슬롯/포맷 값이 없으면 플레이스홀더만 표시되고, 값이 있으면 실제 광고가 표시됩니다.

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
