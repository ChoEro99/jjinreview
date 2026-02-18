/**
 * 평점 믿음 지수
 * 총점 = 표본 신뢰(50) + 평점 안정성(25) + 최신성(25)
 * 출처 일치도는 의도적으로 제외함.
 */

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeSampleSizeScore(reviewCount: number): number {
  if (reviewCount <= 0) return 0;
  const raw = (Math.log10(reviewCount + 1) / Math.log10(501)) * 50;
  return clamp(raw, 0, 50);
}

function getSampleSizeDesc(reviewCount: number): string {
  if (reviewCount >= 300) return "표본이 매우 충분함";
  if (reviewCount >= 100) return "표본이 충분한 편";
  if (reviewCount >= 30) return "표본이 보통";
  if (reviewCount >= 10) return "표본이 작은 편";
  if (reviewCount > 0) return "표본이 매우 작음";
  return "리뷰 표본 없음";
}

function computeStabilityScore(rating: number | null, reviewCount: number): number {
  if (rating === null || reviewCount <= 0) return 6;
  const highRating = clamp((rating - 4.2) / 0.8, 0, 1);
  const lowSamplePenalty = clamp((40 - reviewCount) / 40, 0, 1);
  const extremePenalty = highRating * lowSamplePenalty * 19;
  return clamp(25 - extremePenalty, 4, 25);
}

function getStabilityDesc(rating: number | null, reviewCount: number): string {
  if (rating === null || reviewCount <= 0) return "평점 안정성 판단 정보 부족";
  if (rating >= 4.8 && reviewCount < 20) return "고평점 대비 표본이 작아 변동 가능성 있음";
  if (rating >= 4.6 && reviewCount < 40) return "고평점이나 표본이 아직 충분하지 않음";
  return "평점 패턴이 비교적 안정적";
}

function computeFreshnessScore(lastSyncedAt?: string | null): number {
  if (!lastSyncedAt) return 10;
  const ts = Date.parse(lastSyncedAt);
  if (!Number.isFinite(ts)) return 10;
  const days = (Date.now() - ts) / (24 * 60 * 60 * 1000);
  if (days <= 1) return 25;
  if (days <= 3) return 22;
  if (days <= 7) return 19;
  if (days <= 14) return 14;
  if (days <= 30) return 9;
  return 4;
}

function getFreshnessDesc(lastSyncedAt?: string | null): string {
  if (!lastSyncedAt) return "갱신 시각 정보 부족";
  const ts = Date.parse(lastSyncedAt);
  if (!Number.isFinite(ts)) return "갱신 시각 정보 부족";
  const days = (Date.now() - ts) / (24 * 60 * 60 * 1000);
  if (days <= 1) return "매우 최근에 갱신됨";
  if (days <= 7) return "최근 1주 내 갱신됨";
  if (days <= 30) return "최근 1개월 내 갱신됨";
  return "갱신된 지 오래됨";
}

function getComponentEmoji(score: number, maxScore: number): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.8) return "🟢";
  if (ratio >= 0.6) return "🔵";
  if (ratio >= 0.4) return "🟡";
  if (ratio >= 0.2) return "🟠";
  return "🔴";
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
  reviewCount: number,
  options?: { lastSyncedAt?: string | null }
): {
  totalScore: number;
  breakdown: {
    sampleSize: number;
    stability: number;
    freshness: number;
    sampleSizeEmoji: string;
    stabilityEmoji: string;
    freshnessEmoji: string;
    sampleSizeDesc: string;
    stabilityDesc: string;
    freshnessDesc: string;
  };
  label: string;
  emoji: string;
} {
  const sampleSize = computeSampleSizeScore(reviewCount);
  const stability = computeStabilityScore(rating, reviewCount);
  const freshness = computeFreshnessScore(options?.lastSyncedAt);
  const totalScore = Math.round(sampleSize + stability + freshness);
  const { label, emoji } = getLabelAndEmoji(totalScore);

  return {
    totalScore,
    breakdown: {
      sampleSize: Math.round(sampleSize),
      stability: Math.round(stability),
      freshness: Math.round(freshness),
      sampleSizeEmoji: getComponentEmoji(sampleSize, 50),
      stabilityEmoji: getComponentEmoji(stability, 25),
      freshnessEmoji: getComponentEmoji(freshness, 25),
      sampleSizeDesc: getSampleSizeDesc(reviewCount),
      stabilityDesc: getStabilityDesc(rating, reviewCount),
      freshnessDesc: getFreshnessDesc(options?.lastSyncedAt),
    },
    label,
    emoji,
  };
}
