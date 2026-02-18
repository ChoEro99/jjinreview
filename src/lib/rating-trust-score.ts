/**
 * 평점신뢰도 점수 계산 모듈
 * 
 * 총점 = 표본 크기 점수 (최대 65점) + 분포 자연성 점수 (최대 35점)
 */

/**
 * 표본 크기 점수 계산 (65점 만점)
 */
function computeSampleSizeScore(reviewCount: number): number {
  if (reviewCount >= 300) return 65;
  if (reviewCount >= 200) return 55;
  if (reviewCount >= 100) return 45;
  if (reviewCount >= 50) return 35;
  if (reviewCount >= 20) return 22;
  if (reviewCount >= 10) return 12;
  // 10개 미만: (reviewCount / 10) * 12, 최소 2
  return Math.max(2, (reviewCount / 10) * 12);
}

/**
 * 분포 자연성 점수 계산 (35점 만점)
 */
function computeNaturalnessScore(rating: number | null, reviewCount: number): number {
  if (rating === null) return 20;

  // 별점 4.9~5.0 + 리뷰 40개 미만
  if (rating >= 4.9 && rating <= 5.0 && reviewCount < 40) return 5;
  
  // 별점 4.8~4.9 + 리뷰 20개 미만
  if (rating >= 4.8 && rating < 4.9 && reviewCount < 20) return 8;
  
  // 별점 4.7~4.8 + 리뷰 10개 미만
  if (rating >= 4.7 && rating < 4.8 && reviewCount < 10) return 12;
  
  // 별점 3.5~4.6 (자연스러운 범위)
  if (rating >= 3.5 && rating < 4.6) return 35;
  
  // 별점 4.6~4.7 + 리뷰 100개 이상
  if (rating >= 4.6 && rating < 4.7 && reviewCount >= 100) return 30;
  
  // 별점 4.7+ + 리뷰 200개 이상
  if (rating >= 4.7 && reviewCount >= 200) return 28;
  
  // 기타
  return 20;
}

/**
 * 점수에 따른 라벨과 이모지 반환
 */
function getLabelAndEmoji(totalScore: number): { label: string; emoji: string } {
  if (totalScore >= 85) return { label: "확실함", emoji: "🟢" };
  if (totalScore >= 70) return { label: "믿을 만함", emoji: "🔵" };
  if (totalScore >= 55) return { label: "참고용", emoji: "🟡" };
  if (totalScore >= 40) return { label: "의심됨", emoji: "🟠" };
  return { label: "믿기 어려움", emoji: "🔴" };
}

/**
 * 평점신뢰도 점수 계산
 * 
 * @param rating - 외부 평점 (null 가능)
 * @param reviewCount - 리뷰 수
 * @returns 신뢰도 점수 객체
 */
export function computeRatingTrustScore(
  rating: number | null,
  reviewCount: number
): {
  totalScore: number;
  breakdown: { sampleSize: number; naturalness: number };
  label: string;
  emoji: string;
} {
  const sampleSize = computeSampleSizeScore(reviewCount);
  const naturalness = computeNaturalnessScore(rating, reviewCount);
  const totalScore = Math.round(sampleSize + naturalness);
  const { label, emoji } = getLabelAndEmoji(totalScore);

  return {
    totalScore,
    breakdown: {
      sampleSize: Math.round(sampleSize),
      naturalness: Math.round(naturalness),
    },
    label,
    emoji,
  };
}
