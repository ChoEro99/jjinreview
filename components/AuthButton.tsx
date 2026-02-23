"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { appLanguageToLocale } from "@/src/lib/language";
import { useAppLanguageClient } from "@/src/lib/app-language-client";

const MAX_DISPLAY_NAME_LENGTH = 10;
const MY_REVIEWS_CACHE_TTL_MS = 45_000;
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
  const { language } = useAppLanguageClient();
  const [isMobile, setIsMobile] = useState(false);
  const [myReviewsOpen, setMyReviewsOpen] = useState(false);
  const [myReviews, setMyReviews] = useState<MyReview[]>([]);
  const [myReviewsIndex, setMyReviewsIndex] = useState(0);
  const [isLoadingMyReviews, setIsLoadingMyReviews] = useState(false);
  const [myReviewsError, setMyReviewsError] = useState<string | null>(null);
  const [isDraggingMyReviews, setIsDraggingMyReviews] = useState(false);
  const myReviewsCacheRef = useRef<{
    fetchedAt: number;
    reviews: MyReview[];
  } | null>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; moved: boolean }>({
    isDragging: false,
    startX: 0,
    moved: false,
  });
  const wheelLockRef = useRef(false);
  const locale = appLanguageToLocale(language);
  const text = language === "ko"
    ? {
        myReviews: "내가쓴 리뷰",
        logout: "로그아웃",
        login: "구글로 로그인",
        myReviewTitle: "내가 쓴 리뷰",
        loadingMyReviews: "내 리뷰 불러오는 중...",
        noMyReview: "작성한 리뷰가 아직 없습니다.",
        anonymous: "익명",
        noOption: "선택 항목 없음",
      }
    : language === "ja"
      ? {
          myReviews: "マイレビュー",
          logout: "ログアウト",
          login: "Googleログイン",
          myReviewTitle: "自分のレビュー",
          loadingMyReviews: "レビューを読み込み中...",
          noMyReview: "まだ投稿したレビューがありません。",
          anonymous: "匿名",
          noOption: "選択項目なし",
        }
      : language === "zh-CN"
        ? {
            myReviews: "我的点评",
            logout: "退出登录",
            login: "Google 登录",
            myReviewTitle: "我写的点评",
            loadingMyReviews: "正在加载我的点评...",
            noMyReview: "还没有已发布的点评。",
            anonymous: "匿名",
            noOption: "无已选项",
          }
        : {
            myReviews: "My Reviews",
            logout: "Log out",
            login: "Sign in with Google",
            myReviewTitle: "My Reviews",
            loadingMyReviews: "Loading my reviews...",
            noMyReview: "No reviews yet.",
            anonymous: "Anonymous",
            noOption: "No options selected",
          };

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const openMyReviews = async () => {
    setMyReviewsOpen(true);
    const cached = myReviewsCacheRef.current;
    if (cached && Date.now() - cached.fetchedAt <= MY_REVIEWS_CACHE_TTL_MS) {
      setMyReviews(cached.reviews);
      setMyReviewsError(null);
      setMyReviewsIndex(0);
      setIsLoadingMyReviews(false);
      return;
    }
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
      myReviewsCacheRef.current = { fetchedAt: Date.now(), reviews };
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

  const handleMyReviewsTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    dragRef.current = {
      isDragging: true,
      startX: e.touches[0].clientX,
      moved: false,
    };
    setIsDraggingMyReviews(true);
  };

  const handleMyReviewsTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!dragRef.current.isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - dragRef.current.startX;
    if (Math.abs(deltaX) < 45) return;
    dragRef.current.moved = true;
    dragRef.current.startX = e.touches[0].clientX;
    moveReviewIndex(deltaX > 0 ? -1 : 1);
  };

  const handleMyReviewsTouchEnd = () => {
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

  const goToStoreDetail = (storeId: number) => {
    setMyReviewsOpen(false);
    if (window.location.pathname === "/") {
      window.dispatchEvent(
        new CustomEvent("open-store-detail", {
          detail: { storeId },
        })
      );
      const params = new URLSearchParams(window.location.search);
      params.set("storeId", String(storeId));
      const nextUrl = `/?${params.toString()}`;
      window.history.replaceState({}, "", nextUrl);
      return;
    }
    window.location.assign(`/?storeId=${storeId}`);
  };

  if (session?.user) {
    // Logged in state
    const displayName = session.user.name || session.user.email || "User";
    const maxNameLength = isMobile ? 8 : MAX_DISPLAY_NAME_LENGTH;
    const truncatedName = displayName.length > maxNameLength
      ? displayName.slice(0, maxNameLength) + "..."
      : displayName;

    return (
      <div
        style={{
          position: "fixed",
          top: isMobile ? "calc(env(safe-area-inset-top, 0px) + 2px)" : 16,
          right: isMobile ? 10 : 16,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 6 : 8,
          maxWidth: isMobile ? "92vw" : "none",
        }}
      >
        <span
          style={{
            background: "rgba(255,255,255,0.9)",
            borderRadius: 6,
            padding: isMobile ? "3px 6px" : "4px 8px",
            color: "#28502E",
            fontWeight: 600,
            fontSize: isMobile ? 12 : 13,
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
            padding: isMobile ? "7px 10px" : "8px 12px",
            fontSize: isMobile ? 12 : 13,
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
          {text.myReviews}
        </button>
        <button
          onClick={() => signOut()}
          style={{
            background: "#ffffff",
            color: "#28502E",
            border: "1px solid #28502E",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: isMobile ? "6px 10px" : "8px 16px",
            fontSize: isMobile ? 11 : 13,
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
          {text.logout}
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
              padding: isMobile ? 12 : 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(560px, 100%)",
                borderRadius: 14,
                border: "1px solid rgba(140, 112, 81, 0.45)",
                background: "#f6f4ef",
                padding: isMobile ? 14 : 18,
                color: "#28502E",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ fontSize: 18 }}>{text.myReviewTitle}</strong>
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
                  {text.loadingMyReviews}
                </div>
              ) : myReviewsError ? (
                <div style={{ padding: "20px 8px", textAlign: "center", color: "#7A2A19" }}>
                  {myReviewsError}
                </div>
              ) : myReviews.length === 0 ? (
                <div style={{ padding: "20px 8px", textAlign: "center", color: "#8C7051" }}>
                  {text.noMyReview}
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
                      const showStack = !isMobile && myReviews.length > 1;
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
                            top: isCenter || isMobile ? 0 : 22,
                            width: isCenter || isMobile ? "min(420px, 100%)" : "min(220px, 42vw)",
                            minHeight: isCenter ? (isMobile ? 250 : 290) : 210,
                            border: "1px solid rgba(140, 112, 81, 0.35)",
                            borderRadius: 14,
                            padding: 14,
                            background: isCenter ? "#f6f4ef" : "rgba(71, 104, 44, 0.08)",
                            transform,
                            opacity: isCenter ? 1 : showStack ? 0.4 : 0,
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
                          <button
                            type="button"
                            onClick={() => goToStoreDetail(review.storeId)}
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              marginBottom: 6,
                              background: "transparent",
                              border: "none",
                              color: "#28502E",
                              cursor: "pointer",
                              padding: 0,
                              textAlign: "left",
                              textDecoration: "underline",
                              textUnderlineOffset: 3,
                            }}
                          >
                            {review.storeName ?? `가게 #${review.storeId}`}
                          </button>
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
                                  .join(" · ") || text.noOption}
                              </div>
                              {review.comment && (
                                <div style={{ fontSize: 14, lineHeight: 1.45, marginBottom: 6 }}>
                                  {review.comment}
                                </div>
                              )}
                              <div style={{ fontSize: 12, color: "#8C7051" }}>
                                {new Date(review.createdAt).toLocaleString(locale)}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12, color: "#8C7051" }}>
                              {new Date(review.createdAt).toLocaleDateString(locale)}
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
                        onTouchStart={handleMyReviewsTouchStart}
                        onTouchMove={handleMyReviewsTouchMove}
                        onTouchEnd={handleMyReviewsTouchEnd}
                        onWheel={handleMyReviewsWheel}
                        style={{
                          position: "relative",
                          height: isMobile ? 280 : 340,
                          overflow: "hidden",
                          cursor: isDraggingMyReviews ? "grabbing" : "grab",
                          userSelect: "none",
                          marginBottom: 12,
                          touchAction: "pan-y",
                        }}
                      >
                        {!isMobile && myReviews.length > 1 && renderReviewCard(prev, "left")}
                        {renderReviewCard(current, "center")}
                        {!isMobile && myReviews.length > 1 && renderReviewCard(next, "right")}
                      </div>
                    );
                  })()}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                    <span style={{ fontSize: 13, color: "#8C7051" }}>
                      {isMobile ? "좌우 스와이프로 넘기기" : "좌우 드래그/휠로 넘기기"}
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
        top: isMobile ? "calc(env(safe-area-inset-top, 0px) + 2px)" : 16,
        right: isMobile ? 10 : 16,
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
          padding: isMobile ? "6px 10px" : "8px 16px",
          fontSize: isMobile ? 11 : 13,
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
        {text.login}
      </button>
    </div>
  );
}
