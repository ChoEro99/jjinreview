export type ReviewSource = "external" | "inapp";

export type ReviewAnalysis = {
  adRisk: number;
  undisclosedAdRisk: number;
  lowQualityRisk: number;
  trustScore: number;
  confidence: number;
  signals: string[];
  reasonSummary: string;
};

type AnalyzeInput = {
  rating: number;
  content: string;
  isDisclosedAd?: boolean;
};

const AD_KEYWORDS = [
  "협찬",
  "광고",
  "체험단",
  "지원받아",
  "제공받아",
  "원고료",
  "파트너스",
  "수수료",
  "promotion",
  "sponsored",
  "ad",
];

const CTA_KEYWORDS = [
  "링크",
  "쿠폰",
  "코드",
  "할인",
  "프로필",
  "클릭",
  "dm",
  "문의",
  "구매",
  "주문",
];

const DETAIL_WORDS = [
  "직원",
  "서비스",
  "가격",
  "양",
  "맛",
  "분위기",
  "대기",
  "화장실",
  "주차",
  "재방문",
  "메뉴",
  "portion",
  "service",
  "taste",
];

const POSITIVE_WORDS = ["친절", "맛있", "추천", "만족", "좋", "great", "good"];
const NEGATIVE_WORDS = ["불친절", "별로", "실망", "최악", "나쁘", "bad", "worst"];

// Fallback policy aligned with LLM rubric:
// - adRisk: marketing-like language/signals
// - lowQualityRisk: weak evidence / spam-like writing
// - trustScore: experience specificity and consistency

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countHashtags(text: string) {
  const matches = text.match(/#[\w\u3131-\uD79D]+/g);
  return matches?.length ?? 0;
}

function adAnyProbability(adRisk: number, undisclosedAdRisk: number) {
  return 1 - (1 - adRisk) * (1 - undisclosedAdRisk);
}

export function heuristicAnalyzeReview(input: AnalyzeInput): ReviewAnalysis {
  const rating = Math.max(1, Math.min(5, input.rating));
  const text = input.content.trim().toLowerCase();
  const disclosed = Boolean(input.isDisclosedAd);

  let adRisk = 0.06;
  let undisclosedAdRisk = 0;
  let lowQualityRisk = 0.1;
  let trustScore = 0.75;
  let confidence = 0.55;

  const signals: string[] = [];

  const hasAdKeyword = includesAny(text, AD_KEYWORDS);
  const hasCtaKeyword = includesAny(text, CTA_KEYWORDS);
  const hasDetailWord = includesAny(text, DETAIL_WORDS);
  const hasPositiveWord = includesAny(text, POSITIVE_WORDS);
  const hasNegativeWord = includesAny(text, NEGATIVE_WORDS);
  const hasLink = /(https?:\/\/|www\.|bit\.ly|linktr\.ee|open\.kakao)/.test(text);
  const hashtagCount = countHashtags(text);
  const shortText = text.length < 20;
  const repeatedChars = /(.)\1{4,}/.test(text);

  const ratingMismatch =
    (rating >= 4 && hasNegativeWord && !hasPositiveWord) ||
    (rating <= 2 && hasPositiveWord && !hasNegativeWord);

  if (disclosed) {
    adRisk += 0.45;
    trustScore -= 0.08;
    confidence += 0.08;
    signals.push("disclosed_ad");
  }

  if (hasAdKeyword) {
    adRisk += 0.22;
    trustScore -= 0.08;
    confidence += 0.06;
    signals.push("ad_keyword");
  }

  if (hasCtaKeyword) {
    adRisk += 0.18;
    trustScore -= 0.06;
    confidence += 0.05;
    signals.push("cta");
  }

  if (hasLink) {
    adRisk += 0.16;
    lowQualityRisk += 0.06;
    trustScore -= 0.05;
    confidence += 0.04;
    signals.push("has_link");
  }

  if (hashtagCount >= 5) {
    adRisk += 0.1;
    lowQualityRisk += 0.06;
    trustScore -= 0.04;
    signals.push("many_hashtags");
  }

  if (shortText) {
    lowQualityRisk += 0.22;
    trustScore -= 0.14;
    signals.push("too_short");
  }

  if (repeatedChars) {
    lowQualityRisk += 0.1;
    trustScore -= 0.08;
    signals.push("repetitive_text");
  }

  if (ratingMismatch) {
    lowQualityRisk += 0.18;
    trustScore -= 0.1;
    signals.push("rating_mismatch");
  }

  if (hasDetailWord) {
    lowQualityRisk -= 0.12;
    trustScore += 0.12;
    confidence += 0.05;
    signals.push("experience_detail");
  }

  if (hasPositiveWord && hasNegativeWord) {
    trustScore += 0.06;
    lowQualityRisk -= 0.05;
    confidence += 0.03;
    signals.push("balanced_sentiment");
  }

  adRisk = clamp01(adRisk);
  undisclosedAdRisk = clamp01(undisclosedAdRisk);
  lowQualityRisk = clamp01(lowQualityRisk);

  const adAny = adAnyProbability(adRisk, undisclosedAdRisk);
  trustScore = clamp01(trustScore - adAny * 0.35 - lowQualityRisk * 0.45);
  confidence = clamp01(confidence);

  const reasonParts: string[] = [];
  if (adAny >= 0.6) reasonParts.push("광고 가능성이 높습니다");
  if (lowQualityRisk >= 0.5) reasonParts.push("근거가 부족한 저품질 리뷰 신호가 있습니다");
  if (trustScore >= 0.7) reasonParts.push("경험 기반 정보가 포함되어 신뢰도가 높습니다");

  return {
    adRisk: round4(adRisk),
    undisclosedAdRisk: round4(undisclosedAdRisk),
    lowQualityRisk: round4(lowQualityRisk),
    trustScore: round4(trustScore),
    confidence: round4(confidence),
    signals,
    reasonSummary: reasonParts.join(". ") || "판정 신호가 부족해 보수적으로 평가했습니다.",
  };
}

export function adAnyProbabilityFromAnalysis(input: Pick<ReviewAnalysis, "adRisk" | "undisclosedAdRisk">) {
  return adAnyProbability(input.adRisk, input.undisclosedAdRisk);
}
