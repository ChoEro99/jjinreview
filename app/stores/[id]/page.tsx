import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/src/lib/supabaseServer";

export const revalidate = 900;

type RouteProps = {
  params: Promise<{ id: string }>;
};

type StoreRow = {
  id: number;
  name: string;
  address: string | null;
  externalRating: number | null;
  externalReviewCount: number;
  updatedAt: string | null;
};

type MetricRow = {
  weightedRating: number | null;
  trustScore: number;
  adSuspectRatio: number;
  reviewCount: number;
  inappReviewCount: number;
  externalReviewCount: number;
  lastAnalyzedAt: string | null;
};

type ReviewSnippet = {
  source: "external" | "inapp";
  rating: number;
  content: string;
  authorName: string | null;
  createdAt: string;
};

function toNumber(value: unknown, fallback: number | null = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isMissingColumnError(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function loadStore(id: number): Promise<StoreRow | null> {
  const sb = supabaseServer();
  const full = await sb
    .from("stores")
    .select("id, name, address, external_rating, external_review_count, updated_at")
    .eq("id", id)
    .single();

  if (!full.error) {
    const row = full.data as Record<string, unknown>;
    return {
      id: toNumber(row.id, 0) ?? 0,
      name: typeof row.name === "string" ? row.name : "이름없음",
      address: typeof row.address === "string" ? row.address : null,
      externalRating: toNumber(row.external_rating),
      externalReviewCount: Math.max(0, toNumber(row.external_review_count, 0) ?? 0),
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    };
  }

  if (!isMissingColumnError(full.error)) return null;

  const minimal = await sb
    .from("stores")
    .select("id, name, address, external_rating, external_review_count")
    .eq("id", id)
    .single();

  if (minimal.error) return null;

  const row = minimal.data as Record<string, unknown>;
  return {
    id: toNumber(row.id, 0) ?? 0,
    name: typeof row.name === "string" ? row.name : "이름없음",
    address: typeof row.address === "string" ? row.address : null,
    externalRating: toNumber(row.external_rating),
    externalReviewCount: Math.max(0, toNumber(row.external_review_count, 0) ?? 0),
    updatedAt: null,
  };
}

async function loadMetrics(id: number): Promise<MetricRow | null> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("store_metrics")
    .select(
      "weighted_rating, trust_score, ad_suspect_ratio, review_count, inapp_review_count, external_review_count, last_analyzed_at"
    )
    .eq("store_id", id)
    .single();

  if (error) {
    if (isMissingTableError(error)) return null;
    return null;
  }

  const row = data as Record<string, unknown>;
  return {
    weightedRating: toNumber(row.weighted_rating),
    trustScore: toNumber(row.trust_score, 0.5) ?? 0.5,
    adSuspectRatio: toNumber(row.ad_suspect_ratio, 0) ?? 0,
    reviewCount: Math.max(0, toNumber(row.review_count, 0) ?? 0),
    inappReviewCount: Math.max(0, toNumber(row.inapp_review_count, 0) ?? 0),
    externalReviewCount: Math.max(0, toNumber(row.external_review_count, 0) ?? 0),
    lastAnalyzedAt: typeof row.last_analyzed_at === "string" ? row.last_analyzed_at : null,
  };
}

async function loadReviewSnippets(id: number): Promise<ReviewSnippet[]> {
  const sb = supabaseServer();
  const merged: ReviewSnippet[] = [];

  const external = await sb
    .from("reviews")
    .select("source, rating, content, author_name, created_at")
    .eq("store_id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!external.error) {
    for (const row of (external.data ?? []) as Array<Record<string, unknown>>) {
      const content = typeof row.content === "string" ? row.content.trim() : "";
      if (!content) continue;
      merged.push({
        source: row.source === "external" ? "external" : "inapp",
        rating: Math.max(1, Math.min(5, toNumber(row.rating, 3) ?? 3)),
        content,
        authorName: typeof row.author_name === "string" ? row.author_name : null,
        createdAt:
          typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      });
    }
  }

  const inapp = await sb
    .from("user_reviews")
    .select("rating, comment, created_at")
    .eq("store_id", id)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!inapp.error && Array.isArray(inapp.data)) {
    for (const row of inapp.data as Array<Record<string, unknown>>) {
      const comment = typeof row.comment === "string" ? row.comment.trim() : "";
      if (!comment) continue;
      merged.push({
        source: "inapp",
        rating: Math.max(0.5, Math.min(5, toNumber(row.rating, 3) ?? 3)),
        content: comment,
        authorName: null,
        createdAt:
          typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      });
    }
  }

  return merged
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6);
}

const getStorePageData = cache(async (id: number) => {
  const store = await loadStore(id);
  if (!store) return null;

  const [metrics, reviewSnippets] = await Promise.all([loadMetrics(id), loadReviewSnippets(id)]);
  const reviewCount = metrics?.reviewCount ?? reviewSnippets.length;
  const combinedReviewCount = Math.max(
    reviewCount,
    metrics?.externalReviewCount ?? 0,
    store.externalReviewCount
  );
  const textPayload = reviewSnippets.map((snippet) => snippet.content).join(" ").trim();
  const hasEnoughContent =
    Boolean(store.address && store.address.length >= 8) ||
    textPayload.length >= 120 ||
    combinedReviewCount >= 3;

  return {
    store,
    metrics,
    reviewSnippets,
    hasEnoughContent,
    combinedReviewCount,
  };
});

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const resolved = await params;
  const storeId = Number(resolved.id);
  if (!Number.isFinite(storeId) || storeId <= 0) {
    return {
      title: "가게를 찾을 수 없습니다 | 리뷰랩",
      robots: { index: false, follow: false },
    };
  }

  const data = await getStorePageData(storeId);
  if (!data) {
    return {
      title: "가게를 찾을 수 없습니다 | 리뷰랩",
      robots: { index: false, follow: false },
    };
  }

  const ratingText =
    typeof data.metrics?.weightedRating === "number"
      ? `${data.metrics.weightedRating.toFixed(1)}점`
      : "평점 집계 준비중";
  const description = `${data.store.name} 리뷰 분석 페이지. ${data.store.address ?? "주소 정보 없음"} · 종합 평점 ${ratingText} · 리뷰 ${data.combinedReviewCount}개`;

  return {
    title: `${data.store.name} 평점/리뷰 분석 | 리뷰랩`,
    description,
    alternates: {
      canonical: `/stores/${data.store.id}`,
    },
    robots: data.hasEnoughContent
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function StorePage({ params }: RouteProps) {
  const resolved = await params;
  const storeId = Number(resolved.id);
  if (!Number.isFinite(storeId) || storeId <= 0) notFound();

  const data = await getStorePageData(storeId);
  if (!data) notFound();

  const { store, metrics, reviewSnippets, combinedReviewCount } = data;
  const weightedRating = metrics?.weightedRating ?? store.externalRating ?? null;
  const trustPercent = Math.round((metrics?.trustScore ?? 0.5) * 100);
  const adRiskPercent = Math.round((metrics?.adSuspectRatio ?? 0) * 100);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: store.name,
    address: store.address ?? undefined,
    aggregateRating:
      weightedRating !== null
        ? {
            "@type": "AggregateRating",
            ratingValue: weightedRating,
            reviewCount: combinedReviewCount,
          }
        : undefined,
  };

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 18px 40px" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav style={{ marginBottom: 18, fontSize: 13 }}>
        <Link href="/" style={{ color: "#28502E", textDecoration: "underline" }}>
          홈
        </Link>
      </nav>

      <h1 style={{ fontSize: 30, lineHeight: 1.3, fontWeight: 800, color: "#28502E" }}>
        {store.name} 리뷰 분석
      </h1>
      <p style={{ color: "#6f5c44", marginTop: 8, marginBottom: 18 }}>
        {store.address ?? "주소 정보가 아직 등록되지 않았습니다."}
      </p>

      <section
        style={{
          border: "1px solid rgba(140,112,81,0.3)",
          borderRadius: 12,
          padding: 16,
          background: "rgba(71,104,44,0.06)",
          marginBottom: 20,
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#28502E" }}>
          종합 평점:{" "}
          <strong>{typeof weightedRating === "number" ? weightedRating.toFixed(1) : "-"}</strong>
        </p>
        <p style={{ margin: "0 0 8px", color: "#28502E" }}>
          리뷰 수: <strong>{combinedReviewCount}</strong>
        </p>
        <p style={{ margin: "0 0 8px", color: "#28502E" }}>
          평점 신뢰 지수: <strong>{trustPercent}점</strong>
        </p>
        <p style={{ margin: 0, color: "#28502E" }}>
          광고 의심 비율: <strong>{adRiskPercent}%</strong>
        </p>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#28502E", marginBottom: 10 }}>
          리뷰 요약
        </h2>
        <p style={{ color: "#28502E", lineHeight: 1.65 }}>
          이 페이지는 가게의 외부 평점, 앱 내 평점, 리뷰 개수, 신뢰 지수 지표를 함께 보여줍니다.
          리뷰 데이터를 기반으로 평점의 안정성과 광고성 의심 비율을 함께 확인할 수 있습니다.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#28502E", marginBottom: 10 }}>
          최근 리뷰 발췌
        </h2>
        {reviewSnippets.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {reviewSnippets.map((snippet, index) => (
              <article
                key={`${snippet.source}-${index}-${snippet.createdAt}`}
                style={{
                  border: "1px solid rgba(140,112,81,0.3)",
                  borderRadius: 10,
                  padding: 12,
                  background: "rgba(255,255,255,0.82)",
                }}
              >
                <p style={{ margin: "0 0 8px", color: "#28502E", fontWeight: 700 }}>
                  {snippet.source === "external" ? "외부 리뷰" : "앱 리뷰"} · {snippet.rating.toFixed(1)}
                  점
                </p>
                <p style={{ margin: "0 0 8px", color: "#28502E", lineHeight: 1.55 }}>
                  {snippet.content}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "#6f5c44" }}>
                  {snippet.authorName ?? "익명"} ·{" "}
                  {new Date(snippet.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: "#6f5c44" }}>
            표시할 리뷰가 아직 없습니다. 리뷰가 누적되면 상세 분석 내용이 확장됩니다.
          </p>
        )}
      </section>

      <section style={{ marginTop: 26 }}>
        <Link
          href={`/?storeId=${store.id}`}
          style={{ color: "#28502E", textDecoration: "underline", fontWeight: 700 }}
        >
          인터랙티브 상세 화면으로 이동
        </Link>
      </section>
    </main>
  );
}
