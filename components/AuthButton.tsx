"use client";

import { useState } from "react";
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
                  <div
                    style={{
                      border: "1px solid rgba(140, 112, 81, 0.35)",
                      borderRadius: 12,
                      padding: 14,
                      background: "rgba(71, 104, 44, 0.08)",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                      {myReviews[myReviewsIndex].storeName ?? `가게 #${myReviews[myReviewsIndex].storeId}`}
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 6 }}>
                      평점 {Number(myReviews[myReviewsIndex].rating).toFixed(1)}점
                    </div>
                    <div style={{ fontSize: 13, color: "#8C7051", marginBottom: 6 }}>
                      {[
                        myReviews[myReviewsIndex].food ? `음식 ${LABEL_MAP[myReviews[myReviewsIndex].food]}` : null,
                        myReviews[myReviewsIndex].price ? `가격 ${LABEL_MAP[myReviews[myReviewsIndex].price]}` : null,
                        myReviews[myReviewsIndex].service ? `서비스 ${LABEL_MAP[myReviews[myReviewsIndex].service]}` : null,
                        myReviews[myReviewsIndex].space ? `공간 ${LABEL_MAP[myReviews[myReviewsIndex].space]}` : null,
                        myReviews[myReviewsIndex].waitTime ? `대기 ${LABEL_MAP[myReviews[myReviewsIndex].waitTime]}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "선택 항목 없음"}
                    </div>
                    {myReviews[myReviewsIndex].comment && (
                      <div style={{ fontSize: 14, lineHeight: 1.45, marginBottom: 6 }}>
                        {myReviews[myReviewsIndex].comment}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "#8C7051" }}>
                      {new Date(myReviews[myReviewsIndex].createdAt).toLocaleString("ko-KR")}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setMyReviewsIndex((prev) => (prev - 1 + myReviews.length) % myReviews.length)
                      }
                      style={{
                        border: "1px solid #8C7051",
                        borderRadius: 8,
                        background: "#ffffff",
                        color: "#28502E",
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      ← 이전
                    </button>
                    <span style={{ fontSize: 13, color: "#8C7051" }}>
                      {myReviewsIndex + 1} / {myReviews.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMyReviewsIndex((prev) => (prev + 1) % myReviews.length)
                      }
                      style={{
                        border: "1px solid #8C7051",
                        borderRadius: 8,
                        background: "#ffffff",
                        color: "#28502E",
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      다음 →
                    </button>
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
