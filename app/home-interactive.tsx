"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { computeRatingTrustScore } from "@/src/lib/rating-trust-score";
import UserReviewForm from "@/components/UserReviewForm";
import {
  type AppLanguage,
  SUPPORTED_APP_LANGUAGES,
  appLanguageNativeLabel,
  appLanguageToLocale,
  normalizeAppLanguage,
} from "@/src/lib/language";
import { useAppLanguageClient } from "@/src/lib/app-language-client";

interface StoreBase {
  id: number;
  name: string;
  address: string | null;
  cuisineType?: string | null;
  signatureDish?: string | null;
  latitude: number | null;
  longitude: number | null;
  externalRating?: number | null;
  externalReviewCount?: number | null;
}

interface StoreSummary {
  weightedRating: number | null;
  appAverageRating: number | null;
  adSuspectRatio: number;
  trustScore: number;
  positiveRatio: number;
  reviewCount: number;
  inappReviewCount: number;
  externalReviewCount: number;
  lastAnalyzedAt: string | null;
  latestExternalReviewAt?: string | null;
}

interface StoreWithSummary extends StoreBase {
  summary: StoreSummary;
}

interface HomeInteractiveProps {
  stores: StoreWithSummary[];
  initialStoreId?: number | null;
  initialForceGoogle?: boolean;
}

interface StoreDetail {
  store: {
    name: string;
    address: string | null;
    cuisineType?: string | null;
    signatureDish?: string | null;
  };
  localizedStore?: {
    localizedName: string;
    localizedAddress: string | null;
    koreanName: string;
    koreanAddress: string | null;
  };
  aiReviewSummary?: string | null;
  aiAdSuspectPercent?: number | null;
  summary: {
    adSuspectRatio: number;
    trustScore: number;
    weightedRating: number | null;
    appAverageRating: number | null;
    reviewCount: number;
    inappReviewCount?: number;
    externalReviewCount?: number;
    positiveRatio: number;
    lastAnalyzedAt: string | null;
  };
  insight?: {
    comparedStores?: Array<{
      id: number | string;
      name: string;
      address: string | null;
      rank: number;
      rating: number;
      appAverageRating?: number | null;
      reviewCount: number;
      isSelf: boolean;
    }>;
    ratingTrustScore?: {
      totalScore: number;
      breakdown: {
        sampleSize: number;
        stability: number;
        freshness: number;
        adSuspicion: number;
        sampleSizeEmoji: string;
        stabilityEmoji: string;
        freshnessEmoji: string;
        adSuspicionEmoji: string;
        sampleSizeDesc: string;
        stabilityDesc: string;
        freshnessDesc: string;
        adSuspicionDesc: string;
      };
      label: string;
      emoji: string;
    };
    rating: number | null;
    reviewCount: number;
  };
  latestGoogleReviews?: Array<{
    authorName: string | null;
    rating: number;
    content: string;
    publishedAt: string | null;
    relativePublishedTime: string | null;
  }>;
  reviews: Array<{
    source: string;
    id: string;
    createdAt: string;
    rating: number;
    content: string;
    authorName: string | null;
    authorStats?: {
      reviewCount: number;
      averageRating: number;
    } | null;
    latestAnalysis: {
      adRisk: number;
      undisclosedAdRisk: number;
      trustScore: number;
      reasonSummary: string;
    } | null;
  }>;
  photos?: string[];
  photosFull?: string[];
}

type NearbyRecommendationApiRow = {
  store: StoreWithSummary;
};

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("abort") ||
    message.includes("aborted") ||
    message.includes("cancel") ||
    message.includes("canceled")
  );
}

function mergeDetailKeepingAi(base: StoreDetail | null, incoming: StoreDetail): StoreDetail {
  if (!base) return incoming;
  const hasIncomingAiSummary =
    typeof incoming.aiReviewSummary === "string" && incoming.aiReviewSummary.trim().length > 0;
  const hasBaseAiSummary =
    typeof base.aiReviewSummary === "string" && base.aiReviewSummary.trim().length > 0;
  return {
    ...incoming,
    aiReviewSummary: hasIncomingAiSummary
      ? incoming.aiReviewSummary
      : hasBaseAiSummary
        ? base.aiReviewSummary
        : null,
    aiAdSuspectPercent:
      typeof incoming.aiAdSuspectPercent === "number"
        ? incoming.aiAdSuspectPercent
        : typeof base.aiAdSuspectPercent === "number"
          ? base.aiAdSuspectPercent
          : null,
  };
}

function shouldShowKoreanSupplement(localized: string | null, korean: string | null) {
  if (!localized || !korean) return false;
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "").trim();
  return normalize(localized) !== normalize(korean);
}

function formatCountWithUnit(count: number, unit: string) {
  if (!Number.isFinite(count)) return "-";
  if (unit === "reviews") return `${count} ${unit}`;
  return `${count}${unit}`;
}

function localizeTrustLabel(label: string, lang: AppLanguage) {
  if (lang === "ko") return label;
  const mapEn: Record<string, string> = {
    "확실함": "Very Reliable",
    "믿을 만함": "Reliable",
    "참고용": "Use with Caution",
    "의심됨": "Suspicious",
    "믿기 어려움": "Low Reliability",
  };
  const mapJa: Record<string, string> = {
    "확실함": "とても信頼できる",
    "믿을 만함": "信頼できる",
    "참고용": "参考レベル",
    "의심됨": "注意が必要",
    "믿기 어려움": "信頼しにくい",
  };
  const mapZh: Record<string, string> = {
    "확실함": "非常可靠",
    "믿을 만함": "较可靠",
    "참고용": "仅供参考",
    "의심됨": "存疑",
    "믿기 어려움": "可信度低",
  };
  if (lang === "en") return mapEn[label] ?? label;
  if (lang === "ja") return mapJa[label] ?? label;
  return mapZh[label] ?? label;
}

function localizeTrustDesc(desc: string, lang: AppLanguage) {
  if (lang === "ko") return desc;
  const mapEn: Record<string, string> = {
    "표본이 매우 충분함": "Excellent sample size",
    "표본이 충분한 편": "Good sample size",
    "표본이 보통": "Moderate sample size",
    "표본이 작은 편": "Small sample size",
    "표본이 매우 작음": "Very small sample size",
    "리뷰 표본 없음": "No review samples",
    "평점 안정성 판단 정보 부족": "Not enough data for stability",
    "고평점 대비 표본이 작아 변동 가능성 있음": "High rating with low sample may fluctuate",
    "고평점이나 표본이 아직 충분하지 않음": "High rating but sample is still limited",
    "평점 패턴이 비교적 안정적": "Rating pattern is relatively stable",
    "최신 리뷰 작성일 정보 부족": "Not enough freshness data",
    "최신 리뷰가 최근 1주 내 작성됨": "Latest review is within 1 week",
    "최신 리뷰가 최근 2주 내 작성됨": "Latest review is within 2 weeks",
    "최신 리뷰가 최근 1개월 내 작성됨": "Latest review is within 1 month",
    "최신 리뷰가 최근 2개월 내 작성됨": "Latest review is within 2 months",
    "최신 리뷰 작성 시점이 오래됨": "Latest review is old",
    "광고의심 비율 정보 부족": "Ad-suspicion data unavailable",
    "광고의심 비율이 낮은 편": "Low ad-suspicion ratio",
    "광고의심 비율이 보통": "Moderate ad-suspicion ratio",
    "광고의심 비율이 다소 높음": "Somewhat high ad-suspicion ratio",
    "광고의심 비율이 높은 편": "High ad-suspicion ratio",
  };
  return mapEn[desc] ?? desc;
}

const HomeInteractive = ({
  stores: initialStores,
  initialStoreId = null,
  initialForceGoogle = false,
}: HomeInteractiveProps) => {
  const { language: selectedLanguage, setLanguage: setSelectedLanguage } = useAppLanguageClient();
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stores, setStores] = useState<StoreWithSummary[]>(initialStores.slice(0, 10));
  const [defaultListStores, setDefaultListStores] = useState<StoreWithSummary[]>(
    initialStores.slice(0, 10)
  );
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [storeDetail, setStoreDetail] = useState<StoreDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);
  const [hoveredCompareId, setHoveredCompareId] = useState<number | string | null>(null);
  const [navigatingComparedId, setNavigatingComparedId] = useState<number | string | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<number>>(new Set());
  const [isListDragging, setIsListDragging] = useState(false);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false);
  const [showAllComparedStores, setShowAllComparedStores] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [currentLocationLabel, setCurrentLocationLabel] = useState<string | null>(null);
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const hasAttemptedNearbyAutoLoadRef = useRef(false);
  
  // Cache for store details to avoid re-fetching
  const storeDetailCache = useRef<Map<number, StoreDetail>>(new Map());
  // Track the currently selected store for async operations
  const selectedStoreIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const storeListRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startY: number; startScrollTop: number; isDragging: boolean; moved: boolean }>({
    startY: 0,
    startScrollTop: 0,
    isDragging: false,
    moved: false,
  });
  const suppressCardClickRef = useRef(false);
  const hasAutoOpenedStoreFromQueryRef = useRef(false);
  const nearbyCompareSectionRef = useRef<HTMLDivElement | null>(null);
  const reviewFormSectionRef = useRef<HTMLDivElement | null>(null);
  const aiSummaryFetchInFlightRef = useRef<Set<number>>(new Set());
  const aiSummaryFetchAttemptedRef = useRef<Set<number>>(new Set());
  const [aiSummaryLoadingMap, setAiSummaryLoadingMap] = useState<Record<number, boolean>>({});
  const locale = useMemo(() => appLanguageToLocale(selectedLanguage), [selectedLanguage]);

  const uiText = useMemo(() => {
    if (selectedLanguage === "en") {
      return {
        appTitle: "Review Lab",
        language: "Language",
        subtitle: "Can this rating be trusted? AI trust score for reviews",
        searchPlaceholder: "Search stores (e.g. store name, address, Korean food, samgyetang)",
        locateNearby: "Nearby",
        searching: "Searching...",
        search: "Search",
        loadingNearby: "Loading stores near your current location...",
        noAddress: "No address",
        foodType: "Cuisine",
        signatureDish: "Signature",
        koreanLabel: "Korean",
        trustIndex: "Rating Trust Score",
        scoreUnit: "pts",
        appScore: "App Score",
        backToList: "Back to list",
        currentLocation: "Current location",
        openNaverMap: "Naver Map",
        openGoogleMap: "Google Maps",
        countUnit: "reviews",
        rankSuffix: "th",
        loadingAiAnalyze: "AI is analyzing reviews...",
        loadingAiSummary: "AI is summarizing reviews...",
        authorReview: "Author reviews",
        average: "avg",
        mapOpen: "Open map",
        reviewWrite: "Write Review",
        reviewWriteClose: "Close Review",
        aiSummary: "AI Review Summary",
        aiSummaryEmpty: "AI summary is not ready yet.",
        latestReview: "Latest Reviews",
        appReview: "App Reviews",
        compareNearby: "Compare Within 1km",
        currentStore: "(Current store)",
        compareEmpty: "No comparable stores within 1km.",
        loadingStoreDetail: "Loading store details...",
      };
    }
    if (selectedLanguage === "ja") {
      return {
        appTitle: "レビューラボ",
        language: "言語",
        subtitle: "この評価は信頼できる？ AIが算出する評価信頼スコア",
        searchPlaceholder: "店舗検索（例: 店名、住所、韓国料理、参鶏湯）",
        locateNearby: "近くのお店",
        searching: "検索中...",
        search: "検索",
        loadingNearby: "現在地付近の店舗を読み込み中...",
        noAddress: "住所情報なし",
        foodType: "料理ジャンル",
        signatureDish: "代表メニュー",
        koreanLabel: "韓国語",
        trustIndex: "評価信頼スコア",
        scoreUnit: "点",
        appScore: "アプリ評価",
        backToList: "一覧へ戻る",
        currentLocation: "現在地",
        openNaverMap: "NAVERマップ",
        openGoogleMap: "Googleマップ",
        countUnit: "件",
        rankSuffix: "位",
        loadingAiAnalyze: "AIがレビューを分析しています...",
        loadingAiSummary: "AIがレビューを要約しています...",
        authorReview: "投稿レビュー",
        average: "平均",
        mapOpen: "地図で見る",
        reviewWrite: "レビュー作成",
        reviewWriteClose: "レビュー作成を閉じる",
        aiSummary: "AIレビュー要約",
        aiSummaryEmpty: "AIレビュー要約はまだ準備中です。",
        latestReview: "最新レビュー",
        appReview: "アプリレビュー",
        compareNearby: "1km以内の比較",
        currentStore: "(現在の店舗)",
        compareEmpty: "半径1km以内に比較対象がありません",
        loadingStoreDetail: "店舗情報を読み込み中です...",
      };
    }
    if (selectedLanguage === "zh-CN") {
      return {
        appTitle: "评论实验室",
        language: "语言",
        subtitle: "这个评分可靠吗？AI 评分可信度指数",
        searchPlaceholder: "搜索店铺（例：店名、地址、韩餐、参鸡汤）",
        locateNearby: "附近推荐",
        searching: "搜索中...",
        search: "搜索",
        loadingNearby: "正在加载你当前位置附近的店铺...",
        noAddress: "暂无地址信息",
        foodType: "菜系",
        signatureDish: "招牌菜",
        koreanLabel: "韩文",
        trustIndex: "评分可信度指数",
        scoreUnit: "分",
        appScore: "应用评分",
        backToList: "返回列表",
        currentLocation: "当前位置",
        openNaverMap: "Naver 地图",
        openGoogleMap: "Google 地图",
        countUnit: "条",
        rankSuffix: "名",
        loadingAiAnalyze: "AI 正在分析评论...",
        loadingAiSummary: "AI 正在生成摘要...",
        authorReview: "作者评论",
        average: "平均",
        mapOpen: "在地图中查看",
        reviewWrite: "写点评",
        reviewWriteClose: "关闭写点评",
        aiSummary: "AI 评论摘要",
        aiSummaryEmpty: "AI 评论摘要暂未准备好。",
        latestReview: "最新评论",
        appReview: "应用内评论",
        compareNearby: "1km内店铺对比",
        currentStore: "(当前店铺)",
        compareEmpty: "半径1km内没有可比较店铺",
        loadingStoreDetail: "正在加载店铺信息...",
      };
    }
    return {
      appTitle: "리뷰랩",
      language: "언어",
      subtitle: "이 평점 믿어도 될까? AI가 분석해주는 평점 믿음 지수",
      searchPlaceholder: "가게 검색 (예: 가게이름, 주소, 한식, 삼계탕)",
      locateNearby: "내 근처 추천",
      searching: "검색 중...",
      search: "검색",
      loadingNearby: "현재 위치 기준으로 가게 목록을 불러오는 중...",
      noAddress: "주소 정보 없음",
      foodType: "음식 분류",
      signatureDish: "대표 메뉴",
      koreanLabel: "한국어",
      trustIndex: "평점 믿음 지수",
      scoreUnit: "점",
      appScore: "앱 점수",
      backToList: "목록으로",
      currentLocation: "현재 위치",
      openNaverMap: "네이버지도",
      openGoogleMap: "구글지도",
      countUnit: "개",
      rankSuffix: "위",
      loadingAiAnalyze: "AI가 리뷰를 분석하고 있어요",
      loadingAiSummary: "AI가 리뷰를 요약하고 있어요.",
      authorReview: "작성자 리뷰",
      average: "평균",
      mapOpen: "지도에서 보기",
      reviewWrite: "리뷰 작성",
      reviewWriteClose: "리뷰 작성 닫기",
      aiSummary: "AI 리뷰 요약",
      aiSummaryEmpty: "AI 리뷰 요약을 아직 준비하지 못했어요.",
      latestReview: "최근 리뷰",
      appReview: "리뷰랩 리뷰",
      compareNearby: "1km 이내 가게 비교",
      currentStore: "(현재 가게)",
      compareEmpty: "반경 1km 내 비교할 가게가 없습니다",
      loadingStoreDetail: "가게 정보를 불러오는 중입니다...",
    };
  }, [selectedLanguage]);

  const syncStoreIdToUrl = useCallback(
    (storeId: number | null, historyMode: "push" | "replace" = "push") => {
      const params = new URLSearchParams(window.location.search);
      if (storeId !== null) params.set("storeId", String(storeId));
      else params.delete("storeId");

      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl === currentUrl) return;

      if (historyMode === "replace") window.history.replaceState({}, "", nextUrl);
      else window.history.pushState({}, "", nextUrl);
    },
    []
  );

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    
    // Debounce resize event to improve performance
    let resizeTimeout: NodeJS.Timeout;
    const debouncedCheckMobile = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkMobile, 150);
    };
    
    window.addEventListener("resize", debouncedCheckMobile);
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", debouncedCheckMobile);
    };
  }, []);

  const handleCloseDetail = useCallback(
    (options?: { syncUrl?: boolean; historyMode?: "push" | "replace" }) => {
      const closingStoreId = selectedStoreIdRef.current;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setSelectedStoreId(null);
      selectedStoreIdRef.current = null;
      setStoreDetail(null);
      setIsLoadingDetail(false);
      setIsReviewFormOpen(false);
      setShowAllComparedStores(false);

      const shouldSyncUrl = options?.syncUrl ?? true;
      if (shouldSyncUrl) {
        syncStoreIdToUrl(null, options?.historyMode ?? "push");
      }
      if (closingStoreId !== null) {
        aiSummaryFetchAttemptedRef.current.delete(closingStoreId);
      }
    },
    [syncStoreIdToUrl]
  );

  const handleNextPhoto = useCallback(() => {
    const photosFull = storeDetail?.photosFull;
    if (!photosFull) return;
    setCurrentPhotoIndex((prev) => (prev + 1) % photosFull.length);
  }, [storeDetail?.photosFull]);

  const handlePrevPhoto = useCallback(() => {
    const photosFull = storeDetail?.photosFull;
    if (!photosFull) return;
    setCurrentPhotoIndex((prev) => (prev - 1 + photosFull.length) % photosFull.length);
  }, [storeDetail?.photosFull]);

  // Keyboard navigation for photo modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!photoModalOpen) return;
      
      if (e.key === "Escape") {
        setPhotoModalOpen(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevPhoto();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextPhoto();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [photoModalOpen, handleNextPhoto, handlePrevPhoto]);

  const handlePhotoClick = (index: number) => {
    setCurrentPhotoIndex(index);
    setPhotoModalOpen(true);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setStores(defaultListStores);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch("/api/stores/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          limit: 10,
          userLatitude: currentCoords?.latitude,
          userLongitude: currentCoords?.longitude,
          lang: selectedLanguage,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.stores) {
          setStores((data.stores as StoreWithSummary[]).slice(0, 10));
        }
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleListMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !storeListRef.current) return;
    dragStateRef.current = {
      startY: e.clientY,
      startScrollTop: storeListRef.current.scrollTop,
      isDragging: true,
      moved: false,
    };
    setIsListDragging(false);
  };

  const handleListMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.isDragging || !storeListRef.current) return;
    const deltaY = e.clientY - dragStateRef.current.startY;
    if (Math.abs(deltaY) > 4) {
      dragStateRef.current.moved = true;
      setIsListDragging(true);
      suppressCardClickRef.current = true;
    }
    storeListRef.current.scrollTop = dragStateRef.current.startScrollTop - deltaY;
  };

  const handleListMouseUpOrLeave = () => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsListDragging(false);
    if (dragStateRef.current.moved) {
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 0);
    }
  };

  const handleListScroll = () => {
    if (!storeListRef.current) return;
    setListScrollTop(storeListRef.current.scrollTop);
  };

  useEffect(() => {
    const el = storeListRef.current;
    if (!el) return;
    setListViewportHeight(el.clientHeight);
    setListScrollTop(el.scrollTop);
  }, [isMobile, selectedStoreId, stores.length]);

  useEffect(() => {
    const updateListViewport = () => {
      if (!storeListRef.current) return;
      setListViewportHeight(storeListRef.current.clientHeight);
    };
    window.addEventListener("resize", updateListViewport);
    return () => window.removeEventListener("resize", updateListViewport);
  }, []);

  const handleStoreClick = useCallback(async (
    storeId: number,
    options?: { syncUrl?: boolean; historyMode?: "push" | "replace"; forceGoogle?: boolean }
  ) => {
    const shouldSyncUrl = options?.syncUrl ?? true;
    if (shouldSyncUrl) {
      syncStoreIdToUrl(storeId, options?.historyMode ?? "push");
    }

    // 이전 진행 중인 fetch 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSelectedStoreId(storeId);
    selectedStoreIdRef.current = storeId;
    setIsReviewFormOpen(false);
    setShowAllComparedStores(false);
    setFailedPhotos(new Set());

    const cached = storeDetailCache.current.get(storeId);
    if (cached) {
      // 캐시 있으면 즉시 표시, 로딩 없음
      setStoreDetail(cached);
      setIsLoadingDetail(false);
      // 백그라운드에서 최신 데이터 갱신 (UI는 안 건드림)
      const bgParams = new URLSearchParams();
      bgParams.set("lang", selectedLanguage);
      if (options?.forceGoogle) bgParams.set("google", "1");
      const bgUrl = `/api/stores/${storeId}?${bgParams.toString()}`;
      fetch(bgUrl, { signal: controller.signal })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.ok && selectedStoreIdRef.current === storeId) {
            const prevDetail = storeDetailCache.current.get(storeId) ?? cached;
            const merged = mergeDetailKeepingAi(prevDetail, data as StoreDetail);
            storeDetailCache.current.set(storeId, merged);
            setStoreDetail(merged);
          }
        })
        .catch((error) => {
          // 취소된 요청은 정상 동작으로 간주
          if (isAbortLikeError(error)) return;
          // 백그라운드 갱신 실패는 캐시가 이미 표시 중이므로 로깅만
          console.error("Background refresh failed for store", storeId, ":", error);
        });
      return;
    }

    // 캐시 없으면 로딩 표시
    setIsLoadingDetail(true);
    setStoreDetail(null);

    try {
      const detailParams = new URLSearchParams();
      detailParams.set("lang", selectedLanguage);
      if (options?.forceGoogle) detailParams.set("google", "1");
      const detailUrl = `/api/stores/${storeId}?${detailParams.toString()}`;
      const response = await fetch(detailUrl, {
        signal: controller.signal,
      });

      if (selectedStoreIdRef.current !== storeId) return;

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          const prevDetail = storeDetailCache.current.get(storeId) ?? null;
          const merged = mergeDetailKeepingAi(prevDetail, data as StoreDetail);
          storeDetailCache.current.set(storeId, merged);
          if (selectedStoreIdRef.current === storeId) {
            setStoreDetail(merged);
          }
        } else {
          if (selectedStoreIdRef.current === storeId) {
            setStoreDetail(null);
          }
        }
      } else {
        if (selectedStoreIdRef.current === storeId) {
          setStoreDetail(null);
        }
      }
    } catch (error) {
      // 취소된 요청은 정상 동작으로 간주
      if (isAbortLikeError(error)) return;
      if (selectedStoreIdRef.current === storeId) {
        setStoreDetail(null);
      }
    } finally {
      // 현재 선택된 가게의 요청만 로딩 해제
      if (selectedStoreIdRef.current === storeId) {
        setIsLoadingDetail(false);
      }
    }
  }, [selectedLanguage, syncStoreIdToUrl]);

  const handleComparedStoreClick = async (storeId: number | string, storeName: string, storeAddress: string | null) => {
    setNavigatingComparedId(storeId);
    // If it's a number, it's already a registered store ID
    if (typeof storeId === "number") {
      await handleStoreClick(storeId);
      setNavigatingComparedId(null);
      return;
    }

    // If it's a string, check if it's in the format "store-{id}"
    const STORE_PREFIX = "store-";
    if (typeof storeId === "string" && /^store-\d+$/.test(storeId)) {
      const numericId = Number(storeId.slice(STORE_PREFIX.length));
      if (Number.isFinite(numericId) && numericId > 0) {
        await handleStoreClick(numericId);
        setNavigatingComparedId(null);
        return;
      }
    }

    // Otherwise, it's a Google place ID - search/register to get the numeric ID.
    // Keep current detail visible until we find an exact target.

    try {
      if (typeof storeId === "string") {
        const resolvedResponse = await fetch("/api/stores/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId: storeId,
            name: storeName,
            address: storeAddress,
          }),
        });
        if (resolvedResponse.ok) {
          const resolvedData = await resolvedResponse.json();
          if (
            resolvedData?.ok &&
            typeof resolvedData.storeId === "number" &&
            Number.isFinite(resolvedData.storeId) &&
            resolvedData.storeId > 0
          ) {
            handleStoreClick(resolvedData.storeId);
            return;
          }
        }
      }

      // Normalize function for better matching
      const normalize = (str: string) =>
        str.toLowerCase().trim().replace(/\s+/g, " ").replace(/[()\-_/.,]/g, "");
      const normalizedName = normalize(storeName);
      const normalizedAddress = storeAddress ? normalize(storeAddress) : null;
      const scoreCandidates = (candidates: StoreWithSummary[]) => {
        return candidates
          .map((s) => {
            const candidateName = normalize(s.name);
            const candidateAddress = s.address ? normalize(s.address) : "";
            let score = 0;
            if (candidateName === normalizedName) score += 100;
            else if (
              candidateName.includes(normalizedName) ||
              normalizedName.includes(candidateName)
            ) {
              score += 70;
            }
            if (normalizedAddress) {
              if (candidateAddress === normalizedAddress) score += 120;
              else if (
                candidateAddress.includes(normalizedAddress) ||
                normalizedAddress.includes(candidateAddress)
              ) {
                score += 95;
              } else {
                score -= 60;
              }
            }
            return { store: s, score };
          })
          .sort((a, b) => b.score - a.score);
      };

      const trySearch = async (query: string) => {
        const response = await fetch("/api/stores/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            limit: 10,
            userLatitude: currentCoords?.latitude,
            userLongitude: currentCoords?.longitude,
            lang: selectedLanguage,
          }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data?.ok || !Array.isArray(data.stores) || data.stores.length === 0) return null;
        const scored = scoreCandidates(data.stores as StoreWithSummary[]);
        return scored[0] ?? null;
      };

      // 주소가 있으면 이름+주소를 우선 검색해 동명이점 오탐을 줄인다.
      const firstQuery = storeAddress ? `${storeName} ${storeAddress}` : storeName;
      const primary = await trySearch(firstQuery);
      const secondary =
        primary && primary.score >= (normalizedAddress ? 90 : 55)
          ? null
          : await trySearch(storeAddress ? storeAddress : storeName);
      const target =
        secondary && (!primary || secondary.score > primary.score) ? secondary : primary;

      const minScore = normalizedAddress ? 90 : 50;
      if (target && target.score >= minScore) {
        await handleStoreClick(target.store.id);
      } else {
        console.warn("Compared-store match score too low. Skip navigation.", {
          storeId,
          storeName,
          storeAddress,
          bestScore: target?.score ?? null,
        });
      }
    } catch (error) {
      console.error("Error handling comparison store click:", error);
    } finally {
      setNavigatingComparedId((prev) => (prev === storeId ? null : prev));
    }
  };

  const openNaverMap = useCallback((storeName: string, storeAddress: string) => {
    const query = `${storeName} ${storeAddress}`.trim();
    const encodedQuery = encodeURIComponent(query);
    const webUrl = `https://map.naver.com/v5/search/${encodedQuery}`;
    const appUrl = `nmap://search?query=${encodedQuery}`;
    const isMobileUa = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!isMobileUa) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
      return;
    }

    let didHide = false;
    const onVisibilityChange = () => {
      if (document.hidden) didHide = true;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.location.href = appUrl;

    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (!didHide) {
        window.location.href = webUrl;
      }
    }, 900);
  }, []);

  const openGoogleMap = useCallback((storeName: string, storeAddress: string) => {
    const query = `${storeName} ${storeAddress}`.trim();
    const encodedQuery = encodeURIComponent(query);
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
    const appUrl = `comgooglemaps://?q=${encodedQuery}`;
    const isMobileUa = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!isMobileUa) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
      return;
    }

    let didHide = false;
    const onVisibilityChange = () => {
      if (document.hidden) didHide = true;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.location.href = appUrl;

    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (!didHide) {
        window.location.href = webUrl;
      }
    }, 900);
  }, []);

  useEffect(() => {
    storeDetailCache.current.clear();
    aiSummaryFetchAttemptedRef.current.clear();
    aiSummaryFetchInFlightRef.current.clear();
    if (selectedStoreIdRef.current !== null) {
      void handleStoreClick(selectedStoreIdRef.current, { syncUrl: false });
    }
  }, [selectedLanguage, handleStoreClick]);

  useEffect(() => {
    if (hasAutoOpenedStoreFromQueryRef.current) return;
    if (typeof initialStoreId === "number" && Number.isFinite(initialStoreId) && initialStoreId > 0) {
      hasAutoOpenedStoreFromQueryRef.current = true;
      void handleStoreClick(initialStoreId, {
        syncUrl: false,
        forceGoogle: initialForceGoogle,
      });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const rawStoreId = params.get("storeId");
    if (!rawStoreId) return;
    const storeId = Number(rawStoreId);
    if (!Number.isFinite(storeId) || storeId <= 0) return;
    hasAutoOpenedStoreFromQueryRef.current = true;
    void handleStoreClick(storeId, { syncUrl: false });
  }, [handleStoreClick, initialStoreId, initialForceGoogle]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const rawStoreId = params.get("storeId");
      const nextStoreId = rawStoreId ? Number(rawStoreId) : null;

      if (nextStoreId !== null && Number.isFinite(nextStoreId) && nextStoreId > 0) {
        if (selectedStoreIdRef.current !== nextStoreId) {
          void handleStoreClick(nextStoreId, { syncUrl: false });
        }
        return;
      }

      if (selectedStoreIdRef.current !== null) {
        handleCloseDetail({ syncUrl: false });
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [handleCloseDetail, handleStoreClick]);

  useEffect(() => {
    const onOpenStoreDetail = (event: Event) => {
      const custom = event as CustomEvent<{ storeId?: number }>;
      const storeId = Number(custom.detail?.storeId);
      if (!Number.isFinite(storeId) || storeId <= 0) return;
      void handleStoreClick(storeId);
    };
    window.addEventListener("open-store-detail", onOpenStoreDetail as EventListener);
    return () => {
      window.removeEventListener("open-store-detail", onOpenStoreDetail as EventListener);
    };
  }, [handleStoreClick]);

  useEffect(() => {
    if (!storeDetail || selectedStoreId === null) return;
    if (
      selectedLanguage === "ko" &&
      storeDetail.aiReviewSummary &&
      storeDetail.aiReviewSummary.trim().length > 0
    ) {
      return;
    }
    if (aiSummaryFetchInFlightRef.current.has(selectedStoreId)) return;
    if (aiSummaryFetchAttemptedRef.current.has(selectedStoreId)) return;

    aiSummaryFetchAttemptedRef.current.add(selectedStoreId);
    aiSummaryFetchInFlightRef.current.add(selectedStoreId);
    void (async () => {
      setAiSummaryLoadingMap((prev) => ({ ...prev, [selectedStoreId]: true }));
      try {
        const response = await fetch(
          `/api/stores/${selectedStoreId}/ai-summary?lang=${encodeURIComponent(selectedLanguage)}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!data?.ok) return;

        const baseDetail = storeDetailCache.current.get(selectedStoreId) ?? storeDetail;
        const aiAdSuspectPercent =
          typeof data.aiAdSuspectPercent === "number" ? data.aiAdSuspectPercent : null;
        const latestReviewAt = (() => {
          const rows = baseDetail.latestGoogleReviews ?? [];
          let latestTs = Number.NaN;
          for (const review of rows) {
            if (!review.publishedAt) continue;
            const ts = Date.parse(review.publishedAt);
            if (!Number.isFinite(ts)) continue;
            if (!Number.isFinite(latestTs) || ts > latestTs) {
              latestTs = ts;
            }
          }
          return Number.isFinite(latestTs) ? new Date(latestTs).toISOString() : null;
        })();
        const refreshedTrustScore = computeRatingTrustScore(
          baseDetail.insight?.rating ?? null,
          Math.max(
            baseDetail.insight?.reviewCount ?? 0,
            baseDetail.summary.externalReviewCount ?? 0
          ),
          {
            latestReviewAt,
            lastSyncedAt: baseDetail.summary.lastAnalyzedAt ?? null,
            adSuspectPercent: aiAdSuspectPercent,
          }
        );
        const nextDetail: StoreDetail = {
          ...baseDetail,
          aiReviewSummary:
            typeof data.aiReviewSummary === "string" && data.aiReviewSummary.trim().length > 0
              ? data.aiReviewSummary
              : baseDetail.aiReviewSummary ?? null,
          aiAdSuspectPercent,
          insight: baseDetail.insight
            ? {
                ...baseDetail.insight,
                ratingTrustScore: refreshedTrustScore,
              }
            : baseDetail.insight,
        };
        storeDetailCache.current.set(selectedStoreId, nextDetail);
        if (selectedStoreIdRef.current === selectedStoreId) {
          setStoreDetail(nextDetail);
        }
      } catch {
        // Keep silent: summary fetch failure should not block detail UI.
      } finally {
        aiSummaryFetchInFlightRef.current.delete(selectedStoreId);
        setAiSummaryLoadingMap((prev) => ({ ...prev, [selectedStoreId]: false }));
      }
    })();
  }, [selectedLanguage, selectedStoreId, storeDetail]);

  const showDetailPane = selectedStoreId !== null;
  const LIST_CARD_HEIGHT = 126;
  const LIST_OVERSCAN = 5;

  const storeCards = useMemo(
    () =>
      stores.map((store) => {
        const externalCount = Math.max(
          store.summary.externalReviewCount ?? 0,
          store.externalReviewCount ?? 0
        );
        const inappCount = Math.max(store.summary.inappReviewCount ?? 0, 0);
        const totalReviewCount = Math.max(store.summary.reviewCount, externalCount + inappCount);
        const ratingTrust = computeRatingTrustScore(
          store.externalRating ?? null,
          externalCount,
          {
            latestReviewAt: store.summary.latestExternalReviewAt ?? null,
            lastSyncedAt: store.summary.lastAnalyzedAt ?? null,
          }
        );
        return { store, totalReviewCount, externalCount, inappCount, ratingTrust };
      }),
    [stores]
  );

  const visibleComparedStores = useMemo(() => {
    const compared = storeDetail?.insight?.comparedStores ?? [];
    const sliced = showAllComparedStores ? compared : compared.slice(0, 5);
    return sliced.map((comparedStore) => ({
      ...comparedStore,
      trustScore: computeRatingTrustScore(comparedStore.rating, comparedStore.reviewCount),
    }));
  }, [storeDetail?.insight?.comparedStores, showAllComparedStores]);

  const virtualizedStoreCards = useMemo(() => {
    if (!storeCards.length) {
      return { visible: [] as typeof storeCards, topSpacer: 0, bottomSpacer: 0 };
    }

    if (listViewportHeight <= 0) {
      return { visible: storeCards, topSpacer: 0, bottomSpacer: 0 };
    }

    const startIndex = Math.max(0, Math.floor(listScrollTop / LIST_CARD_HEIGHT) - LIST_OVERSCAN);
    const visibleCount = Math.ceil(listViewportHeight / LIST_CARD_HEIGHT) + LIST_OVERSCAN * 2;
    const endIndex = Math.min(storeCards.length, startIndex + visibleCount);

    return {
      visible: storeCards.slice(startIndex, endIndex),
      topSpacer: startIndex * LIST_CARD_HEIGHT,
      bottomSpacer: Math.max(0, (storeCards.length - endIndex) * LIST_CARD_HEIGHT),
    };
  }, [storeCards, listScrollTop, listViewportHeight]);

  const handleLocateAndRecommend = useCallback(() => {
    void (async () => {
      if (typeof window === "undefined") return;
      setIsLocating(true);
      setLocationErrorMessage(null);
      try {
        let coords: { latitude: number; longitude: number } | null = null;

        if (Capacitor.isNativePlatform()) {
          const permission = await Geolocation.checkPermissions();
          const hasPermission =
            permission.location === "granted" || permission.coarseLocation === "granted";
          if (!hasPermission) {
            const requested = await Geolocation.requestPermissions();
            const granted =
              requested.location === "granted" || requested.coarseLocation === "granted";
            if (!granted) {
              throw new Error("location_permission_denied");
            }
          }
          const nativePosition = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60_000,
          });
          coords = {
            latitude: nativePosition.coords.latitude,
            longitude: nativePosition.coords.longitude,
          };
        } else if ("geolocation" in navigator) {
          const webPosition = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60_000,
            });
          });
          coords = {
            latitude: webPosition.coords.latitude,
            longitude: webPosition.coords.longitude,
          };
        }

        if (!coords) {
          throw new Error("geolocation_unavailable");
        }
        setCurrentCoords(coords);

        const reversePromise = fetch(
          `/api/geocode/reverse?lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(
            coords.longitude
          )}`
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((payload: { ok?: boolean; label?: string } | null) => {
            if (payload?.ok && typeof payload.label === "string") {
              setCurrentLocationLabel(payload.label);
            }
          })
          .catch(() => null);

        const response = await fetch("/api/stores/nearby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: coords.latitude,
            longitude: coords.longitude,
            limit: 10,
            keyword: searchQuery.trim() || undefined,
            lang: selectedLanguage,
          }),
        });
        if (!response.ok) throw new Error("nearby_api_failed");
        const data = (await response.json()) as {
          ok?: boolean;
          recommendations?: NearbyRecommendationApiRow[];
        };
        if (!data.ok || !Array.isArray(data.recommendations)) {
          throw new Error("invalid_nearby_response");
        }
        const normalized = data.recommendations.map((row) => row.store);
        if (normalized.length > 0) {
          setDefaultListStores(normalized);
          setStores(normalized);
        }
        await reversePromise;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("denied") || message.includes("permission")) {
          setLocationErrorMessage("위치 권한이 꺼져 있어요. 앱 설정에서 위치 권한을 허용해 주세요.");
        } else if (message.includes("unavailable")) {
          setLocationErrorMessage("이 기기에서는 위치 정보를 사용할 수 없어요.");
        } else {
          setLocationErrorMessage("현재 위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        setIsLocating(false);
      }
    })();
  }, [searchQuery, selectedLanguage]);

  useEffect(() => {
    if (hasAttemptedNearbyAutoLoadRef.current) return;
    hasAttemptedNearbyAutoLoadRef.current = true;
    handleLocateAndRecommend();
  }, [handleLocateAndRecommend]);

  // Calculate combined ad risk probability from individual risk scores
  const calculateCombinedAdRisk = (adRisk: number, undisclosedAdRisk: number): number => {
    // Formula: P(A or B) = 1 - P(not A) * P(not B)
    return 1 - (1 - adRisk) * (1 - undisclosedAdRisk);
  };

  const LIST_VISIBLE_CARD_COUNT = 5;
  const LIST_CONTAINER_HEIGHT = LIST_CARD_HEIGHT * LIST_VISIBLE_CARD_COUNT;

  // Must closely match actual footer rendered height to avoid bottom white gap.
  const RESERVED_FOOTER_HEIGHT = isMobile ? 52 : 42;

  const scrollToReviewForm = useCallback(() => {
    reviewFormSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleReviewWriteClick = useCallback(() => {
    if (isReviewFormOpen) {
      setIsReviewFormOpen(false);
      return;
    }
    setIsReviewFormOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToReviewForm();
      });
    });
  }, [isReviewFormOpen, scrollToReviewForm]);

  return (
    <div
      style={{
        height: `calc(100dvh - ${RESERVED_FOOTER_HEIGHT}px)`,
        background: "rgba(71, 104, 44, 0.08)",
        color: "#28502E",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          background: "#28502E",
          color: "#ffffff",
          padding: isMobile ? "12px 16px 14px" : "24px 20px 20px",
          textAlign: "center",
          position: "relative",
        }}
      >
        <h1 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 800, margin: 0, color: "#ffffff" }}>{uiText.appTitle}</h1>
        <p style={{ marginTop: 6, fontSize: isMobile ? 12 : 16, opacity: 1, color: "#e8dfc9" }}>
          {uiText.subtitle}
        </p>
        <div
          style={{
            position: "absolute",
            top: isMobile ? 40 : 56,
            right: isMobile ? 10 : 16,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(40, 80, 46, 0.36)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 10,
            padding: "5px 8px",
          }}
        >
          <span style={{ fontSize: 12, color: "#e8dfc9", fontWeight: 700 }}>{uiText.language}</span>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(normalizeAppLanguage(e.target.value))}
            style={{
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              padding: "5px 8px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {SUPPORTED_APP_LANGUAGES.map((lang) => (
              <option key={lang} value={lang} style={{ color: "#1b2b1f" }}>
                {appLanguageNativeLabel(lang)}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: isMobile ? "1fr" : showDetailPane ? "1fr 2fr" : "1fr",
          gap: 0,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <aside
          style={{
            minWidth: 0,
            height: "100%",
            background: "rgba(71, 104, 44, 0.06)",
            borderRight: isMobile ? "none" : "1px solid rgba(140, 112, 81, 0.3)",
            display: isMobile && showDetailPane ? "none" : "block",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: isMobile ? 12 : 20, height: "100%", boxSizing: "border-box" }}>
            <form onSubmit={handleSearch} style={{ marginBottom: isMobile ? 12 : 20 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={uiText.searchPlaceholder}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: isMobile ? "11px 12px" : "12px 16px",
                    border: "1px solid rgba(140, 112, 81, 0.3)",
                    borderRadius: 8,
                    fontSize: isMobile ? 14 : 15,
                    outline: "none",
                    background: "rgba(71, 104, 44, 0.04)",
                    color: "#28502E",
                  }}
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  style={{
                    minWidth: isMobile ? 88 : 98,
                    padding: isMobile ? "11px 12px" : "12px 16px",
                    background: isSearching ? "#ccc" : "#28502E",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: isMobile ? 14 : 15,
                    fontWeight: 700,
                    cursor: isSearching ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSearching) {
                      e.currentTarget.style.background = "#47682C";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSearching) {
                      e.currentTarget.style.background = "#28502E";
                    }
                  }}
                >
                  {isSearching ? uiText.searching : uiText.search}
                </button>
              </div>
              <button
                type="button"
                onClick={handleLocateAndRecommend}
                disabled={isLocating}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: isMobile ? "10px 12px" : "11px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(40, 80, 46, 0.5)",
                  background: "rgba(40, 80, 46, 0.08)",
                  color: "#28502E",
                  fontWeight: 700,
                  cursor: isLocating ? "not-allowed" : "pointer",
                }}
              >
                {uiText.locateNearby}
              </button>
            </form>
            {isLocating && (
              <div style={{ marginTop: -4, marginBottom: 8, fontSize: 12, color: "#8C7051" }}>
                {uiText.loadingNearby}
              </div>
            )}
            {locationErrorMessage && (
              <div style={{ marginTop: -4, marginBottom: 8, fontSize: 12, color: "#B94A48", fontWeight: 700 }}>
                {locationErrorMessage}
              </div>
            )}
            {currentLocationLabel && (
              <div style={{ fontSize: 12, color: "#47682C", fontWeight: 700, marginBottom: 8 }}>
                {uiText.currentLocation}: {currentLocationLabel}
              </div>
            )}

            <div
              ref={storeListRef}
              className="hide-scrollbar"
              onMouseDown={handleListMouseDown}
              onMouseMove={handleListMouseMove}
              onMouseUp={handleListMouseUpOrLeave}
              onMouseLeave={handleListMouseUpOrLeave}
              onScroll={handleListScroll}
              style={{
                height: LIST_CONTAINER_HEIGHT,
                overflowY: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                cursor: isListDragging ? "grabbing" : "grab",
              }}
            >
              {virtualizedStoreCards.topSpacer > 0 && (
                <div aria-hidden style={{ height: virtualizedStoreCards.topSpacer }} />
              )}
              {virtualizedStoreCards.visible.map(({ store, totalReviewCount, externalCount, inappCount, ratingTrust }) => {
                const isSelected = selectedStoreId === store.id;
                const isHovered = hoveredCardId === store.id;

                return (
                  <div
                    key={store.id}
                    onClick={() => {
                      if (suppressCardClickRef.current) return;
                      handleStoreClick(store.id);
                    }}
                    onMouseEnter={() => setHoveredCardId(store.id)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    style={{
                      padding: isMobile ? 12 : 14,
                      marginBottom: 10,
                      border: isSelected ? "2px solid #28502E" : "1px solid rgba(140, 112, 81, 0.4)",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: isSelected ? "rgba(40, 80, 46, 0.15)" : isHovered ? "rgba(71, 104, 44, 0.18)" : "rgba(71, 104, 44, 0.1)",
                      transition: "all 0.2s ease",
                      boxShadow: isHovered ? "0 2px 8px rgba(140, 112, 81, 0.2)" : "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: isMobile ? 15 : 16, marginBottom: 4, color: "#28502E" }}>
                      {store.name}
                    </div>
                    <div style={{ fontSize: 13, color: "#8C7051", marginBottom: 8 }}>
                      {store.address ?? uiText.noAddress}
                    </div>
                    {(store.cuisineType || store.signatureDish) && (
                      <div style={{ fontSize: 12, color: "#47682C", marginBottom: 8, fontWeight: 700 }}>
                        {store.cuisineType ? `${uiText.foodType}: ${store.cuisineType}` : ""}
                        {store.cuisineType && store.signatureDish ? " · " : ""}
                        {store.signatureDish ? `${uiText.signatureDish}: ${store.signatureDish}` : ""}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "#28502E" }}>
                        ⭐ {store.summary.weightedRating?.toFixed(1) ?? "-"} ({formatCountWithUnit(externalCount, uiText.countUnit)})
                      </span>
                      <span style={{ color: "#47682C", fontWeight: 700 }}>
                        ★ {uiText.appScore} {store.summary.appAverageRating?.toFixed(1) ?? "-"} ({formatCountWithUnit(inappCount, uiText.countUnit)})
                      </span>
                      <span style={{ color: "#28502E" }}>
                        {uiText.trustIndex} {totalReviewCount > 0 ? `${ratingTrust.emoji} ${localizeTrustLabel(ratingTrust.label, selectedLanguage)} (${ratingTrust.totalScore}${uiText.scoreUnit ? ` ${uiText.scoreUnit}` : ""})` : "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {virtualizedStoreCards.bottomSpacer > 0 && (
                <div aria-hidden style={{ height: virtualizedStoreCards.bottomSpacer }} />
              )}
            </div>

            <div
              style={{
                marginTop: 12,
                border: "1px dashed rgba(140, 112, 81, 0.3)",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 12,
                color: "#8C7051",
                background: "rgba(140, 112, 81, 0.06)",
                textAlign: "center",
              }}
            >
              광고 영역 (가게 목록 하단)
            </div>
          </div>
        </aside>

        <section
          className="hide-scrollbar"
          style={{
            padding: isMobile ? 14 : 24,
            display: showDetailPane ? "block" : "none",
            height: "100%",
            minWidth: 0,
            maxWidth: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            background: "rgba(40, 80, 46, 0.05)",
          }}
        >
          {isMobile && (
            <button
              onClick={() => handleCloseDetail()}
              style={{
                marginBottom: 16,
                padding: "8px 16px",
                background: "rgba(71, 104, 44, 0.12)",
                border: "1px solid rgba(140, 112, 81, 0.3)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                color: "#28502E",
              }}
            >
              ← {uiText.backToList}
            </button>
          )}

          {isLoadingDetail && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#28502E" }}>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                  0%, 100% { opacity: 0.4; }
                  50% { opacity: 1; }
                }
              `}</style>
              <div style={{
                width: 48,
                height: 48,
                border: "4px solid rgba(40, 80, 46, 0.15)",
                borderTopColor: "#28502E",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 20px",
              }} />
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                🔍 {uiText.loadingAiAnalyze}
              </div>
              <div style={{ fontSize: 14, color: "#8C7051", animation: "pulse 1.5s ease-in-out infinite" }}>
                {selectedLanguage === "ko" ? "잠시만 기다려주세요" : "Please wait..."}
              </div>
            </div>
          )}

          {!isLoadingDetail && storeDetail && (
            <div>
              {(() => {
                const externalCount = Math.max(
                  storeDetail.insight?.reviewCount ?? 0,
                  storeDetail.summary.externalReviewCount ?? 0
                );
                const inappCount = Math.max(storeDetail.summary.inappReviewCount ?? 0, 0);
                const localizedName = storeDetail.localizedStore?.localizedName ?? storeDetail.store.name;
                const localizedAddress =
                  storeDetail.localizedStore?.localizedAddress ?? storeDetail.store.address;
                const koreanName = storeDetail.localizedStore?.koreanName ?? storeDetail.store.name;
                const koreanAddress =
                  storeDetail.localizedStore?.koreanAddress ?? storeDetail.store.address;
                return (
              <div
                style={{
                  border: "1px solid rgba(140, 112, 81, 0.4)",
                  borderRadius: 14,
                  padding: isMobile ? 16 : 24,
                  background: "rgba(71, 104, 44, 0.1)",
                  marginBottom: 16,
                }}
              >
                {/* Main content: store info on left, photos on right (desktop) */}
                <div
                  style={{
                    display: isMobile ? "block" : "flex",
                    gap: isMobile ? 16 : 24,
                    alignItems: "flex-start",
                  }}
                >
                  {/* Left side: Store info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 가게 이름 */}
                    <div style={{ fontSize: isMobile ? 23 : 28, fontWeight: 800, color: "#28502E", marginBottom: 6 }}>
                      🍽 {localizedName}
                    </div>
                    {selectedLanguage !== "ko" && shouldShowKoreanSupplement(localizedName, koreanName) && (
                      <div style={{ fontSize: isMobile ? 14 : 15, color: "#8C7051", fontWeight: 700, marginBottom: 12 }}>
                        {uiText.koreanLabel}: {koreanName}
                      </div>
                    )}
                    {(storeDetail.store.cuisineType || storeDetail.store.signatureDish) && (
                      <div style={{ fontSize: isMobile ? 13 : 14, color: "#47682C", marginBottom: 12, fontWeight: 700 }}>
                        {storeDetail.store.cuisineType ? `${uiText.foodType}: ${storeDetail.store.cuisineType}` : ""}
                        {storeDetail.store.cuisineType && storeDetail.store.signatureDish ? " · " : ""}
                        {storeDetail.store.signatureDish ? `${uiText.signatureDish}: ${storeDetail.store.signatureDish}` : ""}
                      </div>
                    )}

                    {/* 평점 */}
                    {storeDetail.insight?.rating !== null && storeDetail.insight?.rating !== undefined && (
                      <>
                        <div style={{ fontSize: isMobile ? 34 : 44, fontWeight: 800, color: "#28502E", marginBottom: 4 }}>
                          ⭐ {storeDetail.insight.rating.toFixed(1)} <span style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#28502E" }}>({formatCountWithUnit(externalCount, uiText.countUnit)})</span>
                        </div>
                        <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: "#47682C", marginBottom: 12 }}>
                          ★ {uiText.appScore} {storeDetail.summary.appAverageRating?.toFixed(1) ?? "-"} <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: "#47682C" }}>({formatCountWithUnit(inappCount, uiText.countUnit)})</span>
                        </div>
                      </>
                    )}

                    {/* 평점신뢰도 */}
                    {storeDetail.insight?.ratingTrustScore && (() => {
                      const { label, emoji, totalScore, breakdown } = storeDetail.insight.ratingTrustScore;
                      const detailReviewCount = Math.max(
                        storeDetail.insight?.reviewCount ?? 0,
                        storeDetail.summary.reviewCount
                      );
                      
                      return (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: "#28502E" }}>
                            {uiText.trustIndex} {detailReviewCount > 0 ? `${emoji} ${localizeTrustLabel(label, selectedLanguage)} (${totalScore}${uiText.scoreUnit ? ` ${uiText.scoreUnit}` : ""})` : "-"}
                          </div>
                          {detailReviewCount > 0 && (
                            <div style={{ fontSize: isMobile ? 12 : 13, color: "#8C7051", marginTop: 6 }}>
                              <div style={{ lineHeight: 1.45 }}>
                                {localizeTrustDesc(breakdown.sampleSizeDesc, selectedLanguage)} ({breakdown.sampleSize}{selectedLanguage === "en" ? ` ${uiText.scoreUnit}` : uiText.scoreUnit} {breakdown.sampleSizeEmoji})
                              </div>
                              <div style={{ lineHeight: 1.45 }}>
                                {localizeTrustDesc(breakdown.stabilityDesc, selectedLanguage)} ({breakdown.stability}{selectedLanguage === "en" ? ` ${uiText.scoreUnit}` : uiText.scoreUnit} {breakdown.stabilityEmoji})
                              </div>
                              <div style={{ lineHeight: 1.45 }}>
                                {localizeTrustDesc(breakdown.freshnessDesc, selectedLanguage)} ({breakdown.freshness}{selectedLanguage === "en" ? ` ${uiText.scoreUnit}` : uiText.scoreUnit} {breakdown.freshnessEmoji})
                              </div>
                              <div style={{ lineHeight: 1.45 }}>
                                {localizeTrustDesc(breakdown.adSuspicionDesc, selectedLanguage)} ({breakdown.adSuspicion}{selectedLanguage === "en" ? ` ${uiText.scoreUnit}` : uiText.scoreUnit} {breakdown.adSuspicionEmoji})
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 1km 순위 */}
                    {storeDetail.insight?.comparedStores && (() => {
                      const selfStore = storeDetail.insight.comparedStores.find(s => s.isSelf);
                      if (!selfStore) return null;
                      
                      const rank = selfStore.rank;
                      const total = storeDetail.insight.comparedStores.length;
                      return (
                        <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: "#28502E", marginBottom: 16 }}>
                          <button
                            type="button"
                            onClick={() => {
                              nearbyCompareSectionRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              margin: 0,
                              color: "#28502E",
                              fontSize: isMobile ? 16 : 18,
                              fontWeight: 700,
                              cursor: "pointer",
                              textAlign: "left",
                              textDecoration: "none",
                            }}
                          >
                            📍 1km {selectedLanguage === "ko" ? "이내 종합점수" : "rank"} {rank}{uiText.rankSuffix} / {formatCountWithUnit(total, uiText.countUnit)}
                          </button>
                        </div>
                      );
                    })()}

                    {/* 주소 링크 */}
                    <div style={{ fontSize: isMobile ? 15 : 16, color: "#28502E", lineHeight: 1.4 }}>
                      {localizedAddress ? (
                        <div style={{ marginBottom: 6, fontWeight: 700 }}>
                          {localizedAddress}
                          {selectedLanguage !== "ko" &&
                            shouldShowKoreanSupplement(localizedAddress, koreanAddress) && (
                              <span style={{ color: "#8C7051", marginLeft: 8 }}>
                                ({uiText.koreanLabel}: {koreanAddress})
                              </span>
                            )}
                        </div>
                      ) : (
                        <div style={{ marginBottom: 6 }}>{uiText.noAddress}</div>
                      )}
                      {storeDetail.store.address ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const address = storeDetail.store.address;
                              if (!address) return;
                              openNaverMap(storeDetail.store.name, address);
                            }}
                            style={{
                              border: "1px solid rgba(40, 80, 46, 0.35)",
                              background: "rgba(40, 80, 46, 0.08)",
                              padding: "6px 10px",
                              borderRadius: 8,
                              margin: 0,
                              color: "#28502E",
                              textDecoration: "none",
                              cursor: "pointer",
                              textAlign: "left",
                              fontSize: isMobile ? 13 : 14,
                              fontWeight: 700,
                              lineHeight: 1.3,
                            }}
                          >
                            📍 {uiText.openNaverMap}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const address = storeDetail.store.address;
                              if (!address) return;
                              openGoogleMap(storeDetail.store.name, address);
                            }}
                            style={{
                              border: "1px solid rgba(40, 80, 46, 0.35)",
                              background: "rgba(40, 80, 46, 0.08)",
                              padding: "6px 10px",
                              borderRadius: 8,
                              margin: 0,
                              color: "#28502E",
                              textDecoration: "none",
                              cursor: "pointer",
                              textAlign: "left",
                              fontSize: isMobile ? 13 : 14,
                              fontWeight: 700,
                              lineHeight: 1.3,
                            }}
                          >
                            📍 {uiText.openGoogleMap}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Right side: action + photos */}
                  <div
                    style={{
                      width: isMobile ? "100%" : "320px",
                      flexShrink: 0,
                      marginTop: isMobile ? 16 : 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleReviewWriteClick}
                      style={{
                        width: "100%",
                        marginBottom: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(40, 80, 46, 0.5)",
                        background: isReviewFormOpen ? "rgba(40, 80, 46, 0.14)" : "#28502E",
                        color: isReviewFormOpen ? "#28502E" : "#ffffff",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {isReviewFormOpen ? uiText.reviewWriteClose : uiText.reviewWrite}
                    </button>

                    {storeDetail.photos && storeDetail.photos.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
                        {storeDetail.photos.slice(0, 3).map((photoUrl, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: "100%",
                              height: "100px",
                              borderRadius: 8,
                              overflow: "hidden",
                              position: "relative",
                              background: failedPhotos.has(idx) ? "rgba(140, 112, 81, 0.2)" : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {failedPhotos.has(idx) ? (
                              <span style={{ fontSize: 12, color: "#8C7051" }}>사진 로드 실패</span>
                            ) : (
                              <Image
                                src={photoUrl}
                                alt={`${storeDetail.store.name} 사진 ${idx + 1}`}
                                unoptimized
                                fill
                                sizes="(max-width: 768px) 33vw, 120px"
                                onClick={() => handlePhotoClick(idx)}
                                onError={() => {
                                  setFailedPhotos(prev => new Set(prev).add(idx));
                                }}
                                style={{
                                  objectFit: "cover",
                                  cursor: "pointer",
                                  transition: "transform 0.2s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = "scale(1.05)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = "scale(1)";
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
                );
              })()}

              {/* Photo Modal */}
              {photoModalOpen && storeDetail.photosFull && storeDetail.photosFull.length > 0 && (
                <div
                  onClick={() => setPhotoModalOpen(false)}
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0, 0, 0, 0.9)",
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                  }}
                >
                  {/* Close button */}
                  <button
                    onClick={() => setPhotoModalOpen(false)}
                    style={{
                      position: "absolute",
                      top: 20,
                      right: 20,
                      background: "rgba(255, 255, 255, 0.2)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: 32,
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                    }}
                  >
                    ×
                  </button>

                  {/* Previous button */}
                  {storeDetail.photosFull.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevPhoto();
                      }}
                      style={{
                        position: "absolute",
                        left: 20,
                        background: "rgba(255, 255, 255, 0.2)",
                        border: "none",
                        color: "#ffffff",
                        fontSize: 32,
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      }}
                    >
                      ‹
                    </button>
                  )}

                  {/* Photo */}
                  {failedPhotos.has(currentPhotoIndex) ? (
                    <div
                      style={{
                        background: "rgba(140, 112, 81, 0.3)",
                        padding: "40px 60px",
                        borderRadius: 8,
                        textAlign: "center",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                      <div style={{ fontSize: 16, color: "#ffffff" }}>사진을 불러올 수 없습니다</div>
                    </div>
                  ) : (
                    <Image
                      src={storeDetail.photosFull[currentPhotoIndex]}
                      alt={`${storeDetail.store.name} 사진`}
                      unoptimized
                      width={1400}
                      height={1000}
                      onClick={(e) => e.stopPropagation()}
                      onError={() => {
                        setFailedPhotos(prev => new Set(prev).add(currentPhotoIndex));
                      }}
                      style={{
                        maxWidth: "90%",
                        maxHeight: "90%",
                        width: "auto",
                        height: "auto",
                        objectFit: "contain",
                        borderRadius: 8,
                      }}
                    />
                  )}

                  {/* Next button */}
                  {storeDetail.photosFull.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextPhoto();
                      }}
                      style={{
                        position: "absolute",
                        right: 20,
                        background: "rgba(255, 255, 255, 0.2)",
                        border: "none",
                        color: "#ffffff",
                        fontSize: 32,
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      }}
                    >
                      ›
                    </button>
                  )}

                  {/* Photo counter */}
                  {storeDetail.photosFull.length > 1 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 20,
                        background: "rgba(0, 0, 0, 0.6)",
                        color: "#ffffff",
                        padding: "8px 16px",
                        borderRadius: 20,
                        fontSize: 14,
                      }}
                    >
                      {currentPhotoIndex + 1} / {storeDetail.photosFull.length}
                    </div>
                  )}
                </div>
              )}

              {/* 애드센스 광고 플레이스홀더 (가게 상세 하단) */}
              <div
                style={{
                  border: "1px dashed rgba(140, 112, 81, 0.3)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "#8C7051",
                  background: "rgba(140, 112, 81, 0.06)",
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                광고 영역 (가게 상세 요약 하단)
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  {uiText.aiSummary}
                </h3>
                {(() => {
                  const isAiSummaryLoading =
                    selectedStoreId !== null && aiSummaryLoadingMap[selectedStoreId] === true;
                  const lines = (storeDetail.aiReviewSummary ?? "")
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
                  const [head, ...rest] = lines;

                  if (isAiSummaryLoading) {
                    return (
                      <div
                        style={{
                          border: "1px solid rgba(140, 112, 81, 0.3)",
                          borderRadius: 12,
                          padding: 14,
                          color: "#28502E",
                          background: "rgba(140, 112, 81, 0.06)",
                        }}
                      >
                        <style>{`
                          @keyframes aiSummarySpin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                          }
                        `}</style>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              border: "2px solid rgba(40, 80, 46, 0.25)",
                              borderTopColor: "#28502E",
                              borderRadius: "50%",
                              animation: "aiSummarySpin 0.9s linear infinite",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ fontSize: 14, fontWeight: 700 }}>
                            {uiText.loadingAiSummary}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (!head) {
                    return (
                      <div
                        style={{
                          border: "1px solid rgba(140, 112, 81, 0.3)",
                          borderRadius: 12,
                          padding: 14,
                          color: "#28502E",
                          background: "rgba(140, 112, 81, 0.06)",
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {uiText.aiSummaryEmpty}
                      </div>
                    );
                  }

                  return (
                    <div
                      style={{
                        border: "1px solid rgba(140, 112, 81, 0.3)",
                        borderRadius: 12,
                        padding: 14,
                        color: "#28502E",
                        background: "rgba(140, 112, 81, 0.06)",
                        lineHeight: 1.5,
                        fontSize: 14,
                      }}
                    >
                      {head && (
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 15,
                            background: "rgba(71, 104, 44, 0.14)",
                            borderRadius: 8,
                            padding: "6px 8px",
                            marginBottom: rest.length > 0 ? 8 : 0,
                          }}
                        >
                          {head}
                        </div>
                      )}
                      {rest.length > 0 && (
                        <div style={{ whiteSpace: "pre-line" }}>{rest.join("\n")}</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  {uiText.latestReview}
                </h3>
                {storeDetail.latestGoogleReviews && storeDetail.latestGoogleReviews.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {storeDetail.latestGoogleReviews.map((review, idx) => (
                      <div
                        key={`${review.publishedAt ?? "no-date"}-${idx}`}
                        style={{
                          border: "1px solid rgba(140, 112, 81, 0.3)",
                          borderRadius: 12,
                          padding: 12,
                          background: "rgba(140, 112, 81, 0.06)",
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, color: "#28502E", marginBottom: 6 }}>
                          <strong>{review.rating.toFixed(1)}{selectedLanguage === "en" ? "" : "점"}</strong>
                          <span>{review.authorName ?? (selectedLanguage === "ko" ? "익명" : "Anonymous")}</span>
                          <span style={{ color: "#8C7051" }}>
                            {review.relativePublishedTime ?? (review.publishedAt ? new Date(review.publishedAt).toLocaleDateString(locale) : "-")}
                          </span>
                        </div>
                        <div style={{ color: "#28502E", lineHeight: 1.45, fontSize: 14 }}>
                          {review.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    border: "1px solid rgba(140, 112, 81, 0.3)",
                    borderRadius: 12,
                    padding: 16,
                    color: "#8C7051",
                    background: "rgba(140, 112, 81, 0.06)",
                    fontSize: 14,
                  }}>
                    {selectedLanguage === "ko"
                      ? "최신 구글 리뷰를 불러오지 못했거나 공개된 리뷰가 없습니다."
                      : "Latest public reviews are not available."}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  {uiText.appReview}
                </h3>

                <div style={{ display: "grid", gap: 12 }}>
                  {storeDetail.reviews.map((review) => {
                    const adAny = review.latestAnalysis
                      ? calculateCombinedAdRisk(
                          review.latestAnalysis.adRisk,
                          review.latestAnalysis.undisclosedAdRisk
                        )
                      : null;

                    return (
                      <div
                        key={`${review.source}-${review.id}`}
                        style={{
                          border: "1px solid rgba(140, 112, 81, 0.3)",
                          borderRadius: 12,
                          padding: 14,
                          background: (adAny ?? 0) >= 0.6 ? "rgba(140, 112, 81, 0.15)" : "rgba(71, 104, 44, 0.06)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 12,
                            fontSize: 14,
                            marginBottom: 8,
                            color: "#28502E",
                          }}
                        >
                          <strong>{review.rating.toFixed(1)}{selectedLanguage === "en" ? "" : "점"}</strong>
                          <span>
                            {review.source === "external"
                              ? (selectedLanguage === "ko" ? "외부" : "External")
                              : (selectedLanguage === "ko" ? "앱" : "App")}
                          </span>
                          <span style={{ color: "#47682C", fontWeight: 700 }}>
                            ★ {uiText.appScore} {storeDetail.summary.appAverageRating?.toFixed(1) ?? "-"}
                          </span>
                          {review.authorStats && (
                            <span>
                              {uiText.authorReview} {formatCountWithUnit(review.authorStats.reviewCount, uiText.countUnit)} · {uiText.average} {review.authorStats.averageRating.toFixed(1)}{selectedLanguage === "en" ? "" : "점"}
                            </span>
                          )}
                        </div>
                        <p style={{ lineHeight: 1.5, margin: "8px 0", color: "#28502E" }}>{review.content}</p>
                        {review.latestAnalysis && (
                          <div style={{ fontSize: 12, color: "#8C7051", marginBottom: 6 }}>
                            근거: {review.latestAnalysis.reasonSummary}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "#8C7051" }}>
                          {review.authorName ?? "익명"} ·{" "}
                          {new Date(review.createdAt).toLocaleString(locale)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div ref={nearbyCompareSectionRef} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  {uiText.compareNearby}
                </h3>
                {storeDetail.insight?.comparedStores && storeDetail.insight.comparedStores.length > 0 ? (
                  <div style={{ border: "1px solid rgba(140, 112, 81, 0.4)", borderRadius: 12, background: "rgba(140, 112, 81, 0.06)", overflow: "hidden" }}>
                    {visibleComparedStores.map((comparedStore, idx, list) => {
                      const isHovered = hoveredCompareId === comparedStore.id;
                      const isNavigating = navigatingComparedId === comparedStore.id;
                      return (
                        <div
                          key={comparedStore.id}
                          onClick={() => {
                            if (!comparedStore.isSelf && !isNavigating) {
                              handleComparedStoreClick(comparedStore.id, comparedStore.name, comparedStore.address);
                            }
                          }}
                          onMouseEnter={() => setHoveredCompareId(comparedStore.id)}
                          onMouseLeave={() => setHoveredCompareId(null)}
                          style={{
                            padding: "10px 14px",
                            borderBottom: idx === list.length - 1 ? "none" : "1px solid rgba(140, 112, 81, 0.4)",
                            background: comparedStore.isSelf ? "rgba(40, 80, 46, 0.18)" : isHovered ? "rgba(71, 104, 44, 0.15)" : "rgba(140, 112, 81, 0.06)",
                            cursor: comparedStore.isSelf || isNavigating ? "default" : "pointer",
                            transition: "all 0.2s ease",
                            fontSize: 14,
                            color: "#28502E",
                            opacity: isNavigating ? 0.75 : 1,
                          }}
                        >
                          <span style={{ fontWeight: comparedStore.isSelf ? 700 : 400 }}>
                            {comparedStore.rank}위 {comparedStore.name}
                          </span>
                          {isNavigating && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: "#8C7051", fontWeight: 700 }}>
                              ⏳ 이동 중...
                            </span>
                          )}
                          {comparedStore.isSelf && (
                            <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: "#28502E" }}>
                              {uiText.currentStore}
                            </span>
                          )}
                          <span style={{ marginLeft: 8, color: "#8C7051" }}>
                            · ⭐{comparedStore.rating.toFixed(1)} · <span style={{ color: "#47682C", fontWeight: 700 }}>★ {uiText.appScore} {typeof comparedStore.appAverageRating === "number" ? comparedStore.appAverageRating.toFixed(1) : "-"}</span> · {formatCountWithUnit(comparedStore.reviewCount, uiText.countUnit)} · {comparedStore.reviewCount > 0 ? `${comparedStore.trustScore.emoji} ${comparedStore.trustScore.totalScore} ${uiText.scoreUnit}` : "-"}
                          </span>
                        </div>
                      );
                    })}
                    {storeDetail.insight.comparedStores.length > 5 && (
                      <div style={{ padding: 10, borderTop: "1px solid rgba(140, 112, 81, 0.3)", background: "rgba(140, 112, 81, 0.08)", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => setShowAllComparedStores((prev) => !prev)}
                          style={{
                            border: "1px solid rgba(40, 80, 46, 0.5)",
                            background: "transparent",
                            color: "#28502E",
                            borderRadius: 8,
                            padding: "7px 12px",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {showAllComparedStores
                            ? "접기"
                            : `더보기 (+${storeDetail.insight.comparedStores.length - 5})`}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    border: "1px solid rgba(140, 112, 81, 0.3)",
                    borderRadius: 12,
                    padding: 20,
                    textAlign: "center",
                    color: "#8C7051",
                    fontSize: 14,
                    background: "rgba(140, 112, 81, 0.06)",
                  }}>
                    {uiText.compareEmpty}
                  </div>
                )}
              </div>

              {/* 애드센스 광고 플레이스홀더 (리뷰 섹션 앞) */}
              <div
                style={{
                  border: "1px dashed rgba(140, 112, 81, 0.3)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "#8C7051",
                  background: "rgba(140, 112, 81, 0.06)",
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                광고 영역 (리뷰 목록 상단)
              </div>

              {/* 리뷰 작성 */}
              <div
                ref={reviewFormSectionRef}
                style={{ marginBottom: isReviewFormOpen ? 24 : 0, display: isReviewFormOpen ? "block" : "none" }}
              >
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  {uiText.reviewWrite}
                </h3>
                <UserReviewForm storeId={selectedStoreId!} />
              </div>
            </div>
          )}

          {!isLoadingDetail && !storeDetail && showDetailPane && (
            <div style={{ textAlign: "center", padding: 40, color: "#8C7051" }}>
              {uiText.loadingStoreDetail}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomeInteractive;
