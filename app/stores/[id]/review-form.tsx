"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ReviewForm({ storeId }: { storeId: number }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [isDisclosedAd, setIsDisclosedAd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/stores/${storeId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          authorName,
          content,
          isDisclosedAd,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "리뷰 저장 실패");
      }

      setContent("");
      setAuthorName("");
      setRating(5);
      setIsDisclosedAd(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 12,
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 14 }}>평점 (1~5)</span>
        <input
          type="number"
          min={1}
          max={5}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          required
          style={{ border: "1px solid #ccc", borderRadius: 8, padding: 8 }}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 14 }}>작성자 이름 (선택)</span>
        <input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="예: 김리뷰"
          style={{ border: "1px solid #ccc", borderRadius: 8, padding: 8 }}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 14 }}>리뷰 내용</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={4}
          placeholder="리뷰 내용을 입력하세요."
          style={{ border: "1px solid #ccc", borderRadius: 8, padding: 8 }}
        />
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input
          type="checkbox"
          checked={isDisclosedAd}
          onChange={(e) => setIsDisclosedAd(e.target.checked)}
        />
        광고/협찬 리뷰임을 표시합니다.
      </label>

      {error ? <div style={{ color: "#b00020", fontSize: 14 }}>{error}</div> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          marginTop: 4,
          borderRadius: 8,
          border: "none",
          background: "#0c5dd6",
          color: "#fff",
          padding: "10px 12px",
          fontWeight: 700,
          cursor: "pointer",
          opacity: isSubmitting ? 0.7 : 1,
        }}
      >
        {isSubmitting ? "저장 중..." : "리뷰 등록"}
      </button>
    </form>
  );
}
