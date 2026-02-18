"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";

interface UserReviewFormProps {
  storeId: number;
  onSuccess?: () => void;
}

type OptionValue = "good" | "normal" | "bad" | "expensive" | "cheap" | "enough" | "narrow" | "short" | "long" | null;
const STAR_ACTIVE_COLOR = "#47682C";

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

  const handleSubmitMinimal = async () => {
    if (rating === 0) {
      alert("별점을 선택해주세요");
      return;
    }
    await handleSubmit();
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      alert("별점을 선택해주세요");
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
        alert("리뷰가 성공적으로 등록되었습니다!");
        // Reset form
        setRating(0);
        setFood(null);
        setPrice(null);
        setService(null);
        setSpace(null);
        setWaitTime(null);
        setComment("");
        if (onSuccess) onSuccess();
      } else {
        alert(result.error || "리뷰 등록에 실패했습니다.");
      }
    } catch (error) {
      console.error("Submit error:", error);
      alert("리뷰 등록 중 오류가 발생했습니다.");
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

  return (
    <div
      style={{
        border: "1px solid rgba(140, 112, 81, 0.4)",
        borderRadius: 14,
        padding: 24,
        background: "rgba(71, 104, 44, 0.1)",
      }}
    >
      {/* User info */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#28502E" }}>
          👤 {session.user.name || session.user.email}
        </div>
      </div>

      {/* Star rating */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#28502E", marginBottom: 8 }}>
          ⭐ 별점 (필수)
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
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
                  fontSize: 40,
                  cursor: "pointer",
                  userSelect: "none",
                  position: "relative",
                  display: "inline-block",
                  width: "1em",
                  height: "1em",
                  lineHeight: 1,
                }}
              >
                <span style={{ position: "absolute", top: 0, left: 0, color: "#dddddd" }}>☆</span>
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
          paddingTop: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, color: "#8C7051", marginBottom: 16 }}>
          선택
        </div>

        {/* Food */}
        <div style={{ marginBottom: 16 }}>
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
        <div style={{ marginBottom: 16 }}>
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
        <div style={{ marginBottom: 16 }}>
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
        <div style={{ marginBottom: 16 }}>
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
        <div style={{ marginBottom: 16 }}>
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
        <div style={{ marginBottom: 16 }}>
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

      {/* Submit buttons */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleSubmitMinimal}
          disabled={isSubmitting}
          style={{
            flex: 1,
            minWidth: 150,
            padding: "12px 20px",
            background: "transparent",
            border: "2px solid #28502E",
            borderRadius: 8,
            color: "#28502E",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 700,
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          여기까지만 리뷰할래요
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            flex: 1,
            minWidth: 150,
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
