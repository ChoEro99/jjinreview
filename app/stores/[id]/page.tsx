import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreDetail } from "@/src/lib/store-service";
import { ReviewForm } from "@/app/stores/[id]/review-form";
import { AdSense } from "@/app/components/AdSense";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function StorePage({ params }: Props) {
  const resolved = await params;
  const storeId = Number(resolved.id);
  if (!storeId) notFound();

  const detail = await getStoreDetail(storeId).catch(() => null);
  if (!detail) notFound();

  const adPct = Math.round(detail.summary.adSuspectRatio * 100);
  const trustPoint = Math.round(detail.summary.trustScore * 100);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <Link href="/" style={{ color: "#666", textDecoration: "none" }}>
        ← 목록으로
      </Link>

      <h1 style={{ marginTop: 12, fontSize: 30, fontWeight: 800 }}>{detail.store.name}</h1>
      <div style={{ marginTop: 6, color: "#666" }}>{detail.store.address ?? "-"}</div>

      <section
        style={{
          marginTop: 20,
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 16,
          display: "grid",
          gap: 10,
          background: "linear-gradient(180deg, #ffffff 0%, #f8fcff 100%)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>점수 요약</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <span>신뢰가중 평점: {detail.summary.weightedRating?.toFixed(1) ?? "-"}</span>
          <span>리뷰 수: {detail.summary.reviewCount}</span>
          <span>광고 의심 비율: {adPct}%</span>
          <span>리뷰 신뢰 점수: {trustPoint}점</span>
          <span>긍정 비율: {Math.round(detail.summary.positiveRatio * 100)}%</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
          AI 분석 기반 자동추정이며 법적 확정 판단이 아닙니다.
          {detail.summary.lastAnalyzedAt
            ? ` 마지막 분석: ${new Date(detail.summary.lastAnalyzedAt).toLocaleString("ko-KR")}`
            : ""}
        </div>
        <AdSense label="점수 요약 하단" />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>리뷰 작성</h2>
        <ReviewForm storeId={storeId} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>전체 리뷰 ({detail.reviews.length})</h2>
        <div style={{ marginTop: 12 }}>
          <AdSense label="리뷰 리스트 상단" />
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
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  background: (adAny ?? 0) >= 0.6 ? "#fff8f8" : "#fff",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 14 }}>
                  <strong>{review.rating.toFixed(1)}점</strong>
                  <span>{review.source === "external" ? "외부" : "앱"}</span>
                  <span>
                    광고의심 {adAny !== null ? `${Math.round(adAny * 100)}%` : "분석 대기"}
                  </span>
                  <span>
                    신뢰도{" "}
                    {review.latestAnalysis
                      ? `${Math.round(review.latestAnalysis.trustScore * 100)}점`
                      : "분석 대기"}
                  </span>
                </div>
                <p style={{ marginTop: 8, lineHeight: 1.5 }}>{review.content}</p>
                {review.latestAnalysis ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                    근거: {review.latestAnalysis.reasonSummary}
                  </div>
                ) : null}
                <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                  {review.authorName ?? "익명"} · {new Date(review.createdAt).toLocaleString("ko-KR")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section style={{ marginTop: 28 }}>
        <AdSense label="페이지 하단" />
      </section>
    </main>
  );
}