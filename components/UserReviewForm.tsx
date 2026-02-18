"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";

interface UserReviewFormProps {
  storeId: number;
  onSuccess?: () => void;
}

type OptionValue = "good" | "normal" | "bad" | "expensive" | "cheap" | "enough" | "narrow" | "short" | "long" | null;
const STAR_ACTIVE_COLOR = "#47682C";

interface MyReview {
  id: number;
  storeId: number;
  rating: number;
  food: OptionValue;
  price: OptionValue;
  service: OptionValue;
  space: OptionValue;
  waitTime: OptionValue;
  comment: string | null;
  createdAt: string;
}

type NoticeType = "success" | "error";

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

export default function UserReviewForm({ storeId, onSuccess }: UserReviewFormProps) {
  const { data: session } = useSession();
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [food, setFood] = useState<OptionValue>(null);
  const [price, setPrice] = useState<OptionValue>(null);
  const [service, setService] = useState<OptionValue>(null);
  const [space, setSpace] = useState<OptionValue>(null);
  const [waitTime, setWaitTime] = useState<OptionValue>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingMyReview, setIsCheckingMyReview] = useState(false);
  const [myReview, setMyReview] = useState<MyReview | null>(null);
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null);

  const fetchMyReview = useCallback(async () => {
    if (!session?.user) {
      setMyReview(null);
      return;
    }

    setIsCheckingMyReview(true);
    try {
      const response = await fetch(`/api/user-reviews?storeId=${storeId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setMyReview(null);
        return;
      }
      const result = await response.json();
      if (result.ok) {
        setMyReview(result.review ?? null);
      } else {
        setMyReview(null);
      }
    } catch (error) {
      console.error("Fetch my review error:", error);
      setMyReview(null);
    } finally {
      setIsCheckingMyReview(false);
    }
  }, [session?.user, storeId]);

  useEffect(() => {
    void fetchMyReview();
  }, [fetchMyReview]);

  const handleStarClick = (e: React.MouseEvent<HTMLSpanElement>, starIndex: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isHalf = e.clientX - rect.left < rect.width / 2;
    setRating(isHalf ? starIndex - 0.5 : starIndex);
  };

  const handleStarHover = (e: React.MouseEvent<HTMLSpanElement>, starIndex: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isHalf = e.clientX - rect.left < rect.width / 2;
    setHoverRating(isHalf ? starIndex - 0.5 : starIndex);
  };

  const toggleOption = (
    current: OptionValue,
    value: OptionValue,
    setter: React.Dispatch<React.SetStateAction<OptionValue>>
  ) => {
    setter(current === value ? null : value);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setNotice({ type: "error", message: "별점을 선택해주세요." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/user-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          rating,
          food,
          price,
          service,
          space,
          waitTime,
          comment: comment.trim() || null,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        setNotice({ type: "success", message: "리뷰 완료됐어요. 소중한 의견 감사합니다." });
        // Reset form
        setRating(0);
        setFood(null);
        setPrice(null);
        setService(null);
        setSpace(null);
        setWaitTime(null);
        setComment("");
        await fetchMyReview();
        if (onSuccess) onSuccess();
      } else {
        setNotice({ type: "error", message: result.error || "리뷰 등록에 실패했습니다." });
      }
    } catch (error) {
      console.error("Submit error:", error);
      setNotice({ type: "error", message: "리뷰 등록 중 오류가 발생했습니다." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderOptionButton = (
    label: string,
    value: OptionValue,
    current: OptionValue,
    setter: React.Dispatch<React.SetStateAction<OptionValue>>
  ) => {
    const isSelected = current === value;
    return (
      <button
        type="button"
        onClick={() => toggleOption(current, value, setter)}
        style={{
          padding: "8px 16px",
          border: "1px solid #28502E",
          borderRadius: 8,
          background: isSelected ? "#28502E" : "transparent",
          color: isSelected ? "#ffffff" : "#28502E",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        {label}
      </button>
    );
  };

  // If not logged in, show login prompt only
  if (!session?.user) {
    return (
      <div
        style={{
          border: "1px solid rgba(140, 112, 81, 0.4)",
          borderRadius: 14,
          padding: 32,
          background: "rgba(71, 104, 44, 0.1)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: "#28502E", marginBottom: 20 }}>
          리뷰를 작성하려면 로그인이 필요합니다.
        </div>
        <button
          onClick={() => signIn("google", { callbackUrl: window.location.href })}
          style={{
            padding: "12px 24px",
            background: "#28502E",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          구글로 로그인
        </button>
      </div>
    );
  }

  if (isCheckingMyReview) {
    return (
      <div
        style={{
          border: "1px solid rgba(140, 112, 81, 0.4)",
          borderRadius: 14,
          padding: 24,
          background: "rgba(71, 104, 44, 0.1)",
          color: "#28502E",
          fontSize: 14,
        }}
      >
        내가 쓴 리뷰 확인 중...
      </div>
    );
  }

  if (myReview) {
    const optionRows = [
      myReview.food ? `음식: ${LABEL_MAP[myReview.food]}` : null,
      myReview.price ? `가격: ${LABEL_MAP[myReview.price]}` : null,
      myReview.service ? `서비스: ${LABEL_MAP[myReview.service]}` : null,
      myReview.space ? `공간: ${LABEL_MAP[myReview.space]}` : null,
      myReview.waitTime ? `대기시간: ${LABEL_MAP[myReview.waitTime]}` : null,
    ].filter(Boolean);

    return (
      <div
        style={{
          border: "1px solid rgba(140, 112, 81, 0.4)",
          borderRadius: 14,
          padding: 24,
          background: "rgba(71, 104, 44, 0.1)",
        }}
      >
        {notice && (
          <div
            style={{
              border: `1px solid ${notice.type === "success" ? "rgba(71, 104, 44, 0.5)" : "rgba(178, 73, 39, 0.45)"}`,
              borderRadius: 10,
              background: notice.type === "success" ? "rgba(71, 104, 44, 0.16)" : "rgba(178, 73, 39, 0.1)",
              color: notice.type === "success" ? "#28502E" : "#7A2A19",
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{notice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ fontSize: 16, fontWeight: 700, color: "#28502E", marginBottom: 10 }}>
          내가 작성한 리뷰
        </div>
        <div style={{ fontSize: 15, color: "#28502E", marginBottom: 8 }}>
          평점 {Number(myReview.rating).toFixed(1)}점
        </div>
        {optionRows.length > 0 && (
          <div style={{ fontSize: 13, color: "#8C7051", marginBottom: 8 }}>
            {optionRows.join(" · ")}
          </div>
        )}
        {myReview.comment && (
          <div style={{ fontSize: 14, color: "#28502E", marginBottom: 8 }}>
            {myReview.comment}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#8C7051" }}>
          작성일 {new Date(myReview.createdAt).toLocaleString("ko-KR")}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid rgba(140, 112, 81, 0.4)",
        borderRadius: 14,
        padding: 16,
        background: "rgba(71, 104, 44, 0.1)",
      }}
    >
      {notice && (
        <div
          style={{
            border: `1px solid ${notice.type === "success" ? "rgba(71, 104, 44, 0.5)" : "rgba(178, 73, 39, 0.45)"}`,
            borderRadius: 10,
            background: notice.type === "success" ? "rgba(71, 104, 44, 0.16)" : "rgba(178, 73, 39, 0.1)",
            color: notice.type === "success" ? "#28502E" : "#7A2A19",
            padding: "10px 12px",
            marginBottom: 14,
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* User info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#28502E" }}>
          👤 {session.user.name || session.user.email}
        </div>
      </div>

      {/* Star rating */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#28502E", marginBottom: 8 }}>
          ⭐ 별점 (필수)
        </div>
        <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
          {[1, 2, 3, 4, 5].map((starIndex) => {
            const displayRating = hoverRating || rating;
            const filled = starIndex <= Math.floor(displayRating);
            const half = starIndex === Math.ceil(displayRating) && displayRating % 1 !== 0;

            return (
              <span
                key={starIndex}
                onClick={(e) => handleStarClick(e, starIndex)}
                onMouseMove={(e) => handleStarHover(e, starIndex)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  fontSize: 34,
                  cursor: "pointer",
                  userSelect: "none",
                  position: "relative",
                  display: "inline-block",
                  width: "1em",
                  height: "1em",
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    color: "transparent",
                    WebkitTextStroke: "1.3px #8C7051",
                  }}
                >
                  ★
                </span>
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    color: STAR_ACTIVE_COLOR,
                    overflow: "hidden",
                    width: filled ? "100%" : half ? "50%" : "0%",
                  }}
                >★</span>
              </span>
            );
          })}
        </div>
        <div style={{ fontSize: 14, color: "#8C7051" }}>
          {rating > 0 ? `${rating.toFixed(1)}점` : ""}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px dashed rgba(140, 112, 81, 0.3)",
          paddingTop: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, color: "#8C7051", marginBottom: 10 }}>
          선택
        </div>

        {/* Food */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#28502E", marginBottom: 8 }}>
            음식
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {renderOptionButton("맛있어요", "good", food, setFood)}
            {renderOptionButton("보통", "normal", food, setFood)}
            {renderOptionButton("별로예요", "bad", food, setFood)}
          </div>
        </div>

        {/* Price */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#28502E", marginBottom: 8 }}>
            가격
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {renderOptionButton("비싸요", "expensive", price, setPrice)}
            {renderOptionButton("보통", "normal", price, setPrice)}
            {renderOptionButton("싸요", "cheap", price, setPrice)}
          </div>
        </div>

        {/* Service */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#28502E", marginBottom: 8 }}>
            서비스
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {renderOptionButton("좋아요", "good", service, setService)}
            {renderOptionButton("보통", "normal", service, setService)}
            {renderOptionButton("별로예요", "bad", service, setService)}
          </div>
        </div>

        {/* Space */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#28502E", marginBottom: 8 }}>
            공간
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {renderOptionButton("충분해요", "enough", space, setSpace)}
            {renderOptionButton("보통", "normal", space, setSpace)}
            {renderOptionButton("좁아요", "narrow", space, setSpace)}
          </div>
        </div>

        {/* Wait time */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#28502E", marginBottom: 8 }}>
            대기시간
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {renderOptionButton("짧아요", "short", waitTime, setWaitTime)}
            {renderOptionButton("보통", "normal", waitTime, setWaitTime)}
            {renderOptionButton("길어요", "long", waitTime, setWaitTime)}
          </div>
        </div>

        {/* Comment */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#28502E", marginBottom: 8 }}>
            한줄 코멘트
          </div>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="간단한 후기를 남겨주세요"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(140, 112, 81, 0.4)",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Submit button */}
      <div style={{ display: "flex" }}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            width: "100%",
            padding: "12px 20px",
            background: "#28502E",
            border: "none",
            borderRadius: 8,
            color: "#ffffff",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 700,
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          {isSubmitting ? "등록 중..." : "제출하기"}
        </button>
      </div>
    </div>
  );
}
