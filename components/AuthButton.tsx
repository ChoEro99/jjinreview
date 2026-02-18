"use client";

import { useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

const MAX_DISPLAY_NAME_LENGTH = 10;
type OptionValue = "good" | "normal" | "bad" | "expensive" | "cheap" | "enough" | "narrow" | "short" | "long" | null;

type MyReview = {
  id: number;
  storeId: number;
  storeName: string | null;
  rating: number;
  food: OptionValue;
  price: OptionValue;
  service: OptionValue;
  space: OptionValue;
  waitTime: OptionValue;
  comment: string | null;
  createdAt: string;
};

const LABEL_MAP: Record<Exclude<OptionValue, null>, string> = {
  good: "좋아요",
  normal: "보통",
  bad: "별로예요",
  expensive: "비싸요",
  cheap: "싸요",
  enough: "충분해요",
  narrow: "좁아요",
  short: "짧아요",
  long: "길어요",
};

export default function AuthButton() {
  const { data: session } = useSession();
  const [myReviewsOpen, setMyReviewsOpen] = useState(false);
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);
  const [myReviewsIndex, setMyReviewsIndex] = useState(0);
  const [isLoadingMyReviews, setIsLoadingMyReviews] = useState(false);
  const [myReviewsError, setMyReviewsError] = useState<string | null>(null);
  const [isDraggingMyReviews, setIsDraggingMyReviews] = useState(false);
  const dragRef = useRef<{ isDragging: boolean; startX: number; moved: boolean }>({
    isDragging: false,
    startX: 0,
    moved: false,
  });
  const wheelLockRef = useRef(false);

  const openMyReviews = async () => {
    setMyReviewsOpen(true);
    setIsLoadingMyReviews(true);
    setMyReviewsError(null);
    try {
      const response = await fetch("/api/user-reviews/my", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setMyReviewsError(result.error || "내 리뷰를 불러오지 못했습니다.");
        setMyReviews([]);
        setMyReviewsIndex(0);
        return;
      }
      const reviews = Array.isArray(result.reviews) ? result.reviews : [];
      setMyReviews(reviews);
      setMyReviewsIndex(0);
    } catch (error) {
      console.error("Failed to load my reviews:", error);
      setMyReviewsError("내 리뷰를 불러오지 못했습니다.");
      setMyReviews([]);
      setMyReviewsIndex(0);
    } finally {
      setIsLoadingMyReviews(false);
    }
  };

  const moveReviewIndex = (direction: -1 | 1) => {
    if (myReviews.length <= 1) return;
    setMyReviewsIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return myReviews.length - 1;
      if (next >= myReviews.length) return 0;
      return next;
    });
  };

  const handleMyReviewsMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      moved: false,
    };
    setIsDraggingMyReviews(true);
  };

  const handleMyReviewsMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDragging) return;
    const deltaX = e.clientX - dragRef.current.startX;
    if (Math.abs(deltaX) < 45) return;
    dragRef.current.moved = true;
    dragRef.current.startX = e.clientX;
    moveReviewIndex(deltaX > 0 ? -1 : 1);
  };

  const handleMyReviewsMouseUpOrLeave = () => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    setIsDraggingMyReviews(false);
  };

  const handleMyReviewsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (myReviews.length <= 1) return;
    const dominantDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(dominantDelta) < 8) return;
    e.preventDefault();
    if (wheelLockRef.current) return;
    wheelLockRef.current = true;
    moveReviewIndex(dominantDelta > 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLockRef.current = false;
    }, 160);
  };

  if (session?.user) {
    // Logged in state
    const displayName = session.user.name || session.user.email || "User";
    const truncatedName = displayName.length > MAX_DISPLAY_NAME_LENGTH 
      ? displayName.slice(0, MAX_DISPLAY_NAME_LENGTH) + "..." 
      : displayName;

    return (
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            background: "rgba(255,255,255,0.9)",
            borderRadius: 6,
            padding: "4px 8px",
            color: "#28502E",
            fontWeight: 600,
            fontSize: 13,
            boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          }}
        >
          {truncatedName}
        </span>
        <button
          onClick={() => void openMyReviews()}
          style={{
            background: "#47682C",
            color: "#ffffff",
            border: "1px solid #47682C",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#28502E";
            e.currentTarget.style.borderColor = "#28502E";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "#47682C";
            e.currentTarget.style.borderColor = "#47682C";
          }}
        >
          내가쓴 리뷰
        </button>
        <button
          onClick={() => signOut()}
          style={{
            background: "#ffffff",
            color: "#28502E",
            border: "1px solid #28502E",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#28502E";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.color = "#28502E";
          }}
        >
          로그아웃
        </button>
        {myReviewsOpen && (
          <div
            onClick={() => setMyReviewsOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(18, 28, 15, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(560px, 100%)",
                borderRadius: 14,
                border: "1px solid rgba(140, 112, 81, 0.45)",
                background: "#f6f4ef",
                padding: 18,
                color: "#28502E",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ fontSize: 18 }}>내가 쓴 리뷰</strong>
                <button
                  type="button"
                  onClick={() => setMyReviewsOpen(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#28502E",
                    fontSize: 20,
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              {isLoadingMyReviews ? (
                <div style={{ padding: "28px 8px", textAlign: "center", color: "#8C7051" }}>
                  내 리뷰 불러오는 중...
                </div>
              ) : myReviewsError ? (
                <div style={{ padding: "20px 8px", textAlign: "center", color: "#7A2A19" }}>
                  {myReviewsError}
                </div>
              ) : myReviews.length === 0 ? (
                <div style={{ padding: "20px 8px", textAlign: "center", color: "#8C7051" }}>
                  작성한 리뷰가 아직 없습니다.
                </div>
              ) : (
                <>
                  {(() => {
                    const current = myReviews[myReviewsIndex];
                    const prev =
                      myReviews[(myReviewsIndex - 1 + myReviews.length) % myReviews.length];
                    const next = myReviews[(myReviewsIndex + 1) % myReviews.length];
                    const renderReviewCard = (
                      review: MyReview,
                      variant: "center" | "left" | "right"
                    ) => {
                      const isCenter = variant === "center";
                      const transform =
                        variant === "center"
                          ? "translateX(-50%) scale(1)"
                          : variant === "left"
                            ? "translateX(calc(-50% - 220px)) scale(0.9)"
                            : "translateX(calc(-50% + 220px)) scale(0.9)";
                      return (
                        <div
                          key={`${variant}-${review.id}`}
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: isCenter ? 0 : 22,
                            width: isCenter ? "min(380px, 82vw)" : "min(220px, 42vw)",
                            minHeight: isCenter ? 290 : 210,
                            border: "1px solid rgba(140, 112, 81, 0.35)",
                            borderRadius: 14,
                            padding: 14,
                            background: isCenter ? "#f6f4ef" : "rgba(71, 104, 44, 0.08)",
                            transform,
                            opacity: isCenter ? 1 : 0.4,
                            boxShadow: isCenter
                              ? "0 10px 28px rgba(25, 35, 20, 0.22)"
                              : "0 4px 12px rgba(25, 35, 20, 0.1)",
                            zIndex: isCenter ? 10 : 1,
                            pointerEvents: isCenter ? "auto" : "none",
                            transition:
                              "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                            {review.storeName ?? `가게 #${review.storeId}`}
                          </div>
                          <div style={{ fontSize: 14, marginBottom: 6 }}>
                            평점 {Number(review.rating).toFixed(1)}점
                          </div>
                          {isCenter ? (
                            <>
                              <div style={{ fontSize: 13, color: "#8C7051", marginBottom: 6 }}>
                                {[
                                  review.food ? `음식 ${LABEL_MAP[review.food]}` : null,
                                  review.price ? `가격 ${LABEL_MAP[review.price]}` : null,
                                  review.service ? `서비스 ${LABEL_MAP[review.service]}` : null,
                                  review.space ? `공간 ${LABEL_MAP[review.space]}` : null,
                                  review.waitTime ? `대기 ${LABEL_MAP[review.waitTime]}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "선택 항목 없음"}
                              </div>
                              {review.comment && (
                                <div style={{ fontSize: 14, lineHeight: 1.45, marginBottom: 6 }}>
                                  {review.comment}
                                </div>
                              )}
                              <div style={{ fontSize: 12, color: "#8C7051" }}>
                                {new Date(review.createdAt).toLocaleString("ko-KR")}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12, color: "#8C7051" }}>
                              {new Date(review.createdAt).toLocaleDateString("ko-KR")}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div
                        onMouseDown={handleMyReviewsMouseDown}
                        onMouseMove={handleMyReviewsMouseMove}
                        onMouseUp={handleMyReviewsMouseUpOrLeave}
                        onMouseLeave={handleMyReviewsMouseUpOrLeave}
                        onWheel={handleMyReviewsWheel}
                        style={{
                          position: "relative",
                          height: 340,
                          overflow: "hidden",
                          cursor: isDraggingMyReviews ? "grabbing" : "grab",
                          userSelect: "none",
                          marginBottom: 12,
                        }}
                      >
                        {myReviews.length > 1 && renderReviewCard(prev, "left")}
                        {renderReviewCard(current, "center")}
                        {myReviews.length > 1 && renderReviewCard(next, "right")}
                      </div>
                    );
                  })()}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                    <span style={{ fontSize: 13, color: "#8C7051" }}>
                      좌우 드래그/휠로 넘기기
                    </span>
                    <span style={{ fontSize: 13, color: "#8C7051" }}>
                      {myReviewsIndex + 1} / {myReviews.length}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not logged in state
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1000,
      }}
    >
      <button
        onClick={() => signIn("google", { callbackUrl: window.location.href })}
        style={{
          background: "#ffffff",
          color: "#28502E",
          border: "1px solid #28502E",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "#28502E";
          e.currentTarget.style.color = "#ffffff";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "#ffffff";
          e.currentTarget.style.color = "#28502E";
        }}
      >
        구글로 로그인
      </button>
    </div>
  );
}
