"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { computeRatingTrustScore } from "@/src/lib/rating-trust-score";
import UserReviewForm from "@/components/UserReviewForm";

interface StoreBase {
  id: number;
  name: string;
  address: string | null;
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
}

interface StoreDetail {
  store: {
    name: string;
    address: string | null;
  };
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
        sampleSizeEmoji: string;
        stabilityEmoji: string;
        freshnessEmoji: string;
        sampleSizeDesc: string;
        stabilityDesc: string;
        freshnessDesc: string;
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

const HomeInteractive = ({ stores: initialStores, initialStoreId = null }: HomeInteractiveProps) => {
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
        body: JSON.stringify({ query: searchQuery.trim(), limit: 10 }),
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
    options?: { syncUrl?: boolean; historyMode?: "push" | "replace" }
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
      fetch(`/api/stores/${storeId}`, { signal: controller.signal })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.ok && selectedStoreIdRef.current === storeId) {
            storeDetailCache.current.set(storeId, data);
            setStoreDetail(data);
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
      const response = await fetch(`/api/stores/${storeId}`, {
        signal: controller.signal,
      });

      if (selectedStoreIdRef.current !== storeId) return;

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          storeDetailCache.current.set(storeId, data);
          if (selectedStoreIdRef.current === storeId) {
            setStoreDetail(data);
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
  }, [syncStoreIdToUrl]);

  const handleComparedStoreClick = async (storeId: number | string, storeName: string, storeAddress: string | null) => {
    // If it's a number, it's already a registered store ID
    if (typeof storeId === "number") {
      handleStoreClick(storeId);
      return;
    }

    // If it's a string, check if it's in the format "store-{id}"
    const STORE_PREFIX = "store-";
    if (typeof storeId === "string" && storeId.startsWith(STORE_PREFIX)) {
      const numericId = parseInt(storeId.substring(STORE_PREFIX.length), 10);
      if (!isNaN(numericId)) {
        handleStoreClick(numericId);
        return;
      } else {
        // Malformed store- prefix, treat as Google place ID
        console.warn("Malformed store ID format:", storeId, "- treating as Google place ID");
      }
    }

    // Otherwise, it's a Google place ID - search/register to get the numeric ID
    setIsLoadingDetail(true);
    setStoreDetail(null);

    try {
      // Normalize function for better matching
      const normalize = (str: string) => str.toLowerCase().trim().replace(/\s+/g, " ");
      
      // Search for the store using its name (which should trigger auto-registration if not found)
      const searchQuery = storeAddress ? `${storeName} ${storeAddress}` : storeName;
      const response = await fetch("/api/stores/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, limit: 5 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.stores && data.stores.length > 0) {
          // Find the best match - look for exact name and address match with normalization
          const normalizedName = normalize(storeName);
          const normalizedAddress = storeAddress ? normalize(storeAddress) : null;
          
          const exactMatch = data.stores.find((s: StoreWithSummary) => {
            const nameMatch = normalize(s.name) === normalizedName;
            const addressMatch = normalizedAddress 
              ? (s.address ? normalize(s.address) === normalizedAddress : false)
              : true;
            return nameMatch && addressMatch;
          });

          const targetStore = exactMatch || data.stores[0];
          handleStoreClick(targetStore.id);
        } else {
          console.error("No stores found for comparison store:", storeName);
          setIsLoadingDetail(false);
        }
      } else {
        console.error("Failed to search for comparison store:", response.status, response.statusText);
        setIsLoadingDetail(false);
      }
    } catch (error) {
      console.error("Error handling comparison store click:", error);
      setIsLoadingDetail(false);
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

  useEffect(() => {
    if (hasAutoOpenedStoreFromQueryRef.current) return;
    if (typeof initialStoreId === "number" && Number.isFinite(initialStoreId) && initialStoreId > 0) {
      hasAutoOpenedStoreFromQueryRef.current = true;
      void handleStoreClick(initialStoreId, { syncUrl: false });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const rawStoreId = params.get("storeId");
    if (!rawStoreId) return;
    const storeId = Number(rawStoreId);
    if (!Number.isFinite(storeId) || storeId <= 0) return;
    hasAutoOpenedStoreFromQueryRef.current = true;
    void handleStoreClick(storeId, { syncUrl: false });
  }, [handleStoreClick, initialStoreId]);

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
  }, []);

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

  const HEADER_AND_SEARCH_HEIGHT = isMobile ? 198 : 280; // Height of header + search form + padding

  return (
    <div style={{ minHeight: "100vh", background: "rgba(71, 104, 44, 0.08)", color: "#28502E" }}>
      <header
        style={{
          background: "#28502E",
          color: "#ffffff",
          padding: isMobile ? "12px 16px 8px" : "24px 20px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 800, margin: 0, color: "#ffffff" }}>리뷰랩</h1>
        <p style={{ marginTop: 6, fontSize: isMobile ? 12 : 16, opacity: 1, color: "#e8dfc9" }}>
          이 평점 믿어도 될까? AI가 분석해주는 평점 믿음 지수
        </p>
      </header>

      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: isMobile ? "1fr" : showDetailPane ? "1fr 2fr" : "1fr",
          gap: 0,
          minWidth: 0,
        }}
      >
        <aside
          style={{
            minWidth: 0,
            background: "rgba(71, 104, 44, 0.06)",
            borderRight: isMobile ? "none" : "1px solid rgba(140, 112, 81, 0.3)",
            display: isMobile && showDetailPane ? "none" : "block",
          }}
        >
          <div style={{ padding: isMobile ? 12 : 20 }}>
            <form onSubmit={handleSearch} style={{ marginBottom: isMobile ? 12 : 20 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="가게 이름이나 주소로 검색..."
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
                  {isSearching ? "검색 중..." : "검색"}
                </button>
              </div>
            </form>
            {isLocating && (
              <div style={{ marginTop: -4, marginBottom: 8, fontSize: 12, color: "#8C7051" }}>
                현재 위치 기준으로 가게 목록을 불러오는 중...
              </div>
            )}
            {locationErrorMessage && (
              <div style={{ marginTop: -4, marginBottom: 8, fontSize: 12, color: "#B94A48", fontWeight: 700 }}>
                {locationErrorMessage}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              {currentLocationLabel ? (
                <div style={{ fontSize: 12, color: "#47682C", fontWeight: 700, flex: 1, minWidth: 0 }}>
                  현재 위치: {currentLocationLabel}
                </div>
              ) : (
                <div style={{ flex: 1 }} />
              )}
              <button
                type="button"
                onClick={handleLocateAndRecommend}
                disabled={isLocating}
                style={{
                  padding: isMobile ? "8px 10px" : "9px 12px",
                  background: isLocating ? "#ccc" : "#47682C",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: 700,
                  cursor: isLocating ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {isLocating ? "위치 확인 중..." : "다시 추천받기"}
              </button>
            </div>

            <div
              ref={storeListRef}
              className="hide-scrollbar"
              onMouseDown={handleListMouseDown}
              onMouseMove={handleListMouseMove}
              onMouseUp={handleListMouseUpOrLeave}
              onMouseLeave={handleListMouseUpOrLeave}
              onScroll={handleListScroll}
              style={{
                maxHeight: `calc(100vh - ${HEADER_AND_SEARCH_HEIGHT}px)`,
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
                      {store.address ?? "주소 정보 없음"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "#28502E" }}>
                        ⭐ {store.summary.weightedRating?.toFixed(1) ?? "-"} ({externalCount}개)
                      </span>
                      <span style={{ color: "#47682C", fontWeight: 700 }}>
                        ★ 앱 점수 {store.summary.appAverageRating?.toFixed(1) ?? "-"} ({inappCount}개)
                      </span>
                      <span style={{ color: "#28502E" }}>
                        평점 믿음 지수 {totalReviewCount > 0 ? `${ratingTrust.emoji} ${ratingTrust.label} (${ratingTrust.totalScore}점)` : "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {virtualizedStoreCards.bottomSpacer > 0 && (
                <div aria-hidden style={{ height: virtualizedStoreCards.bottomSpacer }} />
              )}
            </div>
          </div>
        </aside>

        <section
          style={{
            padding: isMobile ? 14 : 24,
            display: showDetailPane ? "block" : "none",
            minWidth: 0,
            maxWidth: "100%",
            overflow: "auto",
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
              ← 목록으로
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
                🔍 AI가 리뷰를 분석하고 있어요
              </div>
              <div style={{ fontSize: 14, color: "#8C7051", animation: "pulse 1.5s ease-in-out infinite" }}>
                잠시만 기다려주세요
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
                    <div style={{ fontSize: isMobile ? 23 : 28, fontWeight: 800, color: "#28502E", marginBottom: 16 }}>
                      🍽 {storeDetail.store.name}
                    </div>

                    {/* 평점 */}
                    {storeDetail.insight?.rating !== null && storeDetail.insight?.rating !== undefined && (
                      <>
                        <div style={{ fontSize: isMobile ? 34 : 44, fontWeight: 800, color: "#28502E", marginBottom: 4 }}>
                          ⭐ {storeDetail.insight.rating.toFixed(1)} <span style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#28502E" }}>({externalCount}개)</span>
                        </div>
                        <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 800, color: "#47682C", marginBottom: 12 }}>
                          ★ 앱 점수 {storeDetail.summary.appAverageRating?.toFixed(1) ?? "-"} <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: "#47682C" }}>({inappCount}개)</span>
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
                            평점 믿음 지수 {detailReviewCount > 0 ? `${emoji} ${label} (${totalScore}점)` : "-"}
                          </div>
                          {detailReviewCount > 0 && (
                            <div style={{ fontSize: isMobile ? 12 : 13, color: "#8C7051", marginTop: 6 }}>
                              <div style={{ lineHeight: 1.45 }}>
                                {breakdown.sampleSizeDesc} (표본 {breakdown.sampleSize}점 {breakdown.sampleSizeEmoji})
                              </div>
                              <div style={{ lineHeight: 1.45 }}>
                                {breakdown.stabilityDesc} (안정성 {breakdown.stability}점 {breakdown.stabilityEmoji})
                              </div>
                              <div style={{ lineHeight: 1.45 }}>
                                {breakdown.freshnessDesc} (최신성 {breakdown.freshness}점 {breakdown.freshnessEmoji})
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
                      const percentile = Math.round((rank / total) * 100);
                      
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
                            📍 1km 이내 상위 {percentile}% ({rank}위 / {total}개)
                          </button>
                        </div>
                      );
                    })()}

                    {/* 주소 링크 */}
                    <div style={{ fontSize: isMobile ? 12 : 13, color: "#8C7051", lineHeight: 1.4 }}>
                      {storeDetail.store.address ? (
                        <button
                          type="button"
                          onClick={() =>
                            openNaverMap(storeDetail.store.name, storeDetail.store.address)
                          }
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            color: "#8C7051",
                            textDecoration: "none",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: isMobile ? 12 : 13,
                            lineHeight: 1.4,
                          }}
                        >
                          {storeDetail.store.address}
                        </button>
                      ) : (
                        "주소 정보 없음"
                      )}
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
                      onClick={() => setIsReviewFormOpen((prev) => !prev)}
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
                      {isReviewFormOpen ? "리뷰 작성 닫기" : "리뷰 작성"}
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
                광고 영역 (가게 상세 요약 하단) · 슬롯 ID 입력 후 활성화
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  최신 리뷰
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
                          <strong>{review.rating.toFixed(1)}점</strong>
                          <span>{review.authorName ?? "익명"}</span>
                          <span style={{ color: "#8C7051" }}>
                            {review.relativePublishedTime ?? (review.publishedAt ? new Date(review.publishedAt).toLocaleDateString("ko-KR") : "-")}
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
                    최신 구글 리뷰를 불러오지 못했거나 공개된 리뷰가 없습니다.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  리뷰랩 리뷰
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
                          <strong>{review.rating.toFixed(1)}점</strong>
                          <span>{review.source === "external" ? "외부" : "앱"}</span>
                          <span style={{ color: "#47682C", fontWeight: 700 }}>
                            ★ 앱 점수 {storeDetail.summary.appAverageRating?.toFixed(1) ?? "-"}
                          </span>
                          {review.authorStats && (
                            <span>
                              작성자 리뷰 {review.authorStats.reviewCount}개 · 평균 {review.authorStats.averageRating.toFixed(1)}점
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
                          {new Date(review.createdAt).toLocaleString("ko-KR")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div ref={nearbyCompareSectionRef} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  1km 이내 가게 비교
                </h3>
                {storeDetail.insight?.comparedStores && storeDetail.insight.comparedStores.length > 0 ? (
                  <div style={{ border: "1px solid rgba(140, 112, 81, 0.4)", borderRadius: 12, background: "rgba(140, 112, 81, 0.06)", overflow: "hidden" }}>
                    {visibleComparedStores.map((comparedStore, idx, list) => {
                      const isHovered = hoveredCompareId === comparedStore.id;
                      return (
                        <div
                          key={comparedStore.id}
                          onClick={() => {
                            if (!comparedStore.isSelf) {
                              handleComparedStoreClick(comparedStore.id, comparedStore.name, comparedStore.address);
                            }
                          }}
                          onMouseEnter={() => setHoveredCompareId(comparedStore.id)}
                          onMouseLeave={() => setHoveredCompareId(null)}
                          style={{
                            padding: "10px 14px",
                            borderBottom: idx === list.length - 1 ? "none" : "1px solid rgba(140, 112, 81, 0.4)",
                            background: comparedStore.isSelf ? "rgba(40, 80, 46, 0.18)" : isHovered ? "rgba(71, 104, 44, 0.15)" : "rgba(140, 112, 81, 0.06)",
                            cursor: comparedStore.isSelf ? "default" : "pointer",
                            transition: "all 0.2s ease",
                            fontSize: 14,
                            color: "#28502E",
                          }}
                        >
                          <span style={{ fontWeight: comparedStore.isSelf ? 700 : 400 }}>
                            {comparedStore.rank}위 {comparedStore.name}
                          </span>
                          {comparedStore.isSelf && (
                            <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: "#28502E" }}>
                              (현재 가게)
                            </span>
                          )}
                          <span style={{ marginLeft: 8, color: "#8C7051" }}>
                            · ⭐{comparedStore.rating.toFixed(1)} · <span style={{ color: "#47682C", fontWeight: 700 }}>★ 앱 점수 {typeof comparedStore.appAverageRating === "number" ? comparedStore.appAverageRating.toFixed(1) : "-"}</span> · 리뷰 {comparedStore.reviewCount} · {comparedStore.reviewCount > 0 ? `${comparedStore.trustScore.emoji} ${comparedStore.trustScore.totalScore}점` : "-"}
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
                    반경 1km 내 비교할 가게가 없습니다
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
                광고 영역 (리뷰 목록 상단) · 슬롯 ID 입력 후 활성화
              </div>

              {/* 리뷰 작성 */}
              <div style={{ marginBottom: isReviewFormOpen ? 24 : 0, display: isReviewFormOpen ? "block" : "none" }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "#28502E" }}>
                  리뷰 작성
                </h3>
                <UserReviewForm storeId={selectedStoreId!} />
              </div>
            </div>
          )}

          {!isLoadingDetail && !storeDetail && showDetailPane && (
            <div style={{ textAlign: "center", padding: 40, color: "#8C7051" }}>
              가게 정보를 불러오는 중입니다...
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomeInteractive;
