"use client";

import React, { useState, useEffect, useCallback } from "react";
import { computeRatingTrustScore } from "@/src/lib/rating-trust-score";

// Rating trust score label mapping
const RATING_TRUST_LABEL_MAPPING: Record<string, string> = {
  "매우 신뢰": "안정적 평점",
  "신뢰 가능": "안정적 평점",
};

interface StoreBase {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  externalRating?: number | null;
  externalReviewCount?: number | null;
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
  insight?: {
    comparedStores?: Array<{
      id: number;
      name: string;
      address: string | null;
      rank: number;
      rating: number;
      reviewCount: number;
      isSelf: boolean;
    }>;
    ratingTrustScore?: {
      totalScore: number;
      breakdown: { sampleSize: number; naturalness: number };
      label: string;
      emoji: string;
    };
    rating: number | null;
    reviewCount: number;
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
  photos?: string[];
  photosFull?: string[];
}

const HomeInteractive = ({ stores: initialStores }: HomeInteractiveProps) => {
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stores, setStores] = useState<StoreWithSummary[]>(initialStores);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [storeDetail, setStoreDetail] = useState<StoreDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);
  const [hoveredCompareId, setHoveredCompareId] = useState<number | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<number>>(new Set());

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

  const handleNextPhoto = useCallback(() => {
    const photos = storeDetail?.photosFull;
    if (!photos) return;
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  }, [storeDetail?.photosFull]);

  const handlePrevPhoto = useCallback(() => {
    const photos = storeDetail?.photosFull;
    if (!photos) return;
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [storeDetail?.photosFull]);

  // Keyboard navigation for photo modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photoModalOpen) return;
      
      if (e.key === "Escape") {
        setPhotoModalOpen(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevPhoto();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextPhoto();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [photoModalOpen, handleNextPhoto, handlePrevPhoto]);

  const handlePhotoClick = (index: number) => {
    setCurrentPhotoIndex(index);
    setPhotoModalOpen(true);
  };

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
    setFailedPhotos(new Set()); // Reset failed photos for new store

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
    <div style={{ minHeight: "100vh", background: "rgba(71, 104, 44, 0.08)", color: "#28502E" }}>
      <header
        style={{
          background: "#28502E",
          color: "#ffffff",
          padding: "24px 20px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, color: "#ffffff" }}>리뷰랩</h1>
        <p style={{ marginTop: 8, fontSize: 16, opacity: 1, color: "#e8dfc9" }}>
          이 평점 믿어도 될까? AI가 분석해주는 평점 믿음 수치
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
            background: "rgba(71, 104, 44, 0.06)",
            borderRight: isMobile ? "none" : "1px solid rgba(140, 112, 81, 0.3)",
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
                  border: "1px solid rgba(140, 112, 81, 0.3)",
                  borderRadius: 8,
                  fontSize: 15,
                  outline: "none",
                  background: "rgba(71, 104, 44, 0.04)",
                  color: "#28502E",
                }}
              />
              <button
                type="submit"
                disabled={isSearching}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "12px 16px",
                  background: isSearching ? "#ccc" : "#28502E",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: isSearching ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSearching) {
                    e.currentTarget.style.background = "#47682C";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSearching) {
                    e.currentTarget.style.background = "#28502E";
                  }
                }}
              >
                {isSearching ? "검색 중..." : "검색"}
              </button>
            </form>

            <div style={{ fontSize: 14, color: "#8C7051", marginBottom: 12 }}>
              총 {stores.length}개 가게
            </div>

            <div style={{ maxHeight: `calc(100vh - ${HEADER_AND_SEARCH_HEIGHT}px)`, overflowY: "auto" }}>
              {stores.map((store) => {
                const isSelected = selectedStoreId === store.id;
                const isHovered = hoveredCardId === store.id;
                
                // Compute rating trust score for each store
                const ratingTrust = computeRatingTrustScore(
                  store.externalRating ?? null,
                  Math.max(store.summary.externalReviewCount ?? 0, store.externalReviewCount ?? 0)
                );

                return (
                  <div
                    key={store.id}
                    onClick={() => handleStoreClick(store.id)}
                    onMouseEnter={() => setHoveredCardId(store.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    style={{
                      padding: 14,
                      marginBottom: 10,
                      border: isSelected ? "2px solid #28502E" : "1px solid rgba(140, 112, 81, 0.4)",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: isSelected ? "rgba(40, 80, 46, 0.15)" : isHovered ? "rgba(71, 104, 44, 0.18)" : "rgba(71, 104, 44, 0.1)",
                      transition: "all 0.2s ease",
                      boxShadow: isHovered ? "0 2px 8px rgba(140, 112, 81, 0.2)" : "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: "#28502E" }}>
                      {store.name}
                    </div>
                    <div style={{ fontSize: 13, color: "#8C7051", marginBottom: 8 }}>
                      {store.address ?? "주소 정보 없음"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "#28502E" }}>
                        ⭐ {store.summary.weightedRating?.toFixed(1) ?? "-"}
                      </span>
                      <span style={{ color: "#28502E" }}>
                        {/* Use max of summary (cached) and direct externalReviewCount to handle stale cache */}
                        리뷰 {Math.max(store.summary.reviewCount, store.summary.externalReviewCount, store.externalReviewCount ?? 0)}
                      </span>
                      <span style={{ color: "#28502E" }}>{ratingTrust.emoji} {ratingTrust.totalScore}점</span>
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
            background: "rgba(40, 80, 46, 0.05)",
          }}
        >
          {isMobile && (
            <button
              onClick={() => setSelectedStoreId(null)}
              style={{
                marginBottom: 16,
                padding: "8px 16px",
                background: "rgba(71, 104, 44, 0.12)",
                border: "1px solid rgba(140, 112, 81, 0.3)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                color: "#28502E",
              }}
            >
              ← 목록으로
            </button>
          )}

          {isLoadingDetail && (
            <div style={{ textAlign: "center", padding: 40, color: "#8C7051" }}>
              로딩 중...
            </div>
          )}

          {!isLoadingDetail && storeDetail && (
            <div>
              <div
                style={{
                  border: "1px solid rgba(140, 112, 81, 0.4)",
                  borderRadius: 14,
                  padding: 24,
                  background: "rgba(71, 104, 44, 0.1)",
                  marginBottom: 16,
                }}
              >
                {/* Main content: store info on left, photos on right (desktop) */}
                <div style={{ 
                  display: isMobile ? "block" : "flex", 
                  gap: isMobile ? 0 : 24,
                  alignItems: "flex-start"
                }}>
                  {/* Store info */}
                  <div style={{ 
                    minWidth: 0,
                    flex: isMobile ? "none" : 1
                  }}>
                    {/* 가게 이름 */}
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#28502E", marginBottom: 16 }}>
                      🍽 {storeDetail.store.name}
                    </div>

                    {/* 평점 */}
                    {storeDetail.insight?.rating !== null && storeDetail.insight?.rating !== undefined && (
                      <div style={{ fontSize: 44, fontWeight: 800, color: "#28502E", marginBottom: 12 }}>
                        ⭐ {storeDetail.insight.rating.toFixed(1)}
                      </div>
                    )}

                    {/* 평점신뢰도 */}
                    {storeDetail.insight?.ratingTrustScore && (() => {
                      const mappedLabel = RATING_TRUST_LABEL_MAPPING[storeDetail.insight.ratingTrustScore.label] || storeDetail.insight.ratingTrustScore.label;
                      const { totalScore, breakdown } = storeDetail.insight.ratingTrustScore;
                      
                      return (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#28502E" }}>
                            {storeDetail.insight.ratingTrustScore.emoji} {mappedLabel} ({totalScore}점)
                          </div>
                          <div style={{ fontSize: 13, color: "#8C7051", marginTop: 4 }}>
                            표본 {breakdown.sampleSize}점 · 자연스러움 {breakdown.naturalness}점
                          </div>
                        </div>
                      );
                    })()}

                    {/* 1km 순위 */}
                    {storeDetail.insight?.comparedStores && (() => {
                      const selfStore = storeDetail.insight.comparedStores.find(s => s.isSelf);
                      if (!selfStore) return null;
                      
                      const rank = selfStore.rank;
                      const total = storeDetail.insight.comparedStores.length;
                      const percentile = Math.round((rank / total) * 100);
                      
                      return (
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#28502E", marginBottom: 16 }}>
                          📍 반경 1km 상위 {percentile}% ({rank}위 / {total}개)
                        </div>
                      );
                    })()}

                    {/* 부가 정보 한 줄 */}
                    <div style={{ fontSize: 13, color: "#8C7051" }}>
                      리뷰 {Math.max(storeDetail.insight?.reviewCount ?? 0, storeDetail.summary.reviewCount)}개 · 반경 1km 내 가게 비교 · {storeDetail.store.address ?? "주소 정보 없음"}
                    </div>
                  </div>

                  {/* Photos section on the right (desktop) or below (mobile) */}
                  {storeDetail.photos && storeDetail.photos.length > 0 && (
                    <div
                      style={{
                        width: isMobile ? "100%" : "280px",
                        marginTop: isMobile ? 16 : 0,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ 
                        display: "flex", 
                        flexDirection: "column",
                        gap: 8 
                      }}>
                        {storeDetail.photos.slice(0, 3).map((photoUrl, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: "100%",
                              height: isMobile ? "160px" : "120px",
                              borderRadius: 8,
                              overflow: "hidden",
                              background: failedPhotos.has(idx) ? "rgba(140, 112, 81, 0.2)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {failedPhotos.has(idx) ? (
                              <span style={{ fontSize: 12, color: "#8C7051" }}>사진 로드 실패</span>
                            ) : (
                              <img
                                src={photoUrl}
                                alt={`${storeDetail.store.name} 사진 ${idx + 1}`}
                                loading="lazy"
                                onClick={() => handlePhotoClick(idx)}
                                onError={() => {
                                  setFailedPhotos(prev => new Set(prev).add(idx));
                                }}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  cursor: "pointer",
                                  transition: "transform 0.2s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = "scale(1.05)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = "scale(1)";
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Photo Modal */}
              {photoModalOpen && storeDetail.photosFull && storeDetail.photosFull.length > 0 && (
                <div
                  onClick={() => setPhotoModalOpen(false)}
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0, 0, 0, 0.9)",
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                  }}
                >
                  {/* Close button */}
                  <button
                    onClick={() => setPhotoModalOpen(false)}
                    style={{
                      position: "absolute",
                      top: 20,
                      right: 20,
                      background: "rgba(255, 255, 255, 0.2)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: 32,
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                    }}
                  >
                    ×
                  </button>

                  {/* Previous button */}
                  {storeDetail.photosFull.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevPhoto();
                      }}
                      style={{
                        position: "absolute",
                        left: 20,
                        background: "rgba(255, 255, 255, 0.2)",
                        border: "none",
                        color: "#ffffff",
                        fontSize: 32,
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      }}
                    >
                      ‹
                    </button>
                  )}

                  {/* Photo */}
                  {failedPhotos.has(currentPhotoIndex) ? (
                    <div
                      style={{
                        background: "rgba(140, 112, 81, 0.3)",
                        padding: "40px 60px",
                        borderRadius: 8,
                        textAlign: "center",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                      <div style={{ fontSize: 16, color: "#ffffff" }}>사진을 불러올 수 없습니다</div>
                    </div>
                  ) : (
                    <img
                      src={storeDetail.photosFull[currentPhotoIndex]}
                      alt={`${storeDetail.store.name} 사진`}
                      onClick={(e) => e.stopPropagation()}
                      onError={() => {
                        setFailedPhotos(prev => new Set(prev).add(currentPhotoIndex));
                      }}
                      style={{
                        maxWidth: "90%",
                        maxHeight: "90%",
                        objectFit: "contain",
                        borderRadius: 8,
                      }}
                    />
                  )}

                  {/* Next button */}
                  {storeDetail.photosFull.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextPhoto();
                      }}
                      style={{
                        position: "absolute",
                        right: 20,
                        background: "rgba(255, 255, 255, 0.2)",
                        border: "none",
                        color: "#ffffff",
                        fontSize: 32,
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      }}
                    >
                      ›
                    </button>
                  )}

                  {/* Photo counter */}
                  {storeDetail.photosFull.length > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 20,
                        background: "rgba(0, 0, 0, 0.6)",
                        color: "#ffffff",
                        padding: "8px 16px",
                        borderRadius: 20,
                        fontSize: 14,
                      }}
                    >
                      {currentPhotoIndex + 1} / {storeDetail.photosFull.length}
                    </div>
                  )}
                </div>
              )}

              {/* 애드센스 광고 플레이스홀더 (가게 상세 하단) */}
              <div
                style={{
                  border: "1px dashed rgba(140, 112, 81, 0.3)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "#8C7051",
                  background: "rgba(140, 112, 81, 0.06)",
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                광고 영역 (가게 상세 요약 하단) · 슬롯 ID 입력 후 활성화
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  반경 1km 비교 가게
                </h3>
                {storeDetail.insight?.comparedStores && storeDetail.insight.comparedStores.length > 0 ? (
                  <div style={{ border: "1px solid rgba(140, 112, 81, 0.4)", borderRadius: 12, background: "rgba(140, 112, 81, 0.06)", overflow: "hidden" }}>
                    {storeDetail.insight.comparedStores.map((comparedStore) => {
                      const isHovered = hoveredCompareId === comparedStore.id;
                      const trustScore = computeRatingTrustScore(comparedStore.rating, comparedStore.reviewCount);
                      return (
                        <div
                          key={comparedStore.id}
                          onClick={() => {
                            if (!comparedStore.isSelf) {
                              handleStoreClick(comparedStore.id);
                            }
                          }}
                          onMouseEnter={() => setHoveredCompareId(comparedStore.id)}
                          onMouseLeave={() => setHoveredCompareId(null)}
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid rgba(140, 112, 81, 0.4)",
                            background: comparedStore.isSelf ? "rgba(40, 80, 46, 0.18)" : isHovered ? "rgba(71, 104, 44, 0.15)" : "rgba(140, 112, 81, 0.06)",
                            cursor: comparedStore.isSelf ? "default" : "pointer",
                            transition: "all 0.2s ease",
                            fontSize: 14,
                            color: "#28502E",
                          }}
                        >
                          <span style={{ fontWeight: comparedStore.isSelf ? 700 : 400 }}>
                            {comparedStore.rank}위 {comparedStore.name}
                          </span>
                          {comparedStore.isSelf && (
                            <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: "#28502E" }}>
                              (현재 가게)
                            </span>
                          )}
                          <span style={{ marginLeft: 8, color: "#8C7051" }}>
                            · ⭐{comparedStore.rating.toFixed(1)} · 리뷰 {comparedStore.reviewCount} · {trustScore.emoji} {trustScore.totalScore}점
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    border: "1px solid rgba(140, 112, 81, 0.3)",
                    borderRadius: 12,
                    padding: 20,
                    textAlign: "center",
                    color: "#8C7051",
                    fontSize: 14,
                    background: "rgba(140, 112, 81, 0.06)",
                  }}>
                    반경 1km 내 비교할 가게가 없습니다
                  </div>
                )}
              </div>

              {/* 애드센스 광고 플레이스홀더 (리뷰 섹션 앞) */}
              <div
                style={{
                  border: "1px dashed rgba(140, 112, 81, 0.3)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "#8C7051",
                  background: "rgba(140, 112, 81, 0.06)",
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                광고 영역 (리뷰 목록 상단) · 슬롯 ID 입력 후 활성화
              </div>

              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
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
                          border: "1px solid rgba(140, 112, 81, 0.3)",
                          borderRadius: 12,
                          padding: 14,
                          background: (adAny ?? 0) >= 0.6 ? "rgba(140, 112, 81, 0.15)" : "rgba(71, 104, 44, 0.06)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 12,
                            fontSize: 14,
                            marginBottom: 8,
                            color: "#28502E",
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
                        <p style={{ lineHeight: 1.5, margin: "8px 0", color: "#28502E" }}>{review.content}</p>
                        {review.latestAnalysis && (
                          <div style={{ fontSize: 12, color: "#8C7051", marginBottom: 6 }}>
                            근거: {review.latestAnalysis.reasonSummary}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#8C7051" }}>
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
            <div style={{ textAlign: "center", padding: 40, color: "#8C7051" }}>
              가게 정보를 불러오지 못했습니다.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomeInteractive;