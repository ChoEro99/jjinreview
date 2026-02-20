import { heuristicAnalyzeReview, type ReviewAnalysis } from "@/src/lib/review-engine";

type ProviderInput = {
  rating: number;
  content: string;
  isDisclosedAd?: boolean;
};

type ReviewSummaryInput = {
  storeName: string;
  storeAddress: string | null;
};

type ProviderMeta = {
  provider: "gemini" | "openai" | "heuristic";
  model: string;
  version: string;
};

export type ProviderResult = {
  analysis: ReviewAnalysis;
  meta: ProviderMeta;
};

export type ReviewSummaryResult = {
  text: string;
  adSuspectPercent: number | null;
  provider: "gemini";
  model: string;
};

const ANALYSIS_VERSION = "v1";

function parseNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeAnalysisPayload(payload: Record<string, unknown>): ReviewAnalysis {
  return {
    adRisk: Math.max(0, Math.min(1, parseNumber(payload.adRisk))),
    // External reviews cannot reliably confirm disclosure status.
    undisclosedAdRisk: 0,
    lowQualityRisk: Math.max(0, Math.min(1, parseNumber(payload.lowQualityRisk))),
    trustScore: Math.max(0, Math.min(1, parseNumber(payload.trustScore, 0.5))),
    confidence: Math.max(0, Math.min(1, parseNumber(payload.confidence, 0.5))),
    signals: parseStringArray(payload.signals),
    reasonSummary:
      typeof payload.reasonSummary === "string"
        ? payload.reasonSummary
        : "LLM 결과를 파싱하지 못해 기본 설명을 사용했습니다.",
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return null;
}

async function analyzeWithGemini(input: ProviderInput): Promise<ProviderResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_REVIEW_MODEL || "gemini-2.5-flash";

  const prompt = [
    "아래 리뷰를 분석해서 JSON 객체만 출력하세요.",
    "필드: adRisk, undisclosedAdRisk, lowQualityRisk, trustScore, confidence, signals(string[]), reasonSummary",
    "각 점수는 0~1 사이 소수.",
    "한국어 리뷰 탐지 기준:",
    "- adRisk: 광고/협찬 자체 가능성",
    "- undisclosedAdRisk: 항상 0으로 반환",
    "- lowQualityRisk: 근거 부족/도배/무지성 평가 가능성",
    "- trustScore: 경험 기반 사실성과 신뢰성",
    "리뷰 데이터:",
    JSON.stringify(input),
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
          topP: 0,
        },
      }),
    }
  );

  if (!response.ok) return null;
  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  return {
    analysis: normalizeAnalysisPayload(parsed),
    meta: {
      provider: "gemini",
      model,
      version: ANALYSIS_VERSION,
    },
  };
}

async function analyzeWithOpenAI(input: ProviderInput): Promise<ProviderResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_REVIEW_MODEL || "gpt-5-mini";

  const prompt = [
    "아래 리뷰를 분석해서 JSON으로만 답하세요.",
    "필드: adRisk, undisclosedAdRisk, lowQualityRisk, trustScore, confidence, signals(string[]), reasonSummary",
    "각 점수는 0~1 사이 소수.",
    "한국어 리뷰 탐지 기준:",
    "- adRisk: 광고/협찬 자체 가능성",
    "- undisclosedAdRisk: 항상 0으로 반환",
    "- lowQualityRisk: 근거 부족/도배/무지성 평가 가능성",
    "- trustScore: 경험 기반 사실성과 신뢰성",
    "리뷰 데이터:",
    JSON.stringify(input),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "review_analysis",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              adRisk: { type: "number", minimum: 0, maximum: 1 },
              undisclosedAdRisk: { type: "number", minimum: 0, maximum: 1 },
              lowQualityRisk: { type: "number", minimum: 0, maximum: 1 },
              trustScore: { type: "number", minimum: 0, maximum: 1 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              signals: {
                type: "array",
                items: { type: "string" },
              },
              reasonSummary: { type: "string" },
            },
            required: [
              "adRisk",
              "undisclosedAdRisk",
              "lowQualityRisk",
              "trustScore",
              "confidence",
              "signals",
              "reasonSummary",
            ],
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) return null;
  const json = (await response.json()) as { output_text?: string };
  if (!json.output_text) return null;

  const parsed = JSON.parse(json.output_text) as Record<string, unknown>;
  return {
    analysis: normalizeAnalysisPayload(parsed),
    meta: {
      provider: "openai",
      model,
      version: ANALYSIS_VERSION,
    },
  };
}

export async function analyzeReviewWithProvider(input: ProviderInput): Promise<ProviderResult> {
  try {
    const geminiResult = await analyzeWithGemini(input);
    if (geminiResult) return geminiResult;
  } catch {
    // Fallback to other providers when API call fails.
  }

  try {
    const openAiResult = await analyzeWithOpenAI(input);
    if (openAiResult) return openAiResult;
  } catch {
    // Fallback to heuristic engine when API call fails.
  }

  return {
    analysis: heuristicAnalyzeReview(input),
    meta: {
      provider: "heuristic",
      model: "rule-based-v1",
      version: ANALYSIS_VERSION,
    },
  };
}

export async function summarizeLatestReviewsWithGemini(
  input: ReviewSummaryInput
): Promise<ReviewSummaryResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_REVIEW_SUMMARY_MODEL || "gemini-2.5-flash";

  const prompt = [
    "아래 가게 정보를 기준으로 웹 검색을 사용해 최신 공개 리뷰/평판을 찾아 한국어로 요약하세요.",
    "반드시 웹 검색으로 확인한 정보만 사용하세요.",
    `가게명: ${input.storeName}`,
    `주소: ${input.storeAddress ?? "주소 정보 없음"}`,
    `기준일: ${new Date().toISOString().slice(0, 10)}`,
    "아래 JSON 객체만 출력하세요:",
    "{",
    '  "summary_lines": ["최근 리뷰 상태: ...", "..."],',
    '  "ad_suspect_percent": 0-100 사이 정수 또는 null',
    "}",
    "규칙:",
    "- summary_lines는 최대 10줄",
    "- 첫 줄은 반드시 '최근 리뷰 상태: ...' 형식",
    "- summary_lines 안에 '광고의심 비율' 문구는 쓰지 말 것",
    "- 광고 문구 금지",
    "- 과장 없이 리뷰 내용 기반으로만 작성",
    "- 없는 사실 만들지 말 것",
    "- 검색으로 확인되지 않는 내용은 제외",
    "",
    "JSON 외의 텍스트(설명/출처 링크/코드블록)는 쓰지 마세요.",
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
          topP: 0.9,
        },
      }),
    }
  );

  if (!response.ok) return null;
  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return null;

  let parsed: {
    summary_lines?: unknown;
    ad_suspect_percent?: unknown;
  } | null = null;
  try {
    const jsonText = extractJsonObject(text) ?? text;
    parsed = JSON.parse(jsonText) as {
      summary_lines?: unknown;
      ad_suspect_percent?: unknown;
    };
  } catch {
    return null;
  }

  const summaryLinesCandidate = parsed?.summary_lines;
  const rawSummaryLines = Array.isArray(summaryLinesCandidate)
    ? summaryLinesCandidate.filter((line): line is string => typeof line === "string")
    : [];

  const lines = rawSummaryLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/광고의심\s*비율/i.test(line))
    .filter((line) => !/웹\s*검색으로\s*확인된\s*리뷰\s*정보가\s*부족/i.test(line))
    .filter((line) => !/리뷰\s*정보가\s*부족/i.test(line))
    .slice(0, 10)
    .map((line) => (line.startsWith("- ") ? line : `- ${line}`));

  const hasRecentLine = lines.some((line) => line.includes("최근 리뷰 상태"));
  if (!hasRecentLine) {
    lines.unshift("- 최근 리뷰 상태: 최근 리뷰 흐름을 확인 중입니다.");
  }

  const adSuspectPercent = (() => {
    const raw = parsed?.ad_suspect_percent;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    return Math.max(0, Math.min(100, Math.round(raw)));
  })();

  const normalized = lines.slice(0, 10).join("\n");
  if (!normalized) return null;

  return {
    text: normalized,
    adSuspectPercent,
    provider: "gemini",
    model,
  };
}
