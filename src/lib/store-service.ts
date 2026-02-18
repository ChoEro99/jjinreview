import { analyzeReviewWithProvider } from "@/src/lib/ai-provider";
import {
  adAnyProbabilityFromAnalysis,
  heuristicAnalyzeReview,
  type ReviewSource,
} from "@/src/lib/review-engine";
import { supabaseServer } from "@/src/lib/supabaseServer";
import { computeRatingTrustScore } from "@/src/lib/rating-trust-score";

export type StoreBase = {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  kakaoPlaceId: string | null;
  externalRating: number | null;
  externalReviewCount: number | null;
};

export type ReviewAnalysisRecord = {
  id: number;
  reviewId: number;
  storeId: number;
  provider: string;
  model: string;
  version: string;
  adRisk: number;
  undisclosedAdRisk: number;
  lowQualityRisk: number;
  trustScore: number;
  confidence: number;
  signals: string[];
  reasonSummary: string;
  createdAt: string;
};

export type ReviewRecord = {
  id: number;
  storeId: number;
  source: ReviewSource;
  rating: number;
  content: string;
  authorName: string | null;
  isDisclosedAd: boolean;
  createdAt: string;
  latestAnalysis: ReviewAnalysisRecord | null;
  authorStats?: {
    reviewCount: number;
    averageRating: number;
  } | null;
};

export type StoreSummary = {
  weightedRating: number | null;
  appAverageRating: number | null;
  adSuspectRatio: number;
  trustScore: number;
  positiveRatio: number;
  reviewCount: number;
  inappReviewCount: number;
  externalReviewCount: number;
  lastAnalyzedAt: string | null;
  latestExternalReviewAt: string | null;
};

export type StoreWithSummary = StoreBase & {
  summary: StoreSummary;
};

function normalizeNameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\-_/.,]/g, "");
}

function normalizeAddressKey(address: string | null | undefined) {
  return (address ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\-_/.,]/g, "");
}

function normalizeQueryText(input: string) {
  return input.toLowerCase().replace(/\s+/g, "").replace(/[()\-_/.,]/g, "");
}

function queryTokens(input: string) {
  return input
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2);
}

function queryRelevanceScore(query: string, name: string | null, address: string | null) {
  const q = normalizeQueryText(query);
  const n = normalizeQueryText(name ?? "");
  const a = normalizeQueryText(address ?? "");
  if (!q) return 0;

  let score = 0;
  if (n === q) score += 100;
  else if (n.startsWith(q)) score += 80;
  else if (n.includes(q)) score += 60;
  else if (a.includes(q)) score += 35;

  const tokens = queryTokens(query);
  if (tokens.length) {
    let nameHit = 0;
    let addrHit = 0;
    for (const token of tokens) {
      const t = normalizeQueryText(token);
      if (n.includes(t)) nameHit += 1;
      else if (a.includes(t)) addrHit += 1;
    }
    score += nameHit * 20 + addrHit * 8;
  }

  return score;
}

type StoreCategory = "restaurant" | "cafe";

function inferStoreCategoryByName(name: string): StoreCategory {
  const text = name.toLowerCase();
  const cafeKeywords = [
    "카페",
    "커피",
    "coffee",
    "caffe",
    "cafe",
    "스타벅스",
    "투썸",
    "메가커피",
    "빽다방",
    "컴포즈",
    "더벤티",
    "이디야",
    "할리스",
    "폴바셋",
    "엔제리너스",
    "탐앤탐스",
    "베이커리",
    "디저트",
    "브런치",
    "티하우스",
    "찻집",
  ];
  const restaurantKeywords = [
    "식당",
    "음식점",
    "레스토랑",
    "한식",
    "중식",
    "일식",
    "양식",
    "분식",
    "국밥",
    "찌개",
    "탕",
    "치킨",
    "피자",
    "버거",
    "햄버거",
    "라멘",
    "우동",
    "국수",
    "초밥",
    "스시",
    "돈까스",
    "고기",
    "삼겹",
    "족발",
    "보쌈",
    "횟집",
    "포차",
    "주점",
  ];
  const cafeScore = cafeKeywords.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
  const restaurantScore = restaurantKeywords.reduce(
    (acc, word) => acc + (text.includes(word) ? 1 : 0),
    0
  );
  if (cafeScore > restaurantScore) return "cafe";
  return "restaurant";
}

function inferQueryCategory(keyword: string): StoreCategory | null {
  const text = keyword.toLowerCase();
  if (["카페", "coffee", "디저트", "베이커리"].some((word) => text.includes(word))) {
    return "cafe";
  }
  if (["식당", "맛집", "음식점", "레스토랑"].some((word) => text.includes(word))) {
    return "restaurant";
  }
  return null;
}

function isSearchableStoreName(name: string) {
  const text = name.toLowerCase();
  const excluded = [
    "구내식당",
    "사내식당",
    "다모임",
    "편의점",
    "마트",
    "약국",
    "병원",
    "의원",
    "학원",
    "미용실",
    "주유소",
    "호텔",
    "모텔",
    "펜션",
    "세탁",
    "은행",
  ];
  return !excluded.some((word) => text.includes(word));
}

async function findNormalizedDuplicateStore(input: {
  name: string;
  address: string | null;
}) {
  const sb = supabaseServer();
  const nameKey = normalizeNameKey(input.name);
  const addressKey = normalizeAddressKey(input.address);
  if (!nameKey || !addressKey) return null;

  const full = await sb
    .from("stores")
    .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
    .ilike("name", `%${input.name}%`)
    .limit(30);
  let rowsRaw: Record<string, unknown>[] = [];
  if (!full.error) {
    rowsRaw = (full.data ?? []) as Record<string, unknown>[];
  } else if (isMissingColumnError(full.error)) {
    const minimal = await sb
      .from("stores")
      .select("id, name, address, latitude, longitude, external_rating, external_review_count")
      .ilike("name", `%${input.name}%`)
      .limit(30);
    if (minimal.error) return null;
    rowsRaw = (minimal.data ?? []) as Record<string, unknown>[];
  } else {
    return null;
  }

  const rows = rowsRaw.map((row) => normalizeStoreRow(row));
  const found = rows.find(
    (row) =>
      normalizeNameKey(row.name) === nameKey &&
      normalizeAddressKey(row.address) === addressKey
  );
  return found ?? null;
}

export type CreateStoreInput = {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  kakaoPlaceId?: string | null;
  externalRating?: number | null;
  externalReviewCount?: number | null;
};

type StoreMetricRow = {
  store_id: number;
  weighted_rating: number | null;
  ad_suspect_ratio: number;
  trust_score: number;
  positive_ratio: number;
  review_count: number;
  inapp_review_count: number;
  external_review_count: number;
  last_analyzed_at: string | null;
};

const REVIEW_TABLE_CANDIDATES = ["reviews", "store_reviews"];

/**
 * Check if an address is in Korea by looking for Korean city/province names or keywords
 */
function isKoreanAddress(address: string | null): boolean {
  if (!address) return false;
  
  const addressLower = address.toLowerCase();
  
  // Korean keywords
  const koreanKeywords = ["대한민국", "south korea", "korea", "한국"];
  if (koreanKeywords.some(keyword => addressLower.includes(keyword))) {
    return true;
  }
  
  // Korean cities and provinces (both in Korean and romanized forms)
  const koreanCities = [
    "서울", "seoul",
    "부산", "busan",
    "대구", "daegu",
    "인천", "incheon",
    "광주", "gwangju",
    "대전", "daejeon",
    "울산", "ulsan",
    "세종", "sejong",
    "경기", "gyeonggi",
    "강원", "gangwon",
    "충북", "chungbuk", "chungcheongbuk",
    "충남", "chungnam", "chungcheongnam",
    "전북", "jeonbuk", "jeollabuk",
    "전남", "jeonnam", "jeollanam",
    "경북", "gyeongbuk", "gyeongsangbuk",
    "경남", "gyeongnam", "gyeongsangnam",
    "제주", "jeju"
  ];
  
  return koreanCities.some(city => addressLower.includes(city));
}

function isMissingColumnError(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /schema cache/i.test(error?.message ?? "")
  );
}

function toNumber(value: unknown, fallback: number | null = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function normalizeReviewRow(row: Record<string, unknown>): Omit<ReviewRecord, "latestAnalysis"> {
  return {
    id: toNumber(row.id, 0) ?? 0,
    storeId: toNumber(row.store_id, 0) ?? 0,
    source: row.source === "external" ? "external" : "inapp",
    rating: Math.max(1, Math.min(5, toNumber(row.rating, 3) ?? 3)),
    content: typeof row.content === "string" ? row.content : "",
    authorName:
      typeof row.author_name === "string"
        ? row.author_name
        : typeof row.user_name === "string"
          ? row.user_name
          : null,
    isDisclosedAd: toBoolean(row.is_disclosed_ad ?? row.is_disclosed_marketing, false),
    createdAt:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function normalizeAuthorKey(name: string | null | undefined) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length ? normalized : null;
}

function normalizeUserReviewRow(row: Record<string, unknown>): Omit<ReviewRecord, "latestAnalysis"> {
  const optionText = [
    typeof row.food === "string" ? `음식:${row.food}` : null,
    typeof row.price === "string" ? `가격:${row.price}` : null,
    typeof row.service === "string" ? `서비스:${row.service}` : null,
    typeof row.space === "string" ? `공간:${row.space}` : null,
    typeof row.wait_time === "string" ? `대기:${row.wait_time}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  const content = comment || optionText || "사용자가 남긴 리뷰입니다.";

  return {
    // Use negative id namespace for user_reviews to avoid collision with reviews.id.
    id: -(toNumber(row.id, 0) ?? 0),
    storeId: toNumber(row.store_id, 0) ?? 0,
    source: "inapp",
    rating: Math.max(0.5, Math.min(5, toNumber(row.rating, 3) ?? 3)),
    content,
    authorName: typeof row.user_name === "string" ? row.user_name : "내 리뷰",
    isDisclosedAd: false,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function normalizeStoreRow(row: Record<string, unknown>): StoreBase {
  return {
    id: toNumber(row.id, 0) ?? 0,
    name: typeof row.name === "string" ? row.name : "이름없음",
    address: typeof row.address === "string" ? row.address : null,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    kakaoPlaceId: typeof row.kakao_place_id === "string" ? row.kakao_place_id : null,
    externalRating: toNumber(row.external_rating),
    externalReviewCount: toNumber(row.external_review_count),
  };
}

function normalizeAnalysisRow(row: Record<string, unknown>): ReviewAnalysisRecord {
  return {
    id: toNumber(row.id, 0) ?? 0,
    reviewId: toNumber(row.review_id, 0) ?? 0,
    storeId: toNumber(row.store_id, 0) ?? 0,
    provider: typeof row.model_provider === "string" ? row.model_provider : "heuristic",
    model: typeof row.model_name === "string" ? row.model_name : "rule-based-v1",
    version: typeof row.analysis_version === "string" ? row.analysis_version : "v1",
    adRisk: toNumber(row.ad_risk, 0) ?? 0,
    undisclosedAdRisk: toNumber(row.undisclosed_ad_risk, 0) ?? 0,
    lowQualityRisk: toNumber(row.low_quality_risk, 0) ?? 0,
    trustScore: toNumber(row.trust_score, 0.5) ?? 0.5,
    confidence: toNumber(row.confidence, 0.5) ?? 0.5,
    signals: Array.isArray(row.signals)
      ? row.signals.filter((v): v is string => typeof v === "string")
      : [],
    reasonSummary:
      typeof row.reason_summary === "string"
        ? row.reason_summary
        : "AI 분석 결과 요약이 없습니다.",
    createdAt:
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function metricRowToSummary(metric: StoreMetricRow): StoreSummary {
  return {
    weightedRating: metric.weighted_rating,
    appAverageRating: null,
    adSuspectRatio: metric.ad_suspect_ratio,
    trustScore: metric.trust_score,
    positiveRatio: metric.positive_ratio,
    reviewCount: metric.review_count,
    inappReviewCount: metric.inapp_review_count,
    externalReviewCount: metric.external_review_count,
    lastAnalyzedAt: metric.last_analyzed_at,
    latestExternalReviewAt: null,
  };
}

function summarizeReviews(
  reviews: ReviewRecord[],
  fallbackExternalRating: number | null,
  fallbackExternalReviewCount?: number | null
): StoreSummary {
  const inappReviewCount = reviews.filter((review) => review.source === "inapp").length;
  const externalReviewCount = reviews.filter((review) => review.source === "external").length;
  const inappRatings = reviews.filter((review) => review.source === "inapp").map((review) => review.rating);

  let ratingWeightSum = 0;
  let weightedRatingSum = 0;
  let adAnySum = 0;
  let trustSum = 0;
  let positiveWeightSum = 0;
  let reviewCount = 0;
  let lastAnalyzedAt: string | null = null;

  for (const review of reviews) {
    const analysis =
      review.latestAnalysis ??
      ({
        ...heuristicAnalyzeReview({
          rating: review.rating,
          content: review.content,
          isDisclosedAd: review.isDisclosedAd,
        }),
        createdAt: null,
      } as const);

    const adAny = adAnyProbabilityFromAnalysis({
      adRisk: analysis.adRisk,
      undisclosedAdRisk: analysis.undisclosedAdRisk,
    });

    const trust = analysis.trustScore;
    const ratingWeight = Math.max(0.1, trust * (1 - adAny * 0.8));

    weightedRatingSum += review.rating * ratingWeight;
    ratingWeightSum += ratingWeight;
    adAnySum += adAny;
    trustSum += trust;
    reviewCount += 1;

    if (review.rating >= 4) {
      positiveWeightSum += ratingWeight;
    }

    if (review.latestAnalysis?.createdAt) {
      if (!lastAnalyzedAt || review.latestAnalysis.createdAt > lastAnalyzedAt) {
        lastAnalyzedAt = review.latestAnalysis.createdAt;
      }
    }
  }

  let weightedRating = ratingWeightSum > 0 ? round2(weightedRatingSum / ratingWeightSum) : null;

  if (weightedRating === null && fallbackExternalRating !== null) {
    weightedRating = round2(fallbackExternalRating);
  }

  const adSuspectRatio = reviewCount > 0 ? round4(adAnySum / reviewCount) : 0;
  const trustScore = reviewCount > 0 ? round4(trustSum / reviewCount) : 0.5;
  const positiveRatio = ratingWeightSum > 0 ? round4(positiveWeightSum / ratingWeightSum) : 0;
  const appAverageRating =
    inappRatings.length > 0
      ? round2(inappRatings.reduce((sum, rating) => sum + rating, 0) / inappRatings.length)
      : null;

  // Use fallback external review count when actual external reviews are not available
  const effectiveExternalReviewCount = Math.max(
    externalReviewCount,
    fallbackExternalReviewCount ?? 0
  );

  return {
    weightedRating,
    appAverageRating,
    adSuspectRatio,
    trustScore,
    positiveRatio,
    reviewCount,
    inappReviewCount,
    externalReviewCount: effectiveExternalReviewCount,
    lastAnalyzedAt,
    latestExternalReviewAt: null,
  };
}

function extractLatestExternalReviewAtFromCachePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const reviews = (payload as { reviews?: unknown }).reviews;
  if (!Array.isArray(reviews)) return null;

  let latestTs = 0;
  for (const row of reviews) {
    if (!row || typeof row !== "object") continue;
    const publishedAt = (row as { publishedAt?: unknown }).publishedAt;
    if (typeof publishedAt !== "string") continue;
    const ts = Date.parse(publishedAt);
    if (!Number.isFinite(ts)) continue;
    if (ts > latestTs) latestTs = ts;
  }
  if (latestTs <= 0) return null;
  return new Date(latestTs).toISOString();
}

async function loadLatestExternalReviewAtByStoreIds(storeIds: number[]) {
  if (!storeIds.length) return new Map<number, string | null>();

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("google_review_cache")
    .select("store_id,payload")
    .in("store_id", storeIds);

  if (error) {
    if (isMissingTableError(error)) return new Map<number, string | null>();
    throw new Error(error.message);
  }

  const map = new Map<number, string | null>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const storeId = toNumber(row.store_id, 0) ?? 0;
    if (storeId <= 0) continue;
    map.set(storeId, extractLatestExternalReviewAtFromCachePayload(row.payload));
  }
  return map;
}

async function loadReviewsByStoreIds(storeIds: number[]) {
  if (!storeIds.length) return [] as Omit<ReviewRecord, "latestAnalysis">[];

  const sb = supabaseServer();
  const merged: Omit<ReviewRecord, "latestAnalysis">[] = [];
  let tableMissingCount = 0;
  let lastError: Error | null = null;

  for (const tableName of REVIEW_TABLE_CANDIDATES) {
    const full = await sb
      .from(tableName)
      .select("id, store_id, source, rating, content, author_name, is_disclosed_ad, created_at")
      .in("store_id", storeIds)
      .order("created_at", { ascending: false });

    if (!full.error) {
      merged.push(
        ...(full.data ?? []).map((row) =>
          normalizeReviewRow(row as Record<string, unknown>)
        )
      );
      break;
    }

    // Some legacy schemas miss source/author/is_disclosed_ad columns.
    if (isMissingColumnError(full.error)) {
      const minimal = await sb
        .from(tableName)
        .select("id, store_id, rating, content, created_at")
        .in("store_id", storeIds)
        .order("created_at", { ascending: false });

      if (!minimal.error) {
        merged.push(
          ...(minimal.data ?? []).map((row) =>
            normalizeReviewRow(row as Record<string, unknown>)
          )
        );
        break;
      }

      if (isMissingTableError(minimal.error)) {
        tableMissingCount += 1;
        continue;
      }

      lastError = new Error(minimal.error.message);
      break;
    }

    if (isMissingTableError(full.error)) {
      tableMissingCount += 1;
      continue;
    }

    lastError = new Error(full.error.message);
    break;
  }

  if (tableMissingCount !== REVIEW_TABLE_CANDIDATES.length && !lastError) {
    const userReviews = await sb
      .from("user_reviews")
      .select("id, store_id, rating, food, price, service, space, wait_time, comment, created_at, users(name)")
      .in("store_id", storeIds)
      .order("created_at", { ascending: false });

    if (!userReviews.error) {
      const rows = (userReviews.data ?? []) as Array<Record<string, unknown>>;
      merged.push(
        ...rows.map((row) => {
          const users = row.users as { name?: unknown } | Array<{ name?: unknown }> | null | undefined;
          const userName =
            Array.isArray(users)
              ? (typeof users[0]?.name === "string" ? users[0].name : null)
              : (users && typeof users.name === "string" ? users.name : null);
          return normalizeUserReviewRow({
            ...row,
            user_name: userName,
          });
        })
      );
    } else if (!isMissingTableError(userReviews.error)) {
      // Keep base reviews even if user_reviews query fails for non-missing-table reasons.
      console.error("Failed to load user_reviews:", userReviews.error.message);
    }
  }

  if (tableMissingCount === REVIEW_TABLE_CANDIDATES.length && merged.length === 0) return [];
  if (lastError && merged.length === 0) throw lastError;
  return merged;
}

async function loadLatestAnalysesByReviewIds(reviewIds: number[]) {
  if (!reviewIds.length) return new Map<number, ReviewAnalysisRecord>();

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("review_analyses")
    .select("id, review_id, store_id, model_provider, model_name, analysis_version, ad_risk, undisclosed_ad_risk, low_quality_risk, trust_score, confidence, signals, reason_summary, created_at")
    .in("review_id", reviewIds)
    .order("created_at", { ascending: false });

  if (error) {
    // Table can be missing before schema migration.
    if (isMissingTableError(error)) return new Map<number, ReviewAnalysisRecord>();
    throw new Error(error.message);
  }

  const map = new Map<number, ReviewAnalysisRecord>();
  for (const row of data ?? []) {
    const normalized = normalizeAnalysisRow(row as Record<string, unknown>);
    if (!map.has(normalized.reviewId)) {
      map.set(normalized.reviewId, normalized);
    }
  }

  return map;
}

async function loadStoreMetricMap(storeIds: number[]) {
  if (!storeIds.length) return new Map<number, StoreMetricRow>();

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("store_metrics")
    .select("store_id, weighted_rating, ad_suspect_ratio, trust_score, positive_ratio, review_count, inapp_review_count, external_review_count, last_analyzed_at")
    .in("store_id", storeIds);

  if (error) {
    // Table can be missing in early setup; caller has fallback.
    return new Map<number, StoreMetricRow>();
  }

  return new Map(
    (data ?? []).map((row) => [
      toNumber((row as { store_id: unknown }).store_id, 0) ?? 0,
      {
        store_id: toNumber((row as { store_id: unknown }).store_id, 0) ?? 0,
        weighted_rating: toNumber((row as { weighted_rating: unknown }).weighted_rating),
        ad_suspect_ratio:
          toNumber((row as { ad_suspect_ratio: unknown }).ad_suspect_ratio, 0) ?? 0,
        trust_score: toNumber((row as { trust_score: unknown }).trust_score, 0.5) ?? 0.5,
        positive_ratio: toNumber((row as { positive_ratio: unknown }).positive_ratio, 0) ?? 0,
        review_count: toNumber((row as { review_count: unknown }).review_count, 0) ?? 0,
        inapp_review_count:
          toNumber((row as { inapp_review_count: unknown }).inapp_review_count, 0) ?? 0,
        external_review_count:
          toNumber((row as { external_review_count: unknown }).external_review_count, 0) ?? 0,
        last_analyzed_at:
          typeof (row as { last_analyzed_at: unknown }).last_analyzed_at === "string"
            ? ((row as { last_analyzed_at: string }).last_analyzed_at as string)
            : null,
      },
    ])
  );
}

async function enrichReviews(baseReviews: Omit<ReviewRecord, "latestAnalysis">[]) {
  const analysisMap = await loadLatestAnalysesByReviewIds(baseReviews.map((review) => review.id));
  return baseReviews.map((review) => ({
    ...review,
    latestAnalysis: analysisMap.get(review.id) ?? null,
  }));
}

async function loadAuthorStatsForReviews(reviews: ReviewRecord[]) {
  const authorNamesMap = new Map<string, string>();
  for (const review of reviews) {
    const key = normalizeAuthorKey(review.authorName);
    if (!key) continue;
    if (!authorNamesMap.has(key)) authorNamesMap.set(key, review.authorName ?? key);
  }

  if (!authorNamesMap.size) return new Map<string, { reviewCount: number; averageRating: number }>();

  const sb = supabaseServer();
  const authorNames = Array.from(authorNamesMap.values());
  const aggregate = new Map<string, { count: number; sum: number }>();

  const addStat = (authorName: string | null | undefined, ratingRaw: unknown) => {
    const key = normalizeAuthorKey(authorName);
    const rating = toNumber(ratingRaw);
    if (!key || rating === null) return;
    const prev = aggregate.get(key) ?? { count: 0, sum: 0 };
    prev.count += 1;
    prev.sum += rating;
    aggregate.set(key, prev);
  };

  for (const tableName of REVIEW_TABLE_CANDIDATES) {
    const tableRows = await sb
      .from(tableName)
      .select("author_name, rating")
      .in("author_name", authorNames);
    if (!tableRows.error) {
      for (const row of (tableRows.data ?? []) as Array<Record<string, unknown>>) {
        addStat(typeof row.author_name === "string" ? row.author_name : null, row.rating);
      }
      break;
    }
    if (!isMissingTableError(tableRows.error)) break;
  }

  const usersResponse = await sb.from("users").select("id, name").in("name", authorNames);
  if (!usersResponse.error) {
    const userRows = (usersResponse.data ?? []) as Array<Record<string, unknown>>;
    const userIdToName = new Map<string, string>();
    for (const row of userRows) {
      if (typeof row.id === "string" && typeof row.name === "string") {
        userIdToName.set(row.id, row.name);
      }
    }
    const userIds = Array.from(userIdToName.keys());
    if (userIds.length) {
      const userReviews = await sb.from("user_reviews").select("user_id, rating").in("user_id", userIds);
      if (!userReviews.error) {
        for (const row of (userReviews.data ?? []) as Array<Record<string, unknown>>) {
          const userId = typeof row.user_id === "string" ? row.user_id : null;
          const userName = userId ? userIdToName.get(userId) : null;
          addStat(userName ?? null, row.rating);
        }
      }
    }
  }

  return new Map(
    Array.from(aggregate.entries()).map(([key, value]) => [
      key,
      {
        reviewCount: value.count,
        averageRating: round2(value.sum / Math.max(1, value.count)),
      },
    ])
  );
}

async function loadRecentReviewsForBatch(limit: number) {
  const sb = supabaseServer();
  let tableMissingCount = 0;
  let lastError: Error | null = null;

  for (const tableName of REVIEW_TABLE_CANDIDATES) {
    const full = await sb
      .from(tableName)
      .select("id, store_id, source, rating, content, author_name, is_disclosed_ad, created_at")
      .order("id", { ascending: false })
      .limit(limit);

    if (!full.error) {
      return (full.data ?? []).map((row) =>
        normalizeReviewRow(row as Record<string, unknown>)
      );
    }

    if (isMissingColumnError(full.error)) {
      const minimal = await sb
        .from(tableName)
        .select("id, store_id, rating, content, created_at")
        .order("id", { ascending: false })
        .limit(limit);

      if (!minimal.error) {
        return (minimal.data ?? []).map((row) =>
          normalizeReviewRow(row as Record<string, unknown>)
        );
      }

      if (isMissingTableError(minimal.error)) {
        tableMissingCount += 1;
        continue;
      }

      lastError = new Error(minimal.error.message);
      break;
    }

    if (isMissingTableError(full.error)) {
      tableMissingCount += 1;
      continue;
    }

    lastError = new Error(full.error.message);
    break;
  }

  if (tableMissingCount === REVIEW_TABLE_CANDIDATES.length) return [];
  if (lastError) throw lastError;
  return [];
}

async function persistAnalysisForReview(review: Omit<ReviewRecord, "latestAnalysis">) {
  const sb = supabaseServer();
  const result = await analyzeReviewWithProvider({
    rating: review.rating,
    content: review.content,
    isDisclosedAd: review.isDisclosedAd,
  });

  const payload = {
    review_id: review.id,
    store_id: review.storeId,
    model_provider: result.meta.provider,
    model_name: result.meta.model,
    analysis_version: result.meta.version,
    ad_risk: result.analysis.adRisk,
    undisclosed_ad_risk: result.analysis.undisclosedAdRisk,
    low_quality_risk: result.analysis.lowQualityRisk,
    trust_score: result.analysis.trustScore,
    confidence: result.analysis.confidence,
    signals: result.analysis.signals,
    reason_summary: result.analysis.reasonSummary,
    created_at: new Date().toISOString(),
  };

  const { error } = await sb.from("review_analyses").insert(payload);
  if (error) throw new Error(error.message);
}

async function upsertStoreMetric(storeId: number, summary: StoreSummary) {
  const sb = supabaseServer();
  const payload = {
    store_id: storeId,
    weighted_rating: summary.weightedRating,
    ad_suspect_ratio: summary.adSuspectRatio,
    trust_score: summary.trustScore,
    positive_ratio: summary.positiveRatio,
    review_count: summary.reviewCount,
    inapp_review_count: summary.inappReviewCount,
    external_review_count: summary.externalReviewCount,
    last_analyzed_at: summary.lastAnalyzedAt,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from("store_metrics").upsert(payload, { onConflict: "store_id" });
  if (error) {
    if (isMissingTableError(error)) return;
    throw new Error(error.message);
  }
}

export async function recomputeStoreMetrics(storeId: number) {
  const sb = supabaseServer();
  const { data: store, error: storeError } = await sb
    .from("stores")
    .select("id, external_rating, external_review_count")
    .eq("id", storeId)
    .single();

  if (storeError) throw new Error(storeError.message);

  const baseReviews = await loadReviewsByStoreIds([storeId]);
  const reviews = await enrichReviews(baseReviews);

  const summary = summarizeReviews(
    reviews,
    toNumber((store as { external_rating: unknown }).external_rating),
    toNumber((store as { external_review_count: unknown }).external_review_count)
  );

  await upsertStoreMetric(storeId, summary);
  return summary;
}

export async function getStoresWithSummary() {
  const sb = supabaseServer();
  const full = await sb
    .from("stores")
    .select("id, name, address, latitude, longitude, external_rating, external_review_count")
    .order("id", { ascending: false })
    .limit(100);

  let storesData: Record<string, unknown>[] | null = (full.data ?? null) as
    | Record<string, unknown>[]
    | null;

  if (full.error) {
    if (!isMissingColumnError(full.error)) throw new Error(full.error.message);

    const minimal = await sb
      .from("stores")
      .select("id, name, address, external_rating, external_review_count")
      .order("id", { ascending: false })
      .limit(100);

    if (minimal.error) throw new Error(minimal.error.message);
    storesData = (minimal.data ?? null) as Record<string, unknown>[] | null;
  }

  const normalizedStores: StoreBase[] = (storesData ?? []).map((store) =>
    normalizeStoreRow(store)
  );
  const storeById = new Map(normalizedStores.map((store) => [store.id, store] as const));

  const metricMap = await loadStoreMetricMap(normalizedStores.map((store) => store.id));
  const appAverageMap = await loadAppAverageRatingByStoreIds(normalizedStores.map((store) => store.id));
  const latestExternalReviewAtMap = await loadLatestExternalReviewAtByStoreIds(
    normalizedStores.map((store) => store.id)
  );

  const missingStoreIds = normalizedStores
    .filter((store) => !metricMap.has(store.id))
    .map((store) => store.id);

  let computedSummaryMap = new Map<number, StoreSummary>();

  if (missingStoreIds.length) {
    const baseReviews = await loadReviewsByStoreIds(missingStoreIds);
    const reviews = await enrichReviews(baseReviews);
    const grouped = new Map<number, ReviewRecord[]>();

    for (const review of reviews) {
      const bucket = grouped.get(review.storeId);
      if (bucket) bucket.push(review);
      else grouped.set(review.storeId, [review]);
    }

    computedSummaryMap = new Map(
      missingStoreIds.map((storeId) => {
        const store = storeById.get(storeId);
        const summary = summarizeReviews(
          grouped.get(storeId) ?? [],
          store?.externalRating ?? null,
          store?.externalReviewCount ?? null
        );
        return [storeId, summary] as const;
      })
    );
  }

  return normalizedStores.map((store) => {
    const metric = metricMap.get(store.id);
    const baseSummary = metric
      ? metricRowToSummary(metric)
      : computedSummaryMap.get(store.id) ??
        summarizeReviews([], store.externalRating, store.externalReviewCount ?? null);
    const summary: StoreSummary = {
      ...baseSummary,
      appAverageRating: appAverageMap.get(store.id) ?? baseSummary.appAverageRating ?? null,
      latestExternalReviewAt:
        latestExternalReviewAtMap.get(store.id) ?? baseSummary.latestExternalReviewAt ?? null,
    };

    return {
      ...store,
      summary,
    };
  }) satisfies StoreWithSummary[];
}

async function enrichStoresWithSummary(stores: StoreBase[]) {
  if (!stores.length) return [] as StoreWithSummary[];

  const metricMap = await loadStoreMetricMap(stores.map((store) => store.id));
  const appAverageMap = await loadAppAverageRatingByStoreIds(stores.map((store) => store.id));
  const latestExternalReviewAtMap = await loadLatestExternalReviewAtByStoreIds(
    stores.map((store) => store.id)
  );
  const storeById = new Map(stores.map((store) => [store.id, store] as const));
  const missingStoreIds = stores
    .filter((store) => !metricMap.has(store.id))
    .map((store) => store.id);

  let computedSummaryMap = new Map<number, StoreSummary>();
  if (missingStoreIds.length) {
    const baseReviews = await loadReviewsByStoreIds(missingStoreIds);
    const reviews = await enrichReviews(baseReviews);
    const grouped = new Map<number, ReviewRecord[]>();
    for (const review of reviews) {
      const bucket = grouped.get(review.storeId);
      if (bucket) bucket.push(review);
      else grouped.set(review.storeId, [review]);
    }

    computedSummaryMap = new Map(
      missingStoreIds.map((storeId) => {
        const store = storeById.get(storeId);
        const summary = summarizeReviews(
          grouped.get(storeId) ?? [],
          store?.externalRating ?? null,
          store?.externalReviewCount ?? null
        );
        return [storeId, summary] as const;
      })
    );
  }

  return stores.map((store) => {
    const metric = metricMap.get(store.id);
    const computed =
      computedSummaryMap.get(store.id) ??
      summarizeReviews([], store.externalRating, store.externalReviewCount ?? null);
    const baseSummary = metric ? metricRowToSummary(metric) : computed;
    return {
      ...store,
      summary: {
        ...baseSummary,
        appAverageRating: appAverageMap.get(store.id) ?? baseSummary.appAverageRating ?? null,
        latestExternalReviewAt:
          latestExternalReviewAtMap.get(store.id) ?? baseSummary.latestExternalReviewAt ?? null,
      },
    };
  }) satisfies StoreWithSummary[];
}

async function findRegisteredStoresByKeyword(
  keyword: string,
  limit = 20,
  categoryFilter: StoreCategory | null = null
) {
  const sb = supabaseServer();
  const selectedFull =
    "id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count";
  const selectedNoKakao =
    "id, name, address, latitude, longitude, external_rating, external_review_count";
  const selectedMinimal = "id, name, address, external_rating, external_review_count";

  async function queryByAny(terms: string[], perQueryLimit: number) {
    const sanitized = Array.from(
      new Set(
        terms
          .map((term) => term.replace(/,/g, " ").trim())
          .filter((term) => term.length >= 2)
      )
    ).slice(0, 6);
    if (!sanitized.length) return [] as Record<string, unknown>[];

    const filters = sanitized
      .flatMap((term) => [`name.ilike.%${term}%`, `address.ilike.%${term}%`])
      .join(",");

    const full = await sb.from("stores").select(selectedFull).or(filters).limit(perQueryLimit);
    if (!full.error) return (full.data ?? []) as Record<string, unknown>[];
    if (!isMissingColumnError(full.error)) throw new Error(full.error.message);

    const noKakao = await sb
      .from("stores")
      .select(selectedNoKakao)
      .or(filters)
      .limit(perQueryLimit);
    if (!noKakao.error) return (noKakao.data ?? []) as Record<string, unknown>[];
    if (!isMissingColumnError(noKakao.error)) throw new Error(noKakao.error.message);

    const minimal = await sb
      .from("stores")
      .select(selectedMinimal)
      .or(filters)
      .limit(perQueryLimit);
    if (!minimal.error) return (minimal.data ?? []) as Record<string, unknown>[];
    throw new Error(minimal.error.message);
  }

  const tokens = queryTokens(keyword);
  const perQueryLimit = Math.max(20, Math.min(100, limit * 3));
  const queryTerms = [keyword, ...tokens.slice(0, 4)];
  const rows = await queryByAny(queryTerms, perQueryLimit);
  const dedup = new Map<number, StoreBase>();
  for (const row of rows) {
    const normalized = normalizeStoreRow(row);
    dedup.set(normalized.id, normalized);
  }

  const minRelevance = tokens.length >= 2 ? 8 : 20;
  return Array.from(dedup.values())
    .filter((row) => isSearchableStoreName(row.name))
    .filter((row) =>
      categoryFilter ? inferStoreCategoryByName(row.name) === categoryFilter : true
    )
    .map((row) => ({
      row,
      relevance: queryRelevanceScore(keyword, row.name, row.address),
    }))
    .filter((item) => item.relevance >= minRelevance)
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return (b.row.externalReviewCount ?? 0) - (a.row.externalReviewCount ?? 0);
    })
    .slice(0, limit)
    .map((item) => item.row);
}

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

async function findGeoNearbyDuplicateStore(input: {
  name: string;
  latitude: number | null;
  longitude: number | null;
}) {
  if (
    typeof input.latitude !== "number" ||
    !Number.isFinite(input.latitude) ||
    typeof input.longitude !== "number" ||
    !Number.isFinite(input.longitude)
  ) {
    return null;
  }

  const sb = supabaseServer();
  const nearby = await sb
    .from("stores")
    .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
    .ilike("name", `%${input.name}%`)
    .limit(80);

  if (nearby.error) return null;
  const sourceNameKey = normalizeNameKey(input.name);
  const rows = (nearby.data ?? []) as Array<Record<string, unknown>>;

  let best: StoreBase | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const store = normalizeStoreRow(row);
    if (normalizeNameKey(store.name) !== sourceNameKey) continue;
    if (
      typeof store.latitude !== "number" ||
      !Number.isFinite(store.latitude) ||
      typeof store.longitude !== "number" ||
      !Number.isFinite(store.longitude)
    ) {
      continue;
    }

    const dist = distanceKm(input.latitude, input.longitude, store.latitude, store.longitude);
    if (dist > 0.08) continue;
    if (dist < bestDistance) {
      best = store;
      bestDistance = dist;
    }
  }

  return best;
}

function sortByNearest(
  stores: StoreWithSummary[],
  userLocation?: { latitude: number; longitude: number } | null
) {
  if (!userLocation) return stores;
  const { latitude, longitude } = userLocation;
  return [...stores].sort((a, b) => {
    const aHas = typeof a.latitude === "number" && typeof a.longitude === "number";
    const bHas = typeof b.latitude === "number" && typeof b.longitude === "number";
    if (aHas && bHas) {
      const ad = distanceKm(latitude, longitude, a.latitude as number, a.longitude as number);
      const bd = distanceKm(latitude, longitude, b.latitude as number, b.longitude as number);
      return ad - bd;
    }
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });
}

// Snapshot TTL in days
const SNAPSHOT_TTL_DAYS = 7;

type StoreDetailSnapshot = {
  store: StoreBase;
  summary: StoreSummary;
  insight: {
    reliabilityLabel: string;
    topPercent1km: number | null;
    rankWithin1km: number | null;
    rankTotalWithin1km: number | null;
    comparedStores: Array<{
      id: number | string;
      name: string;
      address: string | null;
      rank: number;
      rating: number;
      appAverageRating?: number | null;
      reviewCount: number;
      isSelf: boolean;
    }>;
    reviewCount: number;
    rating: number | null;
    radiusKm: number;
    ratingTrustScore: {
      totalScore: number;
      breakdown: {
        sampleSize: number;
        stability: number;
        freshness: number;
        sampleSizeEmoji: string;
        stabilityEmoji: string;
        freshnessEmoji: string;
      };
      label: string;
      emoji: string;
    };
  };
  latestGoogleReviews: Array<{
    authorName: string | null;
    rating: number;
    content: string;
    publishedAt: string | null;
    relativePublishedTime: string | null;
  }>;
  photos: string[];
  photosFull: string[];
};

type NearbyRecommendationRow = {
  store: StoreWithSummary;
  distanceKm: number;
  ratingTrustScore: ReturnType<typeof computeRatingTrustScore>;
  compositeScore: number;
};

async function deleteExpiredSnapshot(
  sb: ReturnType<typeof supabaseServer>,
  storeId: number,
  now: Date
) {
  const { error } = await sb
    .from("store_detail_snapshots")
    .delete()
    .eq("store_id", storeId)
    .lte("expires_at", now.toISOString());
  if (error) {
    throw new Error(`Failed to delete expired snapshot for store ${storeId}: ${error.message}`);
  }
}

async function getStoreDetailSnapshot(storeId: number): Promise<StoreDetailSnapshot | null> {
  const sb = supabaseServer();
  
  try {
    const { data, error } = await sb
      .from("store_detail_snapshots")
      .select("snapshot_data, expires_at")
      .eq("store_id", storeId)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    // Check if snapshot is expired
    const expiresAt = new Date(data.expires_at);
    const now = new Date();
    
    if (now > expiresAt) {
      // Snapshot expired, return null to trigger recalculation
      void deleteExpiredSnapshot(sb, storeId, now).catch((error) => {
        console.error(
          "Background snapshot cleanup failed:",
          error instanceof Error ? error.message : error
        );
      });
      return null;
    }
    
    // Return cached snapshot data
    return data.snapshot_data as StoreDetailSnapshot;
  } catch (error) {
    console.error("Error reading snapshot:", error);
    return null;
  }
}

async function saveStoreDetailSnapshot(storeId: number, snapshot: StoreDetailSnapshot): Promise<void> {
  const sb = supabaseServer();
  
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SNAPSHOT_TTL_DAYS * 24 * 60 * 60 * 1000);
    
    await sb
      .from("store_detail_snapshots")
      .upsert({
        store_id: storeId,
        snapshot_data: snapshot,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: "store_id"
      });
  } catch (error) {
    // Don't throw - just log the error. Cache failure shouldn't break the app
    console.error("Error saving snapshot:", error);
  }
}

function getLatestReviewWrittenAt(
  latestGoogleReviews: Array<{ publishedAt: string | null }> | undefined,
  reviews: Array<{ source: string; createdAt: string }>
) {
  let latestTs: number | null = null;
  let latestIso: string | null = null;

  for (const review of latestGoogleReviews ?? []) {
    if (!review.publishedAt) continue;
    const ts = Date.parse(review.publishedAt);
    if (!Number.isFinite(ts)) continue;
    if (latestTs === null || ts > latestTs) {
      latestTs = ts;
      latestIso = new Date(ts).toISOString();
    }
  }

  for (const review of reviews) {
    if (review.source !== "external") continue;
    const ts = Date.parse(review.createdAt);
    if (!Number.isFinite(ts)) continue;
    if (latestTs === null || ts > latestTs) {
      latestTs = ts;
      latestIso = new Date(ts).toISOString();
    }
  }

  return latestIso;
}

export async function getStoreDetail(id: number, options?: { forceGoogle?: boolean }) {
  const forceGoogle = options?.forceGoogle === true;
  // Try to get cached snapshot first
  const cachedSnapshot = await getStoreDetailSnapshot(id);
  
  const sb = supabaseServer();
  
  // Always load reviews fresh (not cached) - per requirements, reviews are not included in snapshots
  // We load them here regardless of cache status because they're always needed in the response
  const baseReviews = await loadReviewsByStoreIds([id]);
  const reviews = await enrichReviews(baseReviews);
  const authorStatsMap = await loadAuthorStatsForReviews(reviews);
  const reviewsWithAuthorStats = reviews.map((review) => {
    const key = normalizeAuthorKey(review.authorName);
    return {
      ...review,
      authorStats: key ? (authorStatsMap.get(key) ?? null) : null,
    };
  });
  reviewsWithAuthorStats.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const freshSummary = summarizeReviews(
    reviewsWithAuthorStats,
    cachedSnapshot?.store.externalRating ?? null,
    cachedSnapshot?.store.externalReviewCount ?? 0
  );
  
  // If we have a valid cached snapshot and force sync is off, use cache.
  if (cachedSnapshot && !forceGoogle && Array.isArray(cachedSnapshot.latestGoogleReviews)) {
    const latestGoogleReviews =
      cachedSnapshot.latestGoogleReviews.length > 0
        ? cachedSnapshot.latestGoogleReviews
        : await loadLatestGoogleReviewsForStore({
            name: cachedSnapshot.store.name,
            address: cachedSnapshot.store.address,
            fallback: cachedSnapshot.latestGoogleReviews,
          });
    const latestReviewAt = getLatestReviewWrittenAt(latestGoogleReviews, reviewsWithAuthorStats);
    const normalizedTrustScore = computeRatingTrustScore(
      cachedSnapshot.store.externalRating,
      cachedSnapshot.store.externalReviewCount ?? 0,
      { latestReviewAt }
    );
    return {
      ...cachedSnapshot,
      latestGoogleReviews,
      insight: {
        ...cachedSnapshot.insight,
        ratingTrustScore: normalizedTrustScore,
      },
      summary: {
        ...cachedSnapshot.summary,
        appAverageRating: freshSummary.appAverageRating,
      },
      reviews: reviewsWithAuthorStats, // Always return fresh reviews
    };
  }
  
  // No valid cache - compute everything from scratch
  const full = await sb
    .from("stores")
    .select("id, name, address, latitude, longitude, external_rating, external_review_count")
    .eq("id", id)
    .single();

  let storeData: Record<string, unknown> | null = (full.data ?? null) as
    | Record<string, unknown>
    | null;

  if (full.error) {
    if (!isMissingColumnError(full.error)) throw new Error(full.error.message);

    const minimal = await sb
      .from("stores")
      .select("id, name, address, external_rating, external_review_count")
      .eq("id", id)
      .single();

    if (minimal.error) throw new Error(minimal.error.message);
    storeData = (minimal.data ?? null) as Record<string, unknown> | null;
  }

  if (!storeData) throw new Error("store not found");
  
  // Try to refresh external snapshot, fallback to existing data on error
  let normalizedStoreRaw: StoreBase;
  try {
    normalizedStoreRaw = await refreshStoreExternalSnapshotIfStale(id, { force: forceGoogle });
  } catch (error) {
    console.error("Failed to refresh external snapshot, using existing data:", error);
    normalizedStoreRaw = normalizeStoreRow(storeData);
  }
  
  // Try to ensure geo data, continue without it on error
  let normalizedStore: StoreBase;
  try {
    normalizedStore = await ensureStoreGeo(normalizedStoreRaw);
  } catch (error) {
    console.error("Failed to ensure geo data, continuing without it:", error);
    normalizedStore = normalizedStoreRaw;
  }
  
  // Do heavy nearby import in background so detail response is fast.
  importNearbyRestaurantsForStore(normalizedStore).catch((error) => {
    console.error("Failed to import nearby stores in background:", error);
  });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const placeForDetail = await (async () => {
    if (!apiKey) return null;
    try {
      return await findGooglePlaceForStore(apiKey, {
        name: normalizedStore.name,
        address: normalizedStore.address,
      });
    } catch (error) {
      console.error("Failed to fetch google place:", error);
      return null;
    }
  })();

  const latestGoogleReviews = await loadLatestGoogleReviewsForStore({
    name: normalizedStore.name,
    address: normalizedStore.address,
  });
  const latestReviewAt = getLatestReviewWrittenAt(latestGoogleReviews, reviewsWithAuthorStats);

  const photosResult = await (async () => {
    const photos: string[] = [];
    const photosFull: string[] = [];
    if (apiKey && placeForDetail?.photos && placeForDetail.photos.length > 0) {
      const photoSlice = placeForDetail.photos.slice(0, 3);
      photoSlice.forEach((photo) => {
        if (photo.name) {
          photos.push(buildGooglePhotoUrl(photo.name, apiKey, 400, 400));
          photosFull.push(buildGooglePhotoUrl(photo.name, apiKey, 1200, 900));
        }
      });
    }
    return { photos, photosFull };
  })();

  const photos = photosResult.photos;
  const photosFull = photosResult.photosFull;

  const summary = summarizeReviews(
    reviewsWithAuthorStats,
    normalizedStore.externalRating,
    normalizedStore.externalReviewCount ?? null
  );
  
  // Try to compute rank insight, fallback to null on error
  let rankInsight: Awaited<ReturnType<typeof computeTopRankWithin1KmBySameLabel>> = null;
  try {
    rankInsight = await computeTopRankWithin1KmBySameLabel(normalizedStore);
  } catch (error) {
    console.error("Failed to compute rank insight, using null:", error);
  }

  const comparedStoreIds =
    rankInsight?.comparedStores
      .map((row) => (typeof row.id === "number" ? row.id : null))
      .filter((id): id is number => id !== null) ?? [];
  const comparedStoreAppAvgMap = await loadAppAverageRatingByStoreIds(comparedStoreIds);
  const comparedStoresWithAppAverage =
    rankInsight?.comparedStores.map((row) => ({
      ...row,
      appAverageRating:
        typeof row.id === "number" ? (comparedStoreAppAvgMap.get(row.id) ?? null) : null,
    })) ?? [];
  
  const reliabilityLabel = reliabilityLabelBySnapshot(
    normalizedStore.externalRating,
    normalizedStore.externalReviewCount ?? 0
  );
  const ratingTrustScore = computeRatingTrustScore(
    normalizedStore.externalRating,
    normalizedStore.externalReviewCount ?? 0,
    { latestReviewAt }
  );

  // Create snapshot object (without reviews)
  const snapshot: StoreDetailSnapshot = {
    store: normalizedStore,
    summary,
    insight: {
      reliabilityLabel,
      topPercent1km: rankInsight?.topPercent ?? null,
      rankWithin1km: rankInsight?.rank ?? null,
      rankTotalWithin1km: rankInsight?.total ?? null,
      comparedStores: comparedStoresWithAppAverage,
      reviewCount: normalizedStore.externalReviewCount ?? 0,
      rating: normalizedStore.externalRating,
      radiusKm: 1,
      ratingTrustScore,
    },
    latestGoogleReviews,
    photos,
    photosFull,
  };
  
  // Save snapshot asynchronously (fire-and-forget pattern)
  // Error handling is done inside saveStoreDetailSnapshot, cache failures won't break the response
  saveStoreDetailSnapshot(id, snapshot);

  return {
    ...snapshot,
    reviews: reviewsWithAuthorStats, // Include fresh reviews in response
  };
}

async function loadAppAverageRatingByStoreIds(storeIds: number[]) {
  if (!storeIds.length) return new Map<number, number>();
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("user_reviews")
    .select("store_id, rating")
    .in("store_id", storeIds);

  if (error) {
    if (isMissingTableError(error)) return new Map<number, number>();
    throw new Error(error.message);
  }

  const aggregate = new Map<number, { sum: number; count: number }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const storeId = toNumber(row.store_id);
    const rating = toNumber(row.rating);
    if (storeId === null || rating === null) continue;
    const prev = aggregate.get(storeId) ?? { sum: 0, count: 0 };
    prev.sum += rating;
    prev.count += 1;
    aggregate.set(storeId, prev);
  }

  return new Map(
    Array.from(aggregate.entries()).map(([storeId, v]) => [storeId, round2(v.sum / Math.max(1, v.count))])
  );
}

export async function createStore(input: CreateStoreInput) {
  const sb = supabaseServer();

  const name = input.name.trim();
  const address = input.address?.trim() || null;
  const latitude =
    typeof input.latitude === "number" && Number.isFinite(input.latitude)
      ? input.latitude
      : null;
  const longitude =
    typeof input.longitude === "number" && Number.isFinite(input.longitude)
      ? input.longitude
      : null;

  const kakaoPlaceId = input.kakaoPlaceId?.trim() || null;

  if (!name) {
    throw new Error("가게 이름은 필수입니다.");
  }

  // Filter out non-Korean addresses
  if (address && !isKoreanAddress(address)) {
    throw new Error("한국 주소만 등록할 수 있습니다.");
  }

  if (kakaoPlaceId) {
    const byKakaoId = await sb
      .from("stores")
      .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
      .eq("kakao_place_id", kakaoPlaceId)
      .limit(1);

    if (!byKakaoId.error && byKakaoId.data?.[0]) {
      const existing = normalizeStoreRow(byKakaoId.data[0] as Record<string, unknown>);
      if ((existing.latitude === null || existing.longitude === null) && latitude !== null && longitude !== null) {
        const updateGeo = await sb
          .from("stores")
          .update({ latitude, longitude, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
          .single();
        if (!updateGeo.error) {
          return {
            store: normalizeStoreRow(updateGeo.data as Record<string, unknown>),
            created: false,
          };
        }
      }
      return {
        store: existing,
        created: false,
      };
    }
  }

  if (address) {
    const duplicateFull = await sb
      .from("stores")
      .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
      .eq("name", name)
      .eq("address", address)
      .limit(1);
    let duplicateRow: Record<string, unknown> | null = null;
    if (!duplicateFull.error && duplicateFull.data?.[0]) {
      duplicateRow = duplicateFull.data[0] as Record<string, unknown>;
    } else if (isMissingColumnError(duplicateFull.error)) {
      const duplicateMinimal = await sb
        .from("stores")
        .select("id, name, address, latitude, longitude, external_rating, external_review_count")
        .eq("name", name)
        .eq("address", address)
        .limit(1);
      if (!duplicateMinimal.error && duplicateMinimal.data?.[0]) {
        duplicateRow = duplicateMinimal.data[0] as Record<string, unknown>;
      }
    } else if (duplicateFull.error) {
      throw new Error(duplicateFull.error.message);
    }

    if (duplicateRow) {
      const existing = normalizeStoreRow(duplicateRow);
      if ((existing.latitude === null || existing.longitude === null) && latitude !== null && longitude !== null) {
        const updateGeo = await sb
          .from("stores")
          .update({
            latitude,
            longitude,
            ...(kakaoPlaceId ? { kakao_place_id: kakaoPlaceId } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
          .single();
        if (!updateGeo.error) {
          return {
            store: normalizeStoreRow(updateGeo.data as Record<string, unknown>),
            created: false,
          };
        }
      }
      return {
        store: existing,
        created: false,
      };
    }
  }

  const normalizedDuplicate = await findNormalizedDuplicateStore({ name, address });
  if (normalizedDuplicate) {
    if (
      (normalizedDuplicate.latitude === null || normalizedDuplicate.longitude === null) &&
      latitude !== null &&
      longitude !== null
    ) {
      const updateGeo = await sb
        .from("stores")
        .update({
          latitude,
          longitude,
          ...(kakaoPlaceId ? { kakao_place_id: kakaoPlaceId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", normalizedDuplicate.id)
        .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
        .single();
      if (!updateGeo.error) {
        return {
          store: normalizeStoreRow(updateGeo.data as Record<string, unknown>),
          created: false,
        };
      }
    }
    return {
      store: normalizedDuplicate,
      created: false,
    };
  }

  const nearbyDuplicate = await findGeoNearbyDuplicateStore({
    name,
    latitude,
    longitude,
  });
  if (nearbyDuplicate) {
    if (
      (nearbyDuplicate.latitude === null || nearbyDuplicate.longitude === null) &&
      latitude !== null &&
      longitude !== null
    ) {
      const updateGeo = await sb
        .from("stores")
        .update({
          latitude,
          longitude,
          ...(kakaoPlaceId ? { kakao_place_id: kakaoPlaceId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", nearbyDuplicate.id)
        .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
        .single();
      if (!updateGeo.error) {
        return {
          store: normalizeStoreRow(updateGeo.data as Record<string, unknown>),
          created: false,
        };
      }
    }
    return {
      store: nearbyDuplicate,
      created: false,
    };
  }

  const fullPayload = {
    name,
    address,
    latitude,
    longitude,
    kakao_place_id: kakaoPlaceId,
    external_rating:
      typeof input.externalRating === "number" && Number.isFinite(input.externalRating)
        ? input.externalRating
        : null,
    external_review_count:
      typeof input.externalReviewCount === "number" &&
      Number.isFinite(input.externalReviewCount)
        ? Math.max(0, Math.round(input.externalReviewCount))
        : 0,
  };

  const fullInsert = await sb
    .from("stores")
    .insert(fullPayload)
    .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
    .single();

  if (!fullInsert.error) {
    return {
      store: normalizeStoreRow(fullInsert.data as Record<string, unknown>),
      created: true,
    };
  }

  // Legacy fallback when latitude/longitude columns are not migrated yet.
  if (isMissingColumnError(fullInsert.error)) {
    const minimalInsert = await sb
      .from("stores")
      .insert({
        name,
        address,
        external_rating: fullPayload.external_rating,
        external_review_count: fullPayload.external_review_count,
      })
      .select("id, name, address, external_rating, external_review_count")
      .single();

    if (minimalInsert.error) throw new Error(minimalInsert.error.message);
    return {
      store: normalizeStoreRow(minimalInsert.data as Record<string, unknown>),
      created: true,
    };
  }

  throw new Error(fullInsert.error.message);
}

export async function createInappReview(input: {
  storeId: number;
  rating: number;
  content: string;
  authorName?: string | null;
  isDisclosedAd?: boolean;
}) {
  const sb = supabaseServer();
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const content = input.content.trim();
  const authorName = input.authorName?.trim() || null;
  const isDisclosedAd = Boolean(input.isDisclosedAd);

  if (!content) {
    throw new Error("리뷰 내용을 입력하세요.");
  }

  const payload = {
    store_id: input.storeId,
    source: "inapp",
    rating,
    content,
    author_name: authorName,
    is_disclosed_ad: isDisclosedAd,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let saved: Omit<ReviewRecord, "latestAnalysis"> | null = null;
  let tableMissingCount = 0;
  let lastError: Error | null = null;

  for (const tableName of REVIEW_TABLE_CANDIDATES) {
    const full = await sb
      .from(tableName)
      .insert(payload)
      .select("id, store_id, source, rating, content, author_name, is_disclosed_ad, created_at")
      .single();

    if (!full.error) {
      saved = normalizeReviewRow(full.data as Record<string, unknown>);
      break;
    }

    if (isMissingColumnError(full.error)) {
      const minimalPayload = {
        store_id: input.storeId,
        rating,
        content,
        created_at: new Date().toISOString(),
      };

      const minimal = await sb
        .from(tableName)
        .insert(minimalPayload)
        .select("id, store_id, rating, content, created_at")
        .single();

      if (!minimal.error) {
        saved = normalizeReviewRow(minimal.data as Record<string, unknown>);
        break;
      }

      if (isMissingTableError(minimal.error)) {
        tableMissingCount += 1;
        continue;
      }

      lastError = new Error(minimal.error.message);
      break;
    }

    if (isMissingTableError(full.error)) {
      tableMissingCount += 1;
      continue;
    }

    lastError = new Error(full.error.message);
    break;
  }

  if (!saved) {
    if (tableMissingCount === REVIEW_TABLE_CANDIDATES.length) {
      throw new Error(
        "리뷰 테이블이 없습니다. Supabase에 reviews 또는 store_reviews 테이블을 생성하세요."
      );
    }
    if (lastError) throw lastError;
    throw new Error("리뷰 저장에 실패했습니다.");
  }

  const normalized = saved;
  await persistAnalysisForReview(normalized);
  const summary = await recomputeStoreMetrics(input.storeId);

  const analysisMap = await loadLatestAnalysesByReviewIds([normalized.id]);

  return {
    savedReview: {
      ...normalized,
      latestAnalysis: analysisMap.get(normalized.id) ?? null,
    } satisfies ReviewRecord,
    summary,
  };
}

export async function runIncrementalAnalysisBatch(options?: { limit?: number; force?: boolean }) {
  const limit = Math.max(1, Math.min(200, options?.limit ?? 100));
  const force = Boolean(options?.force);

  const scanSize = Math.max(limit * 5, 100);
  const reviews = await loadRecentReviewsForBatch(scanSize);
  const analysisMap = await loadLatestAnalysesByReviewIds(reviews.map((review) => review.id));

  const candidates = reviews
    .filter((review) => force || !analysisMap.has(review.id))
    .slice(0, limit);

  const affectedStores = new Set<number>();

  for (const review of candidates) {
    await persistAnalysisForReview(review);
    affectedStores.add(review.storeId);
  }

  for (const storeId of affectedStores) {
    await recomputeStoreMetrics(storeId);
  }

  return {
    scanned: reviews.length,
    analyzed: candidates.length,
    affectedStoreCount: affectedStores.size,
    forced: force,
  };
}

type KakaoCategoryItem = {
  id: string;
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
};

type KakaoCategoryCode = "FD6" | "CE7" | "CS2" | "MT1";

const NATIONWIDE_CATEGORY_CODES: KakaoCategoryCode[] = ["FD6", "CE7", "CS2", "MT1"];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchKakaoJsonWithRetry(url: URL, apiKey: string, options?: { retries?: number; baseDelayMs?: number }) {
  const retries = Math.max(0, options?.retries ?? 4);
  const baseDelayMs = Math.max(100, options?.baseDelayMs ?? 450);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
    });

    if (response.ok) {
      return response.json() as Promise<{
        documents?: KakaoCategoryItem[];
        meta?: { is_end?: boolean };
      }>;
    }

    if (response.status !== 429 || attempt === retries) {
      throw new Error(`카카오 API 호출 실패: ${response.status}`);
    }

    await wait(baseDelayMs * (attempt + 1));
  }

  throw new Error("카카오 API 호출 실패");
}

function range(start: number, end: number, step: number) {
  const values: number[] = [];
  for (let value = start; value <= end; value += step) {
    values.push(Number(value.toFixed(6)));
  }
  return values;
}

export async function importAnseongRestaurantsFromKakao(options?: {
  maxCenters?: number;
}) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error("KAKAO_REST_API_KEY 환경변수가 필요합니다.");
  }

  // 안성시 대략 범위. 누락/중복 대비로 격자 스캔 후 place id로 중복 제거.
  const latMin = 36.92;
  const latMax = 37.13;
  const lonMin = 127.14;
  const lonMax = 127.49;
  const latStep = 0.05;
  const lonStep = 0.06;
  const radius = 3500;

  const ys = range(latMin, latMax, latStep);
  const xs = range(lonMin, lonMax, lonStep);

  const centers: Array<{ lat: number; lon: number }> = [];
  for (const lat of ys) {
    for (const lon of xs) {
      centers.push({ lat, lon });
    }
  }

  const limitedCenters =
    options?.maxCenters && options.maxCenters > 0
      ? centers.slice(0, options.maxCenters)
      : centers;

  const byPlaceId = new Map<string, KakaoCategoryItem>();
  let requestCount = 0;

  for (const center of limitedCenters) {
    for (let page = 1; page <= 45; page += 1) {
      const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
      url.searchParams.set("category_group_code", "FD6");
      url.searchParams.set("x", String(center.lon));
      url.searchParams.set("y", String(center.lat));
      url.searchParams.set("radius", String(radius));
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", "15");
      url.searchParams.set("sort", "distance");

      const json = await fetchKakaoJsonWithRetry(url, apiKey, {
        retries: 5,
        baseDelayMs: 550,
      });
      requestCount += 1;

      const docs = json.documents ?? [];
      for (const doc of docs) {
        byPlaceId.set(doc.id, doc);
      }

      if (json.meta?.is_end) break;
      await wait(100);
    }
  }

  let createdCount = 0;
  let duplicateCount = 0;

  for (const place of byPlaceId.values()) {
    const result = await createStore({
      kakaoPlaceId: place.id,
      name: place.place_name,
      address: place.road_address_name || place.address_name || null,
      latitude: Number(place.y),
      longitude: Number(place.x),
    });

    if (result.created) createdCount += 1;
    else duplicateCount += 1;
  }

  return {
    centersScanned: limitedCenters.length,
    kakaoRequestCount: requestCount,
    foundPlaceCount: byPlaceId.size,
    createdCount,
    duplicateCount,
  };
}

export async function importNationwideStoresFromKakao(options?: {
  maxCenters?: number;
  startIndex?: number;
  categoryCodes?: KakaoCategoryCode[];
  maxPagePerCenter?: number;
  radius?: number;
}) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error("KAKAO_REST_API_KEY 환경변수가 필요합니다.");
  }

  // 대한민국 권역 대략 범위(제주 포함). 대규모 호출 방지를 위해 배치 실행 전제.
  const latMin = 33.1;
  const latMax = 38.5;
  const lonMin = 124.7;
  const lonMax = 131.0;
  const latStep = 0.28;
  const lonStep = 0.35;
  const radius =
    typeof options?.radius === "number" && Number.isFinite(options.radius)
      ? Math.max(1000, Math.min(20000, Math.floor(options.radius)))
      : 18000;
  const maxPagePerCenter =
    typeof options?.maxPagePerCenter === "number" && Number.isFinite(options.maxPagePerCenter)
      ? Math.max(1, Math.min(45, Math.floor(options.maxPagePerCenter)))
      : 6;

  const ys = range(latMin, latMax, latStep);
  const xs = range(lonMin, lonMax, lonStep);

  const centers: Array<{ lat: number; lon: number }> = [];
  for (const lat of ys) {
    for (const lon of xs) {
      centers.push({ lat, lon });
    }
  }

  const startIndex =
    typeof options?.startIndex === "number" && Number.isFinite(options.startIndex)
      ? Math.max(0, Math.min(centers.length - 1, Math.floor(options.startIndex)))
      : 0;

  const maxCenters =
    typeof options?.maxCenters === "number" && Number.isFinite(options.maxCenters)
      ? Math.max(1, Math.min(80, Math.floor(options.maxCenters)))
      : 20;

  const endExclusive = Math.min(centers.length, startIndex + maxCenters);
  const batchCenters = centers.slice(startIndex, endExclusive);

  const categoryCodes =
    options?.categoryCodes?.length
      ? options.categoryCodes
      : NATIONWIDE_CATEGORY_CODES;

  const byPlaceId = new Map<string, KakaoCategoryItem>();
  let requestCount = 0;

  for (const center of batchCenters) {
    for (const categoryCode of categoryCodes) {
      for (let page = 1; page <= maxPagePerCenter; page += 1) {
        const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
        url.searchParams.set("category_group_code", categoryCode);
        url.searchParams.set("x", String(center.lon));
        url.searchParams.set("y", String(center.lat));
        url.searchParams.set("radius", String(radius));
        url.searchParams.set("page", String(page));
        url.searchParams.set("size", "15");
        url.searchParams.set("sort", "distance");

        const json = await fetchKakaoJsonWithRetry(url, apiKey, {
          retries: 5,
          baseDelayMs: 550,
        });
        requestCount += 1;

        const docs = json.documents ?? [];
        for (const doc of docs) {
          byPlaceId.set(doc.id, doc);
        }

        if (json.meta?.is_end) break;
        await wait(100);
      }
    }
  }

  let createdCount = 0;
  let duplicateCount = 0;

  for (const place of byPlaceId.values()) {
    const result = await createStore({
      kakaoPlaceId: place.id,
      name: place.place_name,
      address: place.road_address_name || place.address_name || null,
      latitude: Number(place.y),
      longitude: Number(place.x),
    });

    if (result.created) createdCount += 1;
    else duplicateCount += 1;
  }

  return {
    totalCenters: centers.length,
    startIndex,
    endIndexExclusive: endExclusive,
    nextStartIndex: endExclusive < centers.length ? endExclusive : null,
    hasMore: endExclusive < centers.length,
    centersScanned: batchCenters.length,
    categoryCodes,
    kakaoRequestCount: requestCount,
    foundPlaceCount: byPlaceId.size,
    createdCount,
    duplicateCount,
  };
}

type GooglePlaceSearchResponse = {
  nextPageToken?: string;
  places?: Array<{
    id?: string;
    name?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    location?: { latitude?: number; longitude?: number };
    photos?: Array<{
      name?: string;
      widthPx?: number;
      heightPx?: number;
    }>;
  }>;
};

type GooglePlace = NonNullable<GooglePlaceSearchResponse["places"]>[number];

type GooglePlaceDetailsResponse = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  reviews?: Array<{
    name?: string;
    rating?: number;
    publishTime?: string;
    relativePublishTimeDescription?: string;
    text?: { text?: string };
    originalText?: { text?: string };
    authorAttribution?: { displayName?: string };
  }>;
};

type ExternalReviewInsertInput = {
  storeId: number;
  rating: number;
  content: string;
  authorName?: string | null;
  createdAt?: string | null;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function buildReviewDedupKey(input: {
  rating: number;
  content: string;
  authorName?: string | null;
}) {
  return `${Math.round(input.rating * 10)}|${normalizeText(input.authorName)}|${normalizeText(input.content)}`;
}

async function fetchGoogleJsonWithRetry<T>(url: string, init: RequestInit, options?: { retries?: number; baseDelayMs?: number }) {
  const retries = Math.max(0, options?.retries ?? 3);
  const baseDelayMs = Math.max(120, options?.baseDelayMs ?? 500);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return (await response.json()) as T;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === retries) {
      throw new Error(`Google Places API 호출 실패: ${response.status}`);
    }
    await wait(baseDelayMs * (attempt + 1));
  }

  throw new Error("Google Places API 호출 실패");
}

// Memory cache for Google Places API results
type GooglePlaceCacheEntry = {
  place: GooglePlace | null;
  timestamp: number;
};

const googlePlaceCache = new Map<string, GooglePlaceCacheEntry>();
const GOOGLE_PLACE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GOOGLE_PLACE_CACHE_MAX_SIZE = 500;

function getCachedGooglePlace(cacheKey: string): GooglePlace | null | undefined {
  const entry = googlePlaceCache.get(cacheKey);
  if (!entry) return undefined;
  
  const age = Date.now() - entry.timestamp;
  if (age > GOOGLE_PLACE_CACHE_TTL_MS) {
    googlePlaceCache.delete(cacheKey);
    return undefined;
  }
  
  return entry.place;
}

function setCachedGooglePlace(cacheKey: string, place: GooglePlace | null): void {
  // Avoid poisoning cache with null results from strict filters.
  if (place === null) return;
  // Enforce max cache size with simple LRU: remove oldest entries
  // Note: O(n) iteration is acceptable for a small cache size of 500 entries
  if (googlePlaceCache.size >= GOOGLE_PLACE_CACHE_MAX_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of googlePlaceCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      googlePlaceCache.delete(oldestKey);
    }
  }
  
  googlePlaceCache.set(cacheKey, {
    place,
    timestamp: Date.now(),
  });
}

async function findGooglePlaceForStore(apiKey: string, store: { name: string; address: string | null }) {
  // Use JSON.stringify for cache key to avoid delimiter collisions
  const cacheKey = JSON.stringify({ name: store.name, address: store.address ?? "" });
  
  // Check cache first
  const cached = getCachedGooglePlace(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  
  const query = `${store.name} ${store.address ?? ""}`.trim();
  const strictPayload = {
    textQuery: query,
    languageCode: "ko",
    regionCode: "KR",
    maxResultCount: 1,
    includedType: inferStoreCategoryByName(store.name),
    strictTypeFiltering: true,
  };

  const strictSearch = await fetchGoogleJsonWithRetry<GooglePlaceSearchResponse>(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.name,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.photos",
      },
      body: JSON.stringify(strictPayload),
    }
  );

  let result = strictSearch.places?.[0] ?? null;
  if (!result) {
    const looseSearch = await fetchGoogleJsonWithRetry<GooglePlaceSearchResponse>(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.name,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.photos",
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: "ko",
          regionCode: "KR",
          maxResultCount: 1,
        }),
      }
    );
    result = looseSearch.places?.[0] ?? null;
  }
  setCachedGooglePlace(cacheKey, result);
  return result;
}

function buildGooglePhotoUrl(photoName: string, apiKey: string, maxWidth = 600, maxHeight = 400): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${maxHeight}&maxWidthPx=${maxWidth}&key=${apiKey}`;
}

function reliabilityLabelBySnapshot(rating: number | null, reviewCount: number) {
  if (reviewCount >= 300) return "안정적 평점";
  if (reviewCount >= 120) return "비교적 안정";
  if (rating !== null && rating >= 4.9 && reviewCount < 40) return "과대평가 가능성";
  if (reviewCount >= 40) return "보통";
  return "표본 부족";
}

async function refreshStoreExternalSnapshotIfStale(
  storeId: number,
  options?: { force?: boolean }
) {
  const STORE_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
  const force = options?.force === true;

  const sb = supabaseServer();
  const currentFull = await sb
    .from("stores")
    .select(
      "id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count, updated_at"
    )
    .eq("id", storeId)
    .single();

  let row: Record<string, unknown> | null = null;
  let geoColumnMissing = false;

  if (!currentFull.error && currentFull.data) {
    row = currentFull.data as Record<string, unknown>;
  } else if (isMissingColumnError(currentFull.error)) {
    geoColumnMissing = true;
    const currentMinimal = await sb
      .from("stores")
      .select("id, name, address, external_rating, external_review_count, updated_at")
      .eq("id", storeId)
      .single();
    if (currentMinimal.error || !currentMinimal.data) {
      throw new Error(currentMinimal.error?.message ?? "가게 정보를 찾지 못했습니다.");
    }
    row = currentMinimal.data as Record<string, unknown>;
  } else {
    throw new Error(currentFull.error?.message ?? "가게 정보를 찾지 못했습니다.");
  }

  if (!row) throw new Error("가게 정보를 찾지 못했습니다.");
  const hasExternal = typeof row.external_rating === "number" && Number.isFinite(row.external_rating);
  const hasGeo =
    typeof row.latitude === "number" &&
    Number.isFinite(row.latitude) &&
    typeof row.longitude === "number" &&
    Number.isFinite(row.longitude);
  
  // Check if data is stale (older than 7 days)
  const updatedAt = typeof row.updated_at === "string" ? new Date(row.updated_at).getTime() : 0;
  const age = Date.now() - updatedAt;
  const isStale = !Number.isFinite(age) || age < 0 || age > STORE_REFRESH_TTL_MS;
  
  if (!force && hasExternal && (hasGeo || geoColumnMissing) && !isStale) {
    return normalizeStoreRow(row);
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return normalizeStoreRow(row);
  }

  const place = await findGooglePlaceForStore(apiKey, {
    name: typeof row.name === "string" ? row.name : "",
    address: typeof row.address === "string" ? row.address : null,
  });
  if (!place) {
    return normalizeStoreRow(row);
  }

  const nextExternalRating =
    typeof place.rating === "number" && Number.isFinite(place.rating) ? place.rating : null;
  const nextExternalReviewCount =
    typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
      ? Math.max(0, Math.round(place.userRatingCount))
      : toNumber(row.external_review_count, 0) ?? 0;

  const nextLatitude =
    typeof row.latitude === "number" && Number.isFinite(row.latitude)
      ? row.latitude
      : typeof place.location?.latitude === "number" && Number.isFinite(place.location.latitude)
        ? place.location.latitude
        : null;
  const nextLongitude =
    typeof row.longitude === "number" && Number.isFinite(row.longitude)
      ? row.longitude
      : typeof place.location?.longitude === "number" && Number.isFinite(place.location.longitude)
        ? place.location.longitude
        : null;

  const updatePayload = geoColumnMissing
    ? {
        external_rating: nextExternalRating,
        external_review_count: nextExternalReviewCount,
        updated_at: new Date().toISOString(),
      }
    : {
        external_rating: nextExternalRating,
        external_review_count: nextExternalReviewCount,
        latitude: nextLatitude,
        longitude: nextLongitude,
        updated_at: new Date().toISOString(),
      };

  const updatedFull = await sb
    .from("stores")
    .update(updatePayload)
    .eq("id", storeId)
    .select(
      "id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count, updated_at"
    )
    .single();

  let updatedData: Record<string, unknown> | null = null;
  if (!updatedFull.error && updatedFull.data) {
    updatedData = updatedFull.data as Record<string, unknown>;
  } else if (isMissingColumnError(updatedFull.error)) {
    const updatedMinimal = await sb
      .from("stores")
      .update({
        external_rating: nextExternalRating,
        external_review_count: nextExternalReviewCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storeId)
      .select("id, name, address, external_rating, external_review_count, updated_at")
      .single();
    if (!updatedMinimal.error && updatedMinimal.data) {
      updatedData = updatedMinimal.data as Record<string, unknown>;
    }
  }

  if (!updatedData) {
    return {
      ...normalizeStoreRow(row),
      externalRating: nextExternalRating,
      externalReviewCount: nextExternalReviewCount,
      latitude: typeof nextLatitude === "number" ? nextLatitude : null,
      longitude: typeof nextLongitude === "number" ? nextLongitude : null,
    };
  }

  return normalizeStoreRow(updatedData);
}

async function ensureStoreGeo(store: StoreBase) {
  const hasGeo =
    typeof store.latitude === "number" &&
    Number.isFinite(store.latitude) &&
    typeof store.longitude === "number" &&
    Number.isFinite(store.longitude);
  if (hasGeo) return store;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return store;

  const place = await findGooglePlaceForStore(apiKey, {
    name: store.name,
    address: store.address,
  }).catch(() => null);
  const lat =
    typeof place?.location?.latitude === "number" && Number.isFinite(place.location.latitude)
      ? place.location.latitude
      : null;
  const lon =
    typeof place?.location?.longitude === "number" && Number.isFinite(place.location.longitude)
      ? place.location.longitude
      : null;
  if (lat === null || lon === null) return store;

  const sb = supabaseServer();
  const upd = await sb
    .from("stores")
    .update({ latitude: lat, longitude: lon })
    .eq("id", store.id)
    .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
    .single();

  if (!upd.error && upd.data) {
    return normalizeStoreRow(upd.data as Record<string, unknown>);
  }
  return { ...store, latitude: lat, longitude: lon };
}

async function importNearbyRestaurantsForStore(store: StoreBase) {
  const NEARBY_IMPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

  if (
    typeof store.latitude !== "number" ||
    typeof store.longitude !== "number" ||
    !Number.isFinite(store.latitude) ||
    !Number.isFinite(store.longitude)
  ) {
    return { imported: 0 };
  }

  // Check if we recently imported nearby restaurants (within 7 days)
  const lat = store.latitude;
  const lon = store.longitude;
  const radiusKm = 1;
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const sb = supabaseServer();
  const recentCheck = await sb
    .from("stores")
    .select("id, updated_at")
    .gte("latitude", lat - latDelta)
    .lte("latitude", lat + latDelta)
    .gte("longitude", lon - lonDelta)
    .lte("longitude", lon + lonDelta)
    .not("id", "eq", store.id)
    .limit(5);

  // If we have nearby stores and at least one was recently updated (within 7 days), skip import
  if (!recentCheck.error && recentCheck.data && recentCheck.data.length > 0) {
    const hasRecentUpdate = recentCheck.data.some((row) => {
      const updatedAt = typeof row.updated_at === "string" ? new Date(row.updated_at).getTime() : 0;
      const age = Date.now() - updatedAt;
      return Number.isFinite(age) && age >= 0 && age <= NEARBY_IMPORT_TTL_MS;
    });
    
    if (hasRecentUpdate) {
      return { imported: 0 };
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { imported: 0 };
  const targetCategory = inferStoreCategoryByName(store.name);

  const nearbyRes = await fetchGoogleJsonWithRetry<{
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      location?: { latitude?: number; longitude?: number };
    }>;
  }>("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location",
    },
    body: JSON.stringify({
      includedTypes: [targetCategory],
      maxResultCount: 20,
      languageCode: "ko",
      regionCode: "KR",
      locationRestriction: {
        circle: {
          center: { latitude: store.latitude, longitude: store.longitude },
          radius: 1000,
        },
      },
    }),
  });

  let imported = 0;
  for (const place of nearbyRes.places ?? []) {
    const name = place.displayName?.text?.trim() ?? "";
    if (!name) continue;
    
    const address = place.formattedAddress ?? null;
    // Skip non-Korean addresses
    if (address && !isKoreanAddress(address)) {
      continue;
    }
    
    const created = await createStore({
      name,
      address,
      latitude:
        typeof place.location?.latitude === "number" && Number.isFinite(place.location.latitude)
          ? place.location.latitude
          : null,
      longitude:
        typeof place.location?.longitude === "number" && Number.isFinite(place.location.longitude)
          ? place.location.longitude
          : null,
      externalRating:
        typeof place.rating === "number" && Number.isFinite(place.rating) ? place.rating : null,
      externalReviewCount:
        typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
          ? Math.max(0, Math.round(place.userRatingCount))
          : null,
    });
    if (created.created) imported += 1;
  }

  return { imported };
}

async function computeTopRankWithin1KmBySameLabel(store: StoreBase) {
  if (
    typeof store.latitude !== "number" ||
    typeof store.longitude !== "number" ||
    typeof store.externalRating !== "number"
  ) {
    return null;
  }

  const lat = store.latitude;
  const lon = store.longitude;
  const radiusKm = 1;
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("stores")
    .select("id, name, address, latitude, longitude, external_rating, external_review_count")
    .gte("latitude", lat - latDelta)
    .lte("latitude", lat + latDelta)
    .gte("longitude", lon - lonDelta)
    .lte("longitude", lon + lonDelta)
    .not("external_rating", "is", null)
    .limit(500);

  if (error || !data) {
    if (isMissingColumnError(error)) return null;
    return null;
  }

  const baseLabel = reliabilityLabelBySnapshot(
    store.externalRating,
    store.externalReviewCount ?? 0
  );
  const baseCategory = inferStoreCategoryByName(store.name);

  const nearbyRaw = (data as Array<Record<string, unknown>>)
    .map((row) => ({
      id: toNumber(row.id, 0) ?? 0,
      name: typeof row.name === "string" ? row.name : "이름없음",
      address: typeof row.address === "string" ? row.address : null,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      rating: toNumber(row.external_rating),
      reviewCount: toNumber(row.external_review_count, 0) ?? 0,
      category:
        typeof row.name === "string" ? inferStoreCategoryByName(row.name) : ("restaurant" as StoreCategory),
    }))
    .filter(
      (row) =>
        typeof row.latitude === "number" &&
        typeof row.longitude === "number" &&
        typeof row.rating === "number" &&
        distanceKm(lat, lon, row.latitude, row.longitude) <= radiusKm
    )
    .filter((row) => row.category === baseCategory)
    .filter((row) => reliabilityLabelBySnapshot(row.rating, row.reviewCount) === baseLabel)
    .sort((a, b) => {
      if ((b.rating as number) !== (a.rating as number)) {
        return (b.rating as number) - (a.rating as number);
      }
      return (b.reviewCount as number) - (a.reviewCount as number);
    });

  const byKey = new Map<string, (typeof nearbyRaw)[number]>();
  for (const row of nearbyRaw) {
    const key = `${normalizeNameKey(row.name)}|${normalizeAddressKey(row.address)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    if (row.id === store.id) {
      byKey.set(key, row);
    }
  }
  const nearby = Array.from(byKey.values()).sort((a, b) => {
    if ((b.rating as number) !== (a.rating as number)) {
      return (b.rating as number) - (a.rating as number);
    }
    return (b.reviewCount as number) - (a.reviewCount as number);
  });

  if (!nearby.length) {
    // If no nearby stores found in DB, try Google API fallback
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const nearbyRes = await fetchGoogleJsonWithRetry<{
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          rating?: number;
          userRatingCount?: number;
        }>;
      }>("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
        },
        body: JSON.stringify({
          includedTypes: [baseCategory],
          maxResultCount: 20,
          languageCode: "ko",
          regionCode: "KR",
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: 1000,
            },
          },
        }),
      });

      const candidates = (nearbyRes.places ?? [])
        .map((place) => ({
          id: place.id ?? "",
          name: place.displayName?.text ?? "주변 가게",
          address: place.formattedAddress ?? null,
          rating:
            typeof place.rating === "number" && Number.isFinite(place.rating)
              ? place.rating
              : null,
          reviewCount:
            typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
              ? Math.max(0, Math.round(place.userRatingCount))
              : 0,
        }))
        .filter((row) => typeof row.rating === "number")
        .filter((row) => reliabilityLabelBySnapshot(row.rating, row.reviewCount) === baseLabel)
        .sort((a, b) => {
          if ((b.rating as number) !== (a.rating as number)) return (b.rating as number) - (a.rating as number);
          return b.reviewCount - a.reviewCount;
        });

      const self = {
        id: `store-${store.id}`,
        name: store.name,
        address: store.address ?? null,
        rating: store.externalRating,
        reviewCount: store.externalReviewCount ?? 0,
      };
      const mergedRaw = [...candidates, self]
        .filter((row) => typeof row.rating === "number")
        .sort((a, b) => {
          if ((b.rating as number) !== (a.rating as number)) return (b.rating as number) - (a.rating as number);
          return b.reviewCount - a.reviewCount;
        });

      const mergedMap = new Map<string, (typeof mergedRaw)[number]>();
      for (const row of mergedRaw) {
        const key = `${normalizeNameKey(row.name ?? "")}|${normalizeAddressKey(row.address ?? null)}`;
        const prev = mergedMap.get(key);
        if (!prev) {
          mergedMap.set(key, row);
          continue;
        }
        if (row.id === self.id) {
          mergedMap.set(key, row);
        }
      }
      const merged = Array.from(mergedMap.values()).sort((a, b) => {
        if ((b.rating as number) !== (a.rating as number)) return (b.rating as number) - (a.rating as number);
        return b.reviewCount - a.reviewCount;
      });

      const selfIndex = merged.findIndex((row) => row.id === self.id);
      if (selfIndex >= 0) {
        const nextRank = selfIndex + 1;
        const nextTotal = merged.length;
        const nextTopPercent = Math.max(1, Math.round((nextRank / nextTotal) * 100));
        const nearbyComparedStores = merged.map((row, idx) => ({
          id: row.id,
          name: row.name,
          address: row.address,
          rank: idx + 1,
          rating: row.rating as number,
          reviewCount: row.reviewCount,
          isSelf: row.id === self.id,
        }));
        return {
          rank: nextRank,
          total: nextTotal,
          topPercent: nextTopPercent,
          label: baseLabel,
          comparedStores: nearbyComparedStores,
        };
      }
    } catch {
      // Ignore nearby API failure
    }

    return null;
  }
  const index = Math.max(
    0,
    nearby.findIndex((row) => row.id === store.id)
  );
  const rank = index + 1;
  const total = nearby.length;
  const topPercent = Math.max(1, Math.round((rank / total) * 100));
  const comparedStores = nearby.map((row, idx) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    rank: idx + 1,
    rating: row.rating as number,
    reviewCount: row.reviewCount,
    isSelf: row.id === store.id,
  }));
  if (total >= 3) {
    return { rank, total, topPercent, label: baseLabel, comparedStores };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { rank, total, topPercent, label: baseLabel, comparedStores };
  }

  try {
    const nearbyRes = await fetchGoogleJsonWithRetry<{
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        rating?: number;
        userRatingCount?: number;
      }>;
    }>("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({
        includedTypes: [baseCategory],
        maxResultCount: 20,
        languageCode: "ko",
        regionCode: "KR",
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius: 1000,
          },
        },
      }),
    });

    const candidates = (nearbyRes.places ?? [])
      .map((place) => ({
        id: place.id ?? "",
        name: place.displayName?.text ?? "주변 가게",
        address: place.formattedAddress ?? null,
        rating:
          typeof place.rating === "number" && Number.isFinite(place.rating)
            ? place.rating
            : null,
        reviewCount:
          typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
            ? Math.max(0, Math.round(place.userRatingCount))
            : 0,
      }))
      .filter((row) => typeof row.rating === "number")
      .filter((row) => reliabilityLabelBySnapshot(row.rating, row.reviewCount) === baseLabel)
      .sort((a, b) => {
        if ((b.rating as number) !== (a.rating as number)) return (b.rating as number) - (a.rating as number);
        return b.reviewCount - a.reviewCount;
      });

    const self = {
      id: `store-${store.id}`,
      name: store.name,
      address: store.address ?? null,
      rating: store.externalRating,
      reviewCount: store.externalReviewCount ?? 0,
    };
    const mergedRaw = [...candidates, self]
      .filter((row) => typeof row.rating === "number")
      .sort((a, b) => {
        if ((b.rating as number) !== (a.rating as number)) return (b.rating as number) - (a.rating as number);
        return b.reviewCount - a.reviewCount;
      });

    const mergedMap = new Map<string, (typeof mergedRaw)[number]>();
    for (const row of mergedRaw) {
      const key = `${normalizeNameKey(row.name ?? "")}|${normalizeAddressKey(row.address ?? null)}`;
      const prev = mergedMap.get(key);
      if (!prev) {
        mergedMap.set(key, row);
        continue;
      }
      if (row.id === self.id) {
        mergedMap.set(key, row);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) => {
      if ((b.rating as number) !== (a.rating as number)) return (b.rating as number) - (a.rating as number);
      return b.reviewCount - a.reviewCount;
    });

    const selfIndex = merged.findIndex((row) => row.id === self.id);
    if (selfIndex >= 0) {
      const nextRank = selfIndex + 1;
      const nextTotal = merged.length;
      const nextTopPercent = Math.max(1, Math.round((nextRank / nextTotal) * 100));
      const nearbyComparedStores = merged.map((row, idx) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        rank: idx + 1,
        rating: row.rating as number,
        reviewCount: row.reviewCount,
        isSelf: row.id === self.id,
      }));
      return {
        rank: nextRank,
        total: nextTotal,
        topPercent: nextTopPercent,
        label: baseLabel,
        comparedStores: nearbyComparedStores,
      };
    }
  } catch {
    // Ignore nearby API failure and fall back to DB-derived rank.
  }

  return { rank, total, topPercent, label: baseLabel, comparedStores };
}

export async function searchAndAutoRegisterStoreByKeyword(
  keyword: string,
  limit = 20,
  userLocation?: { latitude: number; longitude: number } | null,
  offset = 0
) {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return {
      stores: [] as StoreWithSummary[],
      autoRegistered: false,
      source: null as "google" | null,
      hasMore: false,
      nextOffset: null as number | null,
    };
  }

  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const desiredCount = safeOffset + safeLimit + 1;
  const fetchTarget = Math.max(80, Math.min(200, desiredCount * 4));
  const categoryFilter = inferQueryCategory(normalizedKeyword);

  const existing = await findRegisteredStoresByKeyword(normalizedKeyword, fetchTarget, categoryFilter);
  const combined = new Map<number, StoreBase>();
  for (const store of existing) combined.set(store.id, store);

  if (!combined.size) {
    return {
      stores: [] as StoreWithSummary[],
      autoRegistered: false,
      source: null as "google" | null,
      hasMore: false,
      nextOffset: null as number | null,
    };
  }

  const enriched = await enrichStoresWithSummary(Array.from(combined.values()));
  const sorted = sortByNearest(enriched, userLocation);
  const page = sorted.slice(safeOffset, safeOffset + safeLimit);
  const refreshed = page;
  const hasMore = sorted.length > safeOffset + safeLimit;

  return {
    stores: refreshed,
    autoRegistered: false,
    source: null as "google" | null,
    hasMore,
    nextOffset: hasMore ? safeOffset + safeLimit : null,
  };
}

async function loadNearbyStoresFromDb(
  location: { latitude: number; longitude: number },
  radiusKm: number
) {
  const sb = supabaseServer();
  const lat = location.latitude;
  const lon = location.longitude;
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const { data, error } = await sb
    .from("stores")
    .select("id, name, address, latitude, longitude, external_rating, external_review_count")
    .gte("latitude", lat - latDelta)
    .lte("latitude", lat + latDelta)
    .gte("longitude", lon - lonDelta)
    .lte("longitude", lon + lonDelta)
    .limit(300);

  if (error || !data) {
    if (isMissingColumnError(error)) return [] as StoreBase[];
    throw new Error(error?.message ?? "주변 가게 조회에 실패했습니다.");
  }

  const dedup = new Map<string, StoreBase>();
  for (const row of data as Array<Record<string, unknown>>) {
    const normalized = normalizeStoreRow(row);
    if (
      typeof normalized.latitude !== "number" ||
      !Number.isFinite(normalized.latitude) ||
      typeof normalized.longitude !== "number" ||
      !Number.isFinite(normalized.longitude)
    ) {
      continue;
    }
    const dist = distanceKm(lat, lon, normalized.latitude, normalized.longitude);
    if (dist > radiusKm) continue;
    const key = `${normalizeNameKey(normalized.name)}|${normalizeAddressKey(normalized.address)}`;
    const prev = dedup.get(key);
    if (!prev || (normalized.externalReviewCount ?? 0) > (prev.externalReviewCount ?? 0)) {
      dedup.set(key, normalized);
    }
  }

  return Array.from(dedup.values());
}

export async function getNearbyRecommendedStoresByLocation(
  location: { latitude: number; longitude: number },
  options?: { limit?: number; minDbCount?: number; radiusKm?: number }
) {
  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(10, Math.floor(options.limit)))
      : 10;
  const minDbCount =
    typeof options?.minDbCount === "number" && Number.isFinite(options.minDbCount)
      ? Math.max(1, Math.min(20, Math.floor(options.minDbCount)))
      : 5;
  const radiusKm =
    typeof options?.radiusKm === "number" && Number.isFinite(options.radiusKm)
      ? Math.max(0.5, Math.min(5, options.radiusKm))
      : 1;

  let nearbyStores = await loadNearbyStoresFromDb(location, radiusKm);
  if (nearbyStores.length < minDbCount) {
    nearbyStores = await loadNearbyStoresFromDb(location, Math.max(radiusKm, 1.5));
  }

  const enriched = await enrichStoresWithSummary(nearbyStores);
  const ranked: NearbyRecommendationRow[] = enriched
    .map((store) => {
      if (
        typeof store.latitude !== "number" ||
        !Number.isFinite(store.latitude) ||
        typeof store.longitude !== "number" ||
        !Number.isFinite(store.longitude)
      ) {
        return null;
      }
      const distance = distanceKm(location.latitude, location.longitude, store.latitude, store.longitude);
      const externalCount = Math.max(store.summary.externalReviewCount ?? 0, store.externalReviewCount ?? 0);
      const trust = computeRatingTrustScore(store.externalRating ?? null, externalCount);
      const externalRating = typeof store.externalRating === "number" ? store.externalRating : 0;
      const appRating = typeof store.summary.appAverageRating === "number" ? store.summary.appAverageRating : 0;
      const compositeScore = externalRating * 18 + trust.totalScore * 0.8 + appRating * 6;
      return {
        store,
        distanceKm: distance,
        ratingTrustScore: trust,
        compositeScore,
      };
    })
    .filter((row): row is NearbyRecommendationRow => Boolean(row))
    .sort((a, b) => {
      if (Math.abs(a.distanceKm - b.distanceKm) > 0.6) return a.distanceKm - b.distanceKm;
      if (Math.abs(b.compositeScore - a.compositeScore) > 0.5) return b.compositeScore - a.compositeScore;
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, limit);

  return ranked;
}

export async function backfillStoreGeoFromGoogle(options?: {
  limit?: number;
  offset?: number;
  onlyMissing?: boolean;
}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY 또는 GOOGLE_MAPS_API_KEY 환경변수가 필요합니다.");
  }

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(200, Math.floor(options.limit)))
      : 50;
  const offset =
    typeof options?.offset === "number" && Number.isFinite(options.offset)
      ? Math.max(0, Math.floor(options.offset))
      : 0;
  const onlyMissing = options?.onlyMissing !== false;

  const sb = supabaseServer();
  let query = sb
    .from("stores")
    .select("id, name, address, latitude, longitude, external_rating, external_review_count")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (onlyMissing) {
    query = query.or("latitude.is.null,longitude.is.null");
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("stores.latitude/longitude 컬럼이 없습니다. schema.sql을 먼저 적용하세요.");
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  let scanned = 0;
  let updated = 0;
  let noMatch = 0;
  let skippedHasGeo = 0;

  for (const row of rows) {
    scanned += 1;
    const id = toNumber(row.id, 0) ?? 0;
    const name = typeof row.name === "string" ? row.name : "";
    const address = typeof row.address === "string" ? row.address : null;
    const hasGeo =
      typeof row.latitude === "number" &&
      Number.isFinite(row.latitude) &&
      typeof row.longitude === "number" &&
      Number.isFinite(row.longitude);

    if (!id || !name) continue;
    if (hasGeo) {
      skippedHasGeo += 1;
      continue;
    }

    const place = await findGooglePlaceForStore(apiKey, { name, address });
    const lat =
      typeof place?.location?.latitude === "number" && Number.isFinite(place.location.latitude)
        ? place.location.latitude
        : null;
    const lon =
      typeof place?.location?.longitude === "number" && Number.isFinite(place.location.longitude)
        ? place.location.longitude
        : null;

    if (lat === null || lon === null) {
      noMatch += 1;
      continue;
    }

    const extRating =
      typeof place?.rating === "number" && Number.isFinite(place.rating)
        ? place.rating
        : toNumber(row.external_rating);
    const extCount =
      typeof place?.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
        ? Math.max(0, Math.round(place.userRatingCount))
        : toNumber(row.external_review_count, 0) ?? 0;

    const upd = await sb
      .from("stores")
      .update({
        latitude: lat,
        longitude: lon,
        external_rating: extRating,
        external_review_count: extCount,
      })
      .eq("id", id);
    if (!upd.error) {
      updated += 1;
    }

    await wait(120);
  }

  return {
    scanned,
    updated,
    noMatch,
    skippedHasGeo,
    nextOffset: offset + rows.length,
    hasMore: rows.length === limit,
  };
}

function chooseCanonicalStore(rows: StoreBase[]) {
  return [...rows].sort((a, b) => {
    const aGeo = a.latitude !== null && a.longitude !== null ? 1 : 0;
    const bGeo = b.latitude !== null && b.longitude !== null ? 1 : 0;
    if (aGeo !== bGeo) return bGeo - aGeo;

    const aKakao = a.kakaoPlaceId ? 1 : 0;
    const bKakao = b.kakaoPlaceId ? 1 : 0;
    if (aKakao !== bKakao) return bKakao - aKakao;

    const aCount = a.externalReviewCount ?? 0;
    const bCount = b.externalReviewCount ?? 0;
    if (aCount !== bCount) return bCount - aCount;

    const aRating = a.externalRating ?? 0;
    const bRating = b.externalRating ?? 0;
    if (aRating !== bRating) return bRating - aRating;

    return a.id - b.id;
  })[0];
}

function looseAddressSignature(address: string | null | undefined) {
  const raw = (address ?? "").toLowerCase();
  if (!raw) return "";

  const compact = raw
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const roadMatch = compact.match(/[a-zA-Z0-9가-힣]+(?:로|길|ro|gil|road|street)/i);
  const numberMatch = compact.match(/\d{1,5}(?:-\d{1,4})?/);
  const districtMatch = compact.match(/[a-zA-Z0-9가-힣]+(?:구|군|시|동|읍|면)/i);

  const road = roadMatch ? normalizeAddressKey(roadMatch[0]) : "";
  const num = numberMatch ? numberMatch[0] : "";
  const district = districtMatch ? normalizeAddressKey(districtMatch[0]) : "";

  return [district, road, num].filter(Boolean).join("|");
}

export async function dedupeStoresByNormalizedNameAddress(options?: {
  dryRun?: boolean;
  maxGroups?: number;
}) {
  const dryRun = Boolean(options?.dryRun);
  const maxGroups =
    typeof options?.maxGroups === "number" && Number.isFinite(options.maxGroups)
      ? Math.max(1, Math.min(2000, Math.floor(options.maxGroups)))
      : 300;

  const sb = supabaseServer();
  const rows: StoreBase[] = [];
  const pageSize = 1000;
  let lastId = 0;

  for (;;) {
    const full = await sb
      .from("stores")
      .select("id, name, address, latitude, longitude, kakao_place_id, external_rating, external_review_count")
      .order("id", { ascending: true })
      .gt("id", lastId)
      .limit(pageSize);

    let pageRows: StoreBase[] = [];
    if (!full.error) {
      pageRows = (full.data ?? []).map((row) => normalizeStoreRow(row as Record<string, unknown>));
    } else if (isMissingColumnError(full.error)) {
      const minimal = await sb
        .from("stores")
        .select("id, name, address, latitude, longitude, external_rating, external_review_count")
        .order("id", { ascending: true })
        .gt("id", lastId)
        .limit(pageSize);
      if (minimal.error) throw new Error(minimal.error.message);
      pageRows = (minimal.data ?? []).map((row) => normalizeStoreRow(row as Record<string, unknown>));
    } else {
      throw new Error(full.error.message);
    }

    if (!pageRows.length) break;
    rows.push(...pageRows);
    lastId = pageRows[pageRows.length - 1]?.id ?? lastId;
    if (pageRows.length < pageSize) break;
  }
  const grouped = new Map<string, StoreBase[]>();

  for (const row of rows) {
    const nameKey = normalizeNameKey(row.name);
    const strictAddress = normalizeAddressKey(row.address);
    const looseAddress = looseAddressSignature(row.address);
    const addressKey = looseAddress || strictAddress;
    const key = `${nameKey}|${addressKey}`;
    if (!key || key === "|") continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const groups = Array.from(grouped.values())
    .filter((bucket) => bucket.length >= 2)
    .slice(0, maxGroups);

  if (dryRun) {
    return {
      dryRun: true,
      groupCount: groups.length,
      mergeStoreCount: groups.reduce((sum, g) => sum + (g.length - 1), 0),
      samples: groups.slice(0, 20).map((bucket) => ({
        canonical: chooseCanonicalStore(bucket),
        duplicates: bucket.map((row) => row.id),
      })),
    };
  }

  let processedGroups = 0;
  let mergedStores = 0;
  const errors: Array<{ group: string; error: string }> = [];

  for (const bucket of groups) {
    const canonical = chooseCanonicalStore(bucket);
    const sourceIds = bucket.filter((row) => row.id !== canonical.id).map((row) => row.id);
    if (!sourceIds.length) continue;

    try {
      for (const tableName of REVIEW_TABLE_CANDIDATES) {
        const upd = await sb
          .from(tableName)
          .update({ store_id: canonical.id })
          .in("store_id", sourceIds);
        if (upd.error && !isMissingTableError(upd.error) && !isMissingColumnError(upd.error)) {
          throw new Error(`${tableName}: ${upd.error.message}`);
        }
      }

      const updUserReviews = await sb
        .from("user_reviews")
        .update({ store_id: canonical.id })
        .in("store_id", sourceIds);
      if (
        updUserReviews.error &&
        !isMissingTableError(updUserReviews.error) &&
        !isMissingColumnError(updUserReviews.error)
      ) {
        throw new Error(`user_reviews: ${updUserReviews.error.message}`);
      }

      const updAnalyses = await sb
        .from("review_analyses")
        .update({ store_id: canonical.id })
        .in("store_id", sourceIds);
      if (
        updAnalyses.error &&
        !isMissingTableError(updAnalyses.error) &&
        !isMissingColumnError(updAnalyses.error)
      ) {
        throw new Error(`review_analyses: ${updAnalyses.error.message}`);
      }

      const delMetrics = await sb.from("store_metrics").delete().in("store_id", sourceIds);
      if (
        delMetrics.error &&
        !isMissingTableError(delMetrics.error) &&
        !isMissingColumnError(delMetrics.error)
      ) {
        throw new Error(`store_metrics: ${delMetrics.error.message}`);
      }

      const delGoogleCache = await sb
        .from("google_review_cache")
        .delete()
        .in("store_id", sourceIds);
      if (
        delGoogleCache.error &&
        !isMissingTableError(delGoogleCache.error) &&
        !isMissingColumnError(delGoogleCache.error)
      ) {
        throw new Error(`google_review_cache: ${delGoogleCache.error.message}`);
      }

      const delNaverCache = await sb
        .from("naver_signal_cache")
        .delete()
        .in("store_id", sourceIds);
      if (
        delNaverCache.error &&
        !isMissingTableError(delNaverCache.error) &&
        !isMissingColumnError(delNaverCache.error)
      ) {
        throw new Error(`naver_signal_cache: ${delNaverCache.error.message}`);
      }

      const delDetailSnapshots = await sb
        .from("store_detail_snapshots")
        .delete()
        .in("store_id", sourceIds);
      if (
        delDetailSnapshots.error &&
        !isMissingTableError(delDetailSnapshots.error) &&
        !isMissingColumnError(delDetailSnapshots.error)
      ) {
        throw new Error(`store_detail_snapshots: ${delDetailSnapshots.error.message}`);
      }

      const delStores = await sb.from("stores").delete().in("id", sourceIds);
      if (delStores.error) throw new Error(`stores: ${delStores.error.message}`);

      await recomputeStoreMetrics(canonical.id);
      processedGroups += 1;
      mergedStores += sourceIds.length;
      await wait(50);
    } catch (e) {
      errors.push({
        group: `${canonical.name}|${canonical.address ?? ""}`,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    dryRun: false,
    groupCount: groups.length,
    processedGroups,
    mergedStores,
    errors,
  };
}

async function getGooglePlaceDetails(apiKey: string, placeResourceOrId: string) {
  const placePath = placeResourceOrId.startsWith("places/")
    ? placeResourceOrId
    : `places/${placeResourceOrId}`;

  return fetchGoogleJsonWithRetry<GooglePlaceDetailsResponse>(
    `https://places.googleapis.com/v1/${placePath}?languageCode=ko&regionCode=KR`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,name,displayName,formattedAddress,rating,userRatingCount,reviews",
      },
    }
  );
}

async function getLatestGoogleReviewsFromLegacy(apiKey: string, placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "reviews");
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("language", "ko");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Google Legacy Details 호출 실패: ${response.status}`);
  }

  const json = (await response.json()) as {
    status?: string;
    result?: {
      reviews?: Array<{
        rating?: number;
        text?: string;
        time?: number;
        relative_time_description?: string;
        author_name?: string;
      }>;
    };
    error_message?: string;
  };

  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(json.error_message || `Google Legacy Details 오류: ${json.status}`);
  }

  return (json.result?.reviews ?? [])
    .slice(0, 5)
    .map((review) => ({
      authorName: review.author_name ?? null,
      rating:
        typeof review.rating === "number" && Number.isFinite(review.rating)
          ? Math.max(1, Math.min(5, review.rating))
          : 0,
      content: typeof review.text === "string" ? review.text.trim() : "",
      publishedAt:
        typeof review.time === "number" && Number.isFinite(review.time)
          ? new Date(review.time * 1000).toISOString()
          : null,
      relativePublishedTime:
        typeof review.relative_time_description === "string"
          ? review.relative_time_description
          : null,
    }))
    .filter((review) => review.rating > 0 && review.content.length > 0);
}

async function loadLatestGoogleReviewsForStore(input: {
  name: string;
  address: string | null;
  fallback?: StoreDetailSnapshot["latestGoogleReviews"];
}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return input.fallback ?? [];

  try {
    const place = await findGooglePlaceForStore(apiKey, {
      name: input.name,
      address: input.address,
    });
    if (!place?.id) return input.fallback ?? [];
    return await getLatestGoogleReviewsFromLegacy(apiKey, place.id);
  } catch (error) {
    console.error("Failed to fetch latest google reviews:", error);
    return input.fallback ?? [];
  }
}

async function updateStoreExternalMeta(input: {
  storeId: number;
  externalRating: number | null;
  externalReviewCount: number | null;
}) {
  const sb = supabaseServer();
  const payload = {
    external_rating: input.externalRating,
    external_review_count: input.externalReviewCount ?? 0,
    updated_at: new Date().toISOString(),
  };

  const full = await sb.from("stores").update(payload).eq("id", input.storeId);
  if (!full.error) return;

  if (isMissingColumnError(full.error)) {
    const minimal = await sb
      .from("stores")
      .update({
        external_rating: payload.external_rating,
        external_review_count: payload.external_review_count,
      })
      .eq("id", input.storeId);
    if (!minimal.error) return;
    throw new Error(minimal.error.message);
  }

  throw new Error(full.error.message);
}

async function insertExternalReview(input: ExternalReviewInsertInput) {
  const sb = supabaseServer();
  const rating = Math.max(1, Math.min(5, input.rating));
  const content = input.content.trim();
  const authorName = input.authorName?.trim() || null;
  const createdAt =
    input.createdAt && !Number.isNaN(Date.parse(input.createdAt))
      ? new Date(input.createdAt).toISOString()
      : new Date().toISOString();

  if (!content) return false;

  const payload = {
    store_id: input.storeId,
    source: "external",
    rating,
    content,
    author_name: authorName,
    is_disclosed_ad: false,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  };

  for (const tableName of REVIEW_TABLE_CANDIDATES) {
    const full = await sb
      .from(tableName)
      .insert(payload)
      .select("id, store_id, source, rating, content, author_name, is_disclosed_ad, created_at")
      .single();

    if (!full.error) {
      const saved = normalizeReviewRow(full.data as Record<string, unknown>);
      await persistAnalysisForReview(saved);
      return true;
    }

    if (full.error.code === "23502" && /user_id/i.test(full.error.message)) {
      // Legacy schema can enforce non-null user_id on reviews table.
      continue;
    }

    if (isMissingColumnError(full.error)) {
      const minimal = await sb
        .from(tableName)
        .insert({
          store_id: input.storeId,
          rating,
          content,
          created_at: createdAt,
        })
        .select("id, store_id, rating, content, created_at")
        .single();

      if (!minimal.error) {
        const saved = normalizeReviewRow(minimal.data as Record<string, unknown>);
        await persistAnalysisForReview(saved);
        return true;
      }

      if (minimal.error.code === "23502" && /user_id/i.test(minimal.error.message)) {
        continue;
      }

      if (isMissingTableError(minimal.error)) continue;
      throw new Error(minimal.error.message);
    }

    if (isMissingTableError(full.error)) continue;
    throw new Error(full.error.message);
  }

  return false;
}

export async function importGoogleReviewsForRegisteredStores(options?: {
  limit?: number;
  offset?: number;
}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY 또는 GOOGLE_MAPS_API_KEY 환경변수가 필요합니다.");
  }

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(100, Math.floor(options.limit)))
      : 20;
  const offset =
    typeof options?.offset === "number" && Number.isFinite(options.offset)
      ? Math.max(0, Math.floor(options.offset))
      : 0;

  const sb = supabaseServer();
  const { data: stores, error } = await sb
    .from("stores")
    .select("id, name, address")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  const rows = (stores ?? []) as Array<{ id: number; name: string; address: string | null }>;

  let matchedCount = 0;
  let metaUpdatedCount = 0;
  let reviewInsertedCount = 0;
  let skippedDuplicateCount = 0;
  const affectedStoreIds = new Set<number>();

  for (const store of rows) {
    const place = await findGooglePlaceForStore(apiKey, store);
    if (!place) {
      await wait(120);
      continue;
    }

    matchedCount += 1;
    const details = await getGooglePlaceDetails(apiKey, place.name || place.id || "");
    const extRating =
      typeof details.rating === "number" && Number.isFinite(details.rating)
        ? details.rating
        : null;
    const extReviewCount =
      typeof details.userRatingCount === "number" && Number.isFinite(details.userRatingCount)
        ? Math.max(0, Math.round(details.userRatingCount))
        : null;

    await updateStoreExternalMeta({
      storeId: store.id,
      externalRating: extRating,
      externalReviewCount: extReviewCount,
    });
    metaUpdatedCount += 1;

    const existing = await loadReviewsByStoreIds([store.id]);
    const dedup = new Set(
      existing.map((review) =>
        buildReviewDedupKey({
          rating: review.rating,
          content: review.content,
          authorName: review.authorName,
        })
      )
    );

    for (const review of details.reviews ?? []) {
      const content = review.text?.text || review.originalText?.text || "";
      const rating =
        typeof review.rating === "number" && Number.isFinite(review.rating)
          ? review.rating
          : extRating ?? 3;
      const authorName = review.authorAttribution?.displayName || null;
      const key = buildReviewDedupKey({ rating, content, authorName });

      if (!content.trim()) continue;
      if (dedup.has(key)) {
        skippedDuplicateCount += 1;
        continue;
      }

      const inserted = await insertExternalReview({
        storeId: store.id,
        rating,
        content,
        authorName,
        createdAt: review.publishTime || null,
      });

      if (inserted) {
        reviewInsertedCount += 1;
        dedup.add(key);
      }
    }

    affectedStoreIds.add(store.id);
    await wait(140);
  }

  for (const storeId of affectedStoreIds) {
    await recomputeStoreMetrics(storeId);
  }

  return {
    scannedStoreCount: rows.length,
    matchedStoreCount: matchedCount,
    externalMetaUpdatedCount: metaUpdatedCount,
    reviewInsertedCount,
    skippedDuplicateCount,
    affectedStoreCount: affectedStoreIds.size,
    nextOffset: offset + rows.length,
    hasMore: rows.length === limit,
  };
}

type GoogleReviewAiResult = {
  found: boolean;
  place: {
    id: string | null;
    name: string | null;
    address: string | null;
    externalRating: number | null;
    externalReviewCount: number | null;
  } | null;
  summary: {
    reviewCount: number;
    trustScore: number;
    adSuspectRatio: number;
    fallbackUsed: boolean;
    providerCounts: {
      gemini: number;
      openai: number;
      heuristic: number;
    };
  } | null;
  reviews: Array<{
    authorName: string | null;
    rating: number;
    content: string;
    publishedAt: string | null;
    adAny: number;
    trustScore: number;
    reasonSummary: string;
    provider: "gemini" | "openai" | "heuristic";
  }>;
};

function isGoogleReviewAiResult(value: unknown): value is GoogleReviewAiResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.found === "boolean" && Array.isArray(row.reviews);
}

async function loadGoogleReviewCache(storeId: number) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("google_review_cache")
    .select("payload, updated_at")
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : null;
  const payload = (row as { payload?: unknown } | null)?.payload;
  if (!isGoogleReviewAiResult(payload)) return null;

  const updatedAt =
    typeof (row as { updated_at?: unknown } | null)?.updated_at === "string"
      ? ((row as { updated_at: string }).updated_at as string)
      : null;

  return {
    payload,
    updatedAt,
  };
}

async function saveGoogleReviewCache(storeId: number, payload: GoogleReviewAiResult) {
  const sb = supabaseServer();
  const { error } = await sb.from("google_review_cache").upsert(
    {
      store_id: storeId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" }
  );

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }
}

export async function getGoogleReviewsWithAiForStore(
  storeId: number,
  options?: { maxReviews?: number; forceRefresh?: boolean; maxAgeHours?: number }
) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY 또는 GOOGLE_MAPS_API_KEY 환경변수가 필요합니다.");
  }

  const maxReviews =
    typeof options?.maxReviews === "number" && Number.isFinite(options.maxReviews)
      ? Math.max(1, Math.min(5, Math.floor(options.maxReviews)))
      : 5;
  const forceRefresh = Boolean(options?.forceRefresh);
  const maxAgeHours =
    typeof options?.maxAgeHours === "number" && Number.isFinite(options.maxAgeHours)
      ? Math.max(1, Math.min(24 * 365, Math.floor(options.maxAgeHours)))
      : 24 * 7;

  if (!forceRefresh) {
    const cached = await loadGoogleReviewCache(storeId);
    if (cached?.payload) {
      const updatedAtMs = cached.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
      const ageMs = Date.now() - updatedAtMs;
      const ttlMs = maxAgeHours * 60 * 60 * 1000;
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ttlMs) {
        return cached.payload;
      }
    }
  }

  const sb = supabaseServer();
  const { data: store, error } = await sb
    .from("stores")
    .select("id, name, address")
    .eq("id", storeId)
    .single();

  if (error || !store) {
    throw new Error("가게 정보를 찾지 못했습니다.");
  }

  const place = await findGooglePlaceForStore(apiKey, {
    name: String((store as { name: unknown }).name ?? ""),
    address: typeof (store as { address: unknown }).address === "string"
      ? (store as { address: string }).address
      : null,
  });
  if (!place) {
    const noPlaceResult: GoogleReviewAiResult = {
      found: false,
      place: null,
      summary: {
        reviewCount: 0,
        trustScore: 0,
        adSuspectRatio: 0,
        fallbackUsed: false,
        providerCounts: {
          gemini: 0,
          openai: 0,
          heuristic: 0,
        },
      },
      reviews: [],
    };
    await saveGoogleReviewCache(storeId, noPlaceResult);
    return noPlaceResult;
  }

  const details = await getGooglePlaceDetails(apiKey, place.name || place.id || "");
  const newRows = (details.reviews ?? []).map((review) => ({
    authorName: review.authorAttribution?.displayName || null,
    rating:
      typeof review.rating === "number" && Number.isFinite(review.rating) ? review.rating : 3,
    content: review.text?.text || review.originalText?.text || "",
    publishedAt: review.publishTime || null,
  }));

  const sourceReviews = newRows
    .filter((row) => row.content.trim() !== "")
    .slice(0, maxReviews);

  const analyzed = await Promise.all(
    sourceReviews.map(async (review) => {
      const content = review.content;
      const rating =
        typeof review.rating === "number" && Number.isFinite(review.rating) ? review.rating : 3;
      const analysis = await analyzeReviewWithProvider({
        rating,
        content,
        isDisclosedAd: false,
      });
      const adAny = adAnyProbabilityFromAnalysis({
        adRisk: analysis.analysis.adRisk,
        undisclosedAdRisk: analysis.analysis.undisclosedAdRisk,
      });

      return {
        authorName: review.authorName,
        rating,
        content,
        publishedAt: review.publishedAt,
        adAny: round4(adAny),
        trustScore: round4(analysis.analysis.trustScore),
        reasonSummary: analysis.analysis.reasonSummary,
        provider: analysis.meta.provider,
      };
    })
  );

  const reviewCount = analyzed.length;
  const trustAvg =
    reviewCount > 0
      ? round4(analyzed.reduce((sum, r) => sum + r.trustScore, 0) / reviewCount)
      : 0;
  const adAvg =
    reviewCount > 0
      ? round4(analyzed.reduce((sum, r) => sum + r.adAny, 0) / reviewCount)
      : 0;
  const providerCounts = {
    gemini: analyzed.filter((r) => r.provider === "gemini").length,
    openai: analyzed.filter((r) => r.provider === "openai").length,
    heuristic: analyzed.filter((r) => r.provider === "heuristic").length,
  };

  const result: GoogleReviewAiResult = {
    found: true,
    place: {
      id: details.id ?? place.id ?? null,
      name:
        details.displayName?.text ||
        details.name ||
        place.displayName?.text ||
        place.name ||
        null,
      address: details.formattedAddress || place.formattedAddress || null,
      externalRating:
        typeof details.rating === "number" && Number.isFinite(details.rating)
          ? details.rating
          : null,
      externalReviewCount:
        typeof details.userRatingCount === "number" && Number.isFinite(details.userRatingCount)
          ? Math.round(details.userRatingCount)
          : null,
    },
    summary: {
      reviewCount,
      trustScore: trustAvg,
      adSuspectRatio: adAvg,
      fallbackUsed: providerCounts.heuristic > 0,
      providerCounts,
    },
    reviews: analyzed.filter((review) => review.content.trim() !== ""),
  };

  await saveGoogleReviewCache(storeId, result);
  return result;
}

type NaverSearchItem = {
  title?: string;
  description?: string;
  bloggername?: string;
  postdate?: string;
  originallink?: string;
  link?: string;
};

type NaverSignalResult = {
  source: "naver_search";
  query: string;
  trustScore: number;
  adSuspectRatio: number;
  itemCount: number;
  items: Array<{
    title: string;
    description: string;
    author: string | null;
    publishedAt: string | null;
    link: string | null;
  }>;
};

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function naverPostDateToIso(value: string | undefined) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

async function fetchNaverSearchDocuments(query: string, display = 8) {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_SEARCH_CLIENT_ID/NAVER_SEARCH_CLIENT_SECRET 환경변수가 필요합니다.");
  }

  const encoded = encodeURIComponent(query);
  const endpoints = [
    `https://openapi.naver.com/v1/search/blog.json?query=${encoded}&display=${display}&sort=sim`,
    `https://openapi.naver.com/v1/search/news.json?query=${encoded}&display=${display}&sort=sim`,
  ];

  const items: NaverSearchItem[] = [];
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    if (!response.ok) continue;
    const json = (await response.json()) as { items?: NaverSearchItem[] };
    items.push(...(json.items ?? []));
  }

  return items;
}

async function loadNaverSignalCache(storeId: number) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("naver_signal_cache")
    .select("payload, updated_at")
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : null;
  const payload = (row as { payload?: unknown } | null)?.payload;
  if (!payload || typeof payload !== "object") return null;

  const updatedAt =
    typeof (row as { updated_at?: unknown } | null)?.updated_at === "string"
      ? ((row as { updated_at: string }).updated_at as string)
      : null;

  return { payload: payload as NaverSignalResult, updatedAt };
}

async function saveNaverSignalCache(storeId: number, payload: NaverSignalResult) {
  const sb = supabaseServer();
  const { error } = await sb.from("naver_signal_cache").upsert(
    {
      store_id: storeId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" }
  );
  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }
}

export async function getNaverSignalsForStore(
  storeId: number,
  options?: { forceRefresh?: boolean; maxAgeHours?: number; display?: number }
) {
  const forceRefresh = Boolean(options?.forceRefresh);
  const maxAgeHours =
    typeof options?.maxAgeHours === "number" && Number.isFinite(options.maxAgeHours)
      ? Math.max(1, Math.min(24 * 365, Math.floor(options.maxAgeHours)))
      : 24 * 7;
  const display =
    typeof options?.display === "number" && Number.isFinite(options.display)
      ? Math.max(3, Math.min(15, Math.floor(options.display)))
      : 8;

  if (!forceRefresh) {
    const cached = await loadNaverSignalCache(storeId);
    if (cached?.payload) {
      const updatedAtMs = cached.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
      const ageMs = Date.now() - updatedAtMs;
      const ttlMs = maxAgeHours * 60 * 60 * 1000;
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ttlMs) {
        return cached.payload;
      }
    }
  }

  const sb = supabaseServer();
  const { data: store, error } = await sb
    .from("stores")
    .select("id, name, address")
    .eq("id", storeId)
    .single();
  if (error || !store) throw new Error("가게 정보를 찾지 못했습니다.");

  const name = String((store as { name: unknown }).name ?? "");
  const address =
    typeof (store as { address: unknown }).address === "string"
      ? (store as { address: string }).address
      : "";
  const query = `${name} ${address}`.trim();

  const docs = await fetchNaverSearchDocuments(query, display);
  const normalized = docs
    .map((item) => ({
      title: stripHtml(item.title ?? ""),
      description: stripHtml(item.description ?? ""),
      author: item.bloggername ?? null,
      publishedAt: naverPostDateToIso(item.postdate),
      link: item.originallink || item.link || null,
    }))
    .filter((item) => item.title || item.description)
    .slice(0, 12);

  const analyzed = await Promise.all(
    normalized.map(async (doc) => {
      const content = `${doc.title} ${doc.description}`.trim();
      const ai = await analyzeReviewWithProvider({
        rating: 3,
        content,
        isDisclosedAd: false,
      });
      const adAny = adAnyProbabilityFromAnalysis({
        adRisk: ai.analysis.adRisk,
        undisclosedAdRisk: ai.analysis.undisclosedAdRisk,
      });
      return {
        trustScore: ai.analysis.trustScore,
        adAny,
      };
    })
  );

  const itemCount = analyzed.length;
  const trustScore =
    itemCount > 0
      ? round4(analyzed.reduce((sum, row) => sum + row.trustScore, 0) / itemCount)
      : 0;
  const adSuspectRatio =
    itemCount > 0 ? round4(analyzed.reduce((sum, row) => sum + row.adAny, 0) / itemCount) : 0;

  const result: NaverSignalResult = {
    source: "naver_search",
    query,
    trustScore,
    adSuspectRatio,
    itemCount,
    items: normalized,
  };

  await saveNaverSignalCache(storeId, result);
  return result;
}
