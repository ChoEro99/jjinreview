"use client";

import React, { useState, useEffect } from "react";

interface StoreBase {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface StoreSummary {
  weightedRating: number | null;
  adSuspectRatio: number;
  trustScore: number;
  positiveRatio: number;
  reviewCount: number;
  inappReviewCount: number;
  externalReviewCount: number;
  lastAnalyzedAt: string | null;
}

interface StoreWithSummary extends StoreBase {
  summary: StoreSummary;
}

interface HomeInteractiveProps {
  stores: StoreWithSummary[];
}

interface StoreDetail {
  store: {
    name: string;
    address: string | null;
  };
  summary: {
    adSuspectRatio: number;
    trustScore: number;
    weightedRating: number | null;
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
    latestAnalysis: {
      adRisk: number;
      undisclosedAdRisk: number;
      trustScore: number;
      reasonSummary: string;
    } | null;
  }>;
}

const HomeInteractive = ({ stores: initialStores }: HomeInteractiveProps) => {
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stores, setStores] = useState<StoreWithSummary[]>(initialStores);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [storeDetail, setStoreDetail] = useState<StoreDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    
    // Debounce resize event to improve performance
    let resizeTimeout: NodeJS.Timeout;
    const debouncedCheckMobile = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkMobile, 150);
    };
    
    window.addEventListener("resize", debouncedCheckMobile);
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", debouncedCheckMobile);
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setStores(initialStores);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch("/api/stores/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), limit: 20 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.stores) {
          setStores(data.stores);
        }
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleStoreClick = async (storeId: number) => {
    setSelectedStoreId(storeId);
    setIsLoadingDetail(true);
    setStoreDetail(null);

    try {
      const response = await fetch(`/api/stores/${storeId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setStoreDetail(data);
        }
      }
    } catch (error) {
      console.error("Failed to load store detail:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const showDetailPane = selectedStoreId !== null;

  // Calculate combined ad risk probability from individual risk scores
  const calculateCombinedAdRisk = (adRisk: number, undisclosedAdRisk: number): number => {
    // Formula: P(A or B) = 1 - P(not A) * P(not B)
    return 1 - (1 - adRisk) * (1 - undisclosedAdRisk);
  };

  const HEADER_AND_SEARCH_HEIGHT = 280; // Height of header + search form + padding

  return (
    <div style={{ minHeight: "100vh", background: "#f9f9f9" }}>
      <header
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "24px 20px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0 }}>찐리뷰</h1>
        <p style={{ marginTop: 8, fontSize: 16, opacity: 0.95 }}>
          AI가 분석하는 진짜 리뷰, 광고 의심 리뷰를 걸러내는 신뢰할 수 있는 리뷰 플랫폼
        </p>
      </header>

      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: isMobile ? "1fr" : showDetailPane ? "1fr 2fr" : "1fr",
          gap: 0,
          minWidth: 0,
        }}
      >
        <aside
          style={{
            minWidth: 0,
            background: "#ffffff",
            borderRight: isMobile ? "none" : "1px solid #e0e0e0",
            display: isMobile && showDetailPane ? "none" : "block",
          }}
        >
          <div style={{ padding: 20 }}>
            <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="가게 이름이나 주소로 검색..."
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontSize: 15,
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={isSearching}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "12px 16px",
                  background: isSearching ? "#ccc" : "#667eea",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: isSearching ? "not-allowed" : "pointer",
                }}
              >
                {isSearching ? "검색 중..." : "검색"}
              </button>
            </form>

            <div style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
              총 {stores.length}개 가게
            </div>

            <div style={{ maxHeight: `calc(100vh - ${HEADER_AND_SEARCH_HEIGHT}px)`, overflowY: "auto" }}>
              {stores.map((store) => {
                const isSelected = selectedStoreId === store.id;
                const adPct = Math.round(store.summary.adSuspectRatio * 100);
                const trustPoint = Math.round(store.summary.trustScore * 100);

                return (
                  <div
                    key={store.id}
                    onClick={() => handleStoreClick(store.id)}
                    style={{
                      padding: 14,
                      marginBottom: 10,
                      border: isSelected ? "2px solid #667eea" : "1px solid #ddd",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: isSelected ? "#f0f4ff" : "#fff",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                      {store.name}
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                      {store.address ?? "주소 정보 없음"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "#667eea" }}>
                        ⭐ {store.summary.weightedRating?.toFixed(1) ?? "-"}
                      </span>
                      <span>리뷰 {store.summary.reviewCount}</span>
                      <span style={{ color: adPct >= 30 ? "#e53e3e" : "#666" }}>
                        광고의심 {adPct}%
                      </span>
                      <span>신뢰도 {trustPoint}점</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section
          style={{
            padding: isMobile ? 20 : 24,
            display: showDetailPane ? "block" : "none",
            minWidth: 0,
            maxWidth: "100%",
            overflow: "auto",
            background: "#ffffff",
          }}
        >
          {isMobile && (
            <button
              onClick={() => setSelectedStoreId(null)}
              style={{
                marginBottom: 16,
                padding: "8px 16px",
                background: "#f0f0f0",
                border: "1px solid #ddd",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ← 목록으로
            </button>
          )}

          {isLoadingDetail && (
            <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
              로딩 중...
            </div>
          )}

          {!isLoadingDetail && storeDetail && (
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
                {storeDetail.store.name}
              </h2>
              <div style={{ color: "#666", marginBottom: 20 }}>
                {storeDetail.store.address ?? "-"}
              </div>

              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 14,
                  padding: 16,
                  background: "linear-gradient(180deg, #ffffff 0%, #f8fcff 100%)",
                  marginBottom: 24,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>점수 요약</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 14 }}>
                  <span>
                    신뢰가중 평점: {storeDetail.summary.weightedRating?.toFixed(1) ?? "-"}
                  </span>
                  <span>리뷰 수: {storeDetail.summary.reviewCount}</span>
                  <span>
                    광고 의심 비율: {Math.round(storeDetail.summary.adSuspectRatio * 100)}%
                  </span>
                  <span>
                    리뷰 신뢰 점수: {Math.round(storeDetail.summary.trustScore * 100)}점
                  </span>
                  <span>
                    긍정 비율: {Math.round(storeDetail.summary.positiveRatio * 100)}%
                  </span>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
                  AI 분석 기반 자동추정이며 법적 확정 판단이 아닙니다.
                  {storeDetail.summary.lastAnalyzedAt
                    ? ` 마지막 분석: ${new Date(storeDetail.summary.lastAnalyzedAt).toLocaleString("ko-KR")}`
                    : ""}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
                  전체 리뷰 ({storeDetail.reviews.length})
                </h3>

                <div style={{ display: "grid", gap: 12 }}>
                  {storeDetail.reviews.map((review) => {
                    const adAny = review.latestAnalysis
                      ? calculateCombinedAdRisk(
                          review.latestAnalysis.adRisk,
                          review.latestAnalysis.undisclosedAdRisk
                        )
                      : null;

                    return (
                      <div
                        key={`${review.source}-${review.id}`}
                        style={{
                          border: "1px solid #ddd",
                          borderRadius: 12,
                          padding: 14,
                          background: (adAny ?? 0) >= 0.6 ? "#fff8f8" : "#fff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 12,
                            fontSize: 14,
                            marginBottom: 8,
                          }}
                        >
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
                        <p style={{ lineHeight: 1.5, margin: "8px 0" }}>{review.content}</p>
                        {review.latestAnalysis && (
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                            근거: {review.latestAnalysis.reasonSummary}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {review.authorName ?? "익명"} ·{" "}
                          {new Date(review.createdAt).toLocaleString("ko-KR")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!isLoadingDetail && !storeDetail && showDetailPane && (
            <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
              가게 정보를 불러오지 못했습니다.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomeInteractive;