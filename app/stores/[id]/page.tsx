import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreDetail } from "@/src/lib/store-service";
import { ReviewForm } from "@/app/stores/[id]/review-form";

type Props = {
  params: Promise<{ id: string }>;
};

interface StoreDetail {
  store: {
    name: string;
    address: string | null;
  };
  summary: {
    adSuspectRatio: number;
    trustScore: number;
    weightedRating: number | null;
    appAverageRating: number | null;
    reviewCount: number;
    positiveRatio: number;
    lastAnalyzedAt: string | null;
  };
  reviews: Array<{
    source: string;
    id: string;
    createdAt: string;
    rating: number;
    content: string;
    authorName: string | null;
    authorStats?: {
      reviewCount: number;
      averageRating: number;
    } | null;
    latestAnalysis: {
      adRisk: number;
      undisclosedAdRisk: number;
      trustScore: number;
      reasonSummary: string;
    } | null;
  }>;
  photos?: Array<{
    url: string;
    label: string;
  }>;
}

const ADSENSE_CLIENT = "ca-pub-6051453612452994";
const ADSENSE_SLOT_PLACEHOLDER = "REPLACE_WITH_AD_SLOT";

function AdPlaceholder({ label }: { label: string }) {
  return (
    <div
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={ADSENSE_SLOT_PLACEHOLDER}
      style={{
        border: "1px dashed #c9b99e",
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 12,
        color: "#8C7051",
        background: "#faf8f5",
        textAlign: "center",
      }}
    >
      광고 영역 ({label}) · 슬롯 ID 입력 후 활성화
    </div>
  );
}

export default async function StorePage({ params }: Props) {
  const resolved = await params;
  const storeId = Number(resolved.id);
  if (!storeId) notFound();

  const detail = await getStoreDetail(storeId).catch(() => null) as StoreDetail | null;
  if (!detail) notFound();

  const adPct = Math.round(detail.summary.adSuspectRatio * 100);
  const trustPoint = Math.round(detail.summary.trustScore * 100);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <Link 
        href="/" 
        style={{ 
          color: "#8C7051", 
          textDecoration: "none",
          transition: "color 0.2s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#47682C";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#8C7051";
        }}
      >
        ← 목록으로
      </Link>

      <h1 style={{ marginTop: 12, fontSize: 30, fontWeight: 800, color: "#28502E" }}>{detail.store.name}</h1>
      <div style={{ marginTop: 6, color: "#8C7051" }}>{detail.store.address ?? "-"}</div>

      {/* 가게 사진 */}
      {detail.photos && detail.photos.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 20 }}>
          {/* 대표 사진 */}
          {detail.photos[0] && (
            <img
              src={detail.photos[0].url}
              alt={`${detail.store.name} 대표 사진`}
              style={{
                width: "100%",
                maxHeight: 250,
                objectFit: "cover",
                borderRadius: 12,
                marginBottom: 8,
              }}
            />
          )}
          {/* 리뷰 사진 */}
          {detail.photos.length > 1 && (
            <div style={{ display: "flex", gap: 8 }}>
              {detail.photos.slice(1, 3).map((photo, idx) => (
                <img
                  key={idx}
                  src={photo.url}
                  alt={`${detail.store.name} 리뷰 사진 ${idx + 1}`}
                  style={{
                    flex: 1,
                    maxHeight: 150,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <section
        style={{
          marginTop: 20,
          border: "1px solid #c9b99e",
          borderRadius: 14,
          padding: 16,
          display: "grid",
          gap: 10,
          background: "linear-gradient(180deg, #faf8f5 0%, #f0ede6 100%)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, color: "#28502E" }}>점수 요약</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, color: "#2d2d2d" }}>
          <span>신뢰가중 평점: {detail.summary.weightedRating?.toFixed(1) ?? "-"}</span>
          <span style={{ color: "#47682C", fontWeight: 700 }}>
            ★ 앱 점수: {detail.summary.appAverageRating?.toFixed(1) ?? "-"}
          </span>
          <span>리뷰 수: {detail.summary.reviewCount}</span>
          <span>광고 의심 비율: {adPct}%</span>
          <span>리뷰 신뢰 점수: {trustPoint}점</span>
          <span>긍정 비율: {Math.round(detail.summary.positiveRatio * 100)}%</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#8C7051" }}>
          AI 분석 기반 자동추정이며 법적 확정 판단이 아닙니다.
          {detail.summary.lastAnalyzedAt
            ? ` 마지막 분석: ${new Date(detail.summary.lastAnalyzedAt).toLocaleString("ko-KR")}`
            : ""}
        </div>
        <AdPlaceholder label="점수 요약 하단" />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#28502E" }}>리뷰 작성</h2>
        <ReviewForm storeId={storeId} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#28502E" }}>전체 리뷰 ({detail.reviews.length})</h2>
        <div style={{ marginTop: 12 }}>
          <AdPlaceholder label="리뷰 리스트 상단" />
        </div>

        <ul style={{ marginTop: 14, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {detail.reviews.map((review) => {
            const adAny = review.latestAnalysis
              ? 1 -
                (1 - review.latestAnalysis.adRisk) *
                  (1 - review.latestAnalysis.undisclosedAdRisk)
              : null;

            return (
              <li
                key={`${review.source}-${review.id}-${review.createdAt}`}
                style={{
                  border: "1px solid rgba(140, 112, 81, 0.3)",
                  borderRadius: 12,
                  padding: 14,
                  background: (adAny ?? 0) >= 0.6 ? "#fff0f0" : "#faf8f5",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14, color: "#2d2d2d" }}>
                  <strong>{review.rating.toFixed(1)}점</strong>
                  <span>{review.source === "external" ? "외부" : "앱"}</span>
                  <span style={{ color: "#47682C", fontWeight: 700 }}>
                    ★ 앱 점수 {detail.summary.appAverageRating?.toFixed(1) ?? "-"}
                  </span>
                  {review.authorStats && (
                    <span>
                      작성자 리뷰 {review.authorStats.reviewCount}개 · 평균 {review.authorStats.averageRating.toFixed(1)}점
                    </span>
                  )}
                </div>
                <p style={{ marginTop: 8, lineHeight: 1.5, color: "#2d2d2d" }}>{review.content}</p>
                {review.latestAnalysis ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#8C7051" }}>
                    근거: {review.latestAnalysis.reasonSummary}
                  </div>
                ) : null}
                <div style={{ marginTop: 6, fontSize: 12, color: "#8C7051" }}>
                  {review.authorName ?? "익명"} · {new Date(review.createdAt).toLocaleString("ko-KR")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section style={{ marginTop: 28 }}>
        <AdPlaceholder label="페이지 하단" />
      </section>
    </main>
  );
}
