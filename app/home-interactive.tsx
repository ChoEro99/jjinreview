"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreWithSummary } from "@/src/lib/store-service";

type Props = {
  stores: StoreWithSummary[];
};

type StoreDetailPayload = {
  store: {
    id: number;
    name: string;
    address: string | null;
    externalRating: number | null;
    externalReviewCount: number | null;
  };
  insight: {
    reliabilityLabel: string;
    topPercent1km: number | null;
    rankWithin1km: number | null;
    rankTotalWithin1km: number | null;
    comparedStores: Array<{
      id: number | string;
      name: string;
      address: string | null;
      rank: number;
      rating: number;
      reviewCount: number;
      isSelf: boolean;
    }>;
    reviewCount: number;
    rating: number | null;
    radiusKm: number;
  };
};

const ADSENSE_CLIENT = "ca-pub-6051453612452994";
const ADSENSE_SLOT_PLACEHOLDER = "REPLACE_WITH_AD_SLOT";

function AdPlaceholder({ label }: { label: string }) {
  return (
    <div
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={ADSENSE_SLOT_PLACEHOLDER}
      style={{
        border: "1px dashed #c6b9a6",
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 12,
        color: "#8c7f73",
        background: "rgba(255, 255, 255, 0.6)",
        textAlign: "center",
      }}
    >
      광고 영역 ({label}) · 슬롯 ID 입력 후 활성화
    </div>
  );
}

function reliabilityBySnapshot(rating: number | null, reviewCount: number) {
  if (reviewCount >= 300) return "안정적 평점";
  if (reviewCount >= 120) return "비교적 안정";
  if (rating !== null && rating >= 4.9 && reviewCount < 40) return "과대평가 가능성";
  if (reviewCount >= 40) return "보통";
  return "표본 부족";
}

export default function HomeInteractive({ stores }: Props) {
  void stores;
  const MAX_SEARCH_RESULTS = 50;
  const PAGE_SIZE = 10;
  const palette = {
    bg: "#ede7d9",
    primary: "#a49694",
    text: "#736b60",
  } as const;

  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StoreWithSummary[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hoveredSearchId, setHoveredSearchId] = useState<number | null>(null);
  const [hoverSearchBtn, setHoverSearchBtn] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const searchCacheRef = useRef<Map<string, StoreWithSummary[]>>(new Map());

  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<StoreDetailPayload | null>(null);
  const [hoveredComparedKey, setHoveredComparedKey] = useState<number | string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const detailCacheRef = useRef<Map<number, StoreDetailPayload>>(new Map());

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => setUserLocation(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 1000 * 60 * 10 }
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  async function runSearch(rawKeyword: string, append = false) {
    const keyword = rawKeyword.trim();
    if (!keyword) {
      setActiveQuery("");
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    if (!append) {
      setActiveQuery(keyword);
      setSearchResults([]);
      setSearchHasMore(false);
    }

    const currentCount = append ? searchResults.length : 0;
    if (append && currentCount >= MAX_SEARCH_RESULTS) return;

    const requestOffset = currentCount;
    const requestLimit = Math.min(PAGE_SIZE, MAX_SEARCH_RESULTS - requestOffset);
    if (requestLimit <= 0) return;

    const locationKey = userLocation
      ? `${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)}`
      : "no-location";
    const cacheKey = `${keyword.toLowerCase()}|${locationKey}|${requestOffset}`;
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached) {
      if (append) {
        setSearchResults((prev) => {
          const dedup = new Map<number, StoreWithSummary>();
          for (const row of prev) dedup.set(row.id, row);
          for (const row of cached) dedup.set(row.id, row);
          return Array.from(dedup.values());
        });
      } else {
        setSearchResults(cached);
      }
      setSearchError(null);
      setSearchLoading(false);
      setSearchHasMore(cached.length === requestLimit && requestOffset + cached.length < MAX_SEARCH_RESULTS);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/stores/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: keyword,
          limit: requestLimit,
          offset: requestOffset,
          userLatitude: userLocation?.latitude,
          userLongitude: userLocation?.longitude,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stores?: StoreWithSummary[];
        hasMore?: boolean;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.stores)) {
        throw new Error(json.error || "가게 검색에 실패했습니다.");
      }
      searchCacheRef.current.set(cacheKey, json.stores);
      if (append) {
        setSearchResults((prev) => {
          const dedup = new Map<number, StoreWithSummary>();
          for (const row of prev) dedup.set(row.id, row);
          for (const row of json.stores ?? []) dedup.set(row.id, row);
          return Array.from(dedup.values());
        });
      } else {
        setSearchResults(json.stores);
      }
      setSearchHasMore(Boolean(json.hasMore) && requestOffset + (json.stores?.length ?? 0) < MAX_SEARCH_RESULTS);
    } catch (e) {
      if (!append) setSearchResults([]);
      setSearchError(e instanceof Error ? e.message : "가게 검색 실패");
      if (!append) setSearchHasMore(false);
    } finally {
      setSearchLoading(false);
    }
  }

  async function openComparedStore(item: {
    id: number | string;
    name: string;
    address: string | null;
  }) {
    if (typeof item.id === "number") {
      setSelectedStoreId(item.id);
      return;
    }

    try {
      const res = await fetch("/api/stores/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: item.name,
          limit: 20,
          offset: 0,
          userLatitude: userLocation?.latitude,
          userLongitude: userLocation?.longitude,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        stores?: StoreWithSummary[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.stores) || !json.stores.length) return;

      const normalize = (v: string | null | undefined) =>
        (v ?? "").toLowerCase().replace(/\s+/g, "").replace(/[()\-_/.,]/g, "");
      const target =
        json.stores.find(
          (row) =>
            normalize(row.name) === normalize(item.name) &&
            normalize(row.address) === normalize(item.address)
        ) ?? json.stores[0];

      setQuery(item.name);
      setActiveQuery(item.name);
      setSearchResults(json.stores);
      setSelectedStoreId(target.id);
    } catch {
      // ignore click lookup failure
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!selectedStoreId) {
        setSelectedDetail(null);
        return;
      }

      const cached = detailCacheRef.current.get(selectedStoreId);
      if (cached) {
        setSelectedDetail(cached);
        setDetailError(null);
        setDetailLoading(false);
        return;
      }

      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/stores/${selectedStoreId}`);
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          store?: StoreDetailPayload["store"];
          insight?: StoreDetailPayload["insight"];
        };
        if (!res.ok || !json.ok || !json.store || !json.insight) {
          throw new Error(json.error || "가게 상세를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          const next = { store: json.store, insight: json.insight };
          detailCacheRef.current.set(selectedStoreId, next);
          setSelectedDetail(next);
        }
      } catch (e) {
        if (!cancelled) {
          setSelectedDetail(null);
          setDetailError(e instanceof Error ? e.message : "상세 조회 실패");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedStoreId]);

  const showDetailPane = selectedStoreId !== null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: palette.bg,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        color: palette.text,
      }}
    >
      <div
        style={{
          width: isMobile ? "100%" : "min(980px, 94vw)",
          maxWidth: isMobile ? "100%" : undefined,
          padding: isMobile ? "12px 12px 20px" : 16,
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : showDetailPane
              ? "minmax(260px, 32%) minmax(0, 1fr)"
              : "1fr",
          gap: isMobile ? 10 : 14,
          alignContent: "start",
        }}
      >
        <aside
          style={{
            display: "grid",
            gap: 10,
            justifyItems: isMobile ? "stretch" : showDetailPane ? "stretch" : "center",
            paddingTop: showDetailPane ? 8 : activeQuery.trim() ? 8 : isMobile ? "2vh" : "10vh",
            textAlign: isMobile ? "left" : showDetailPane ? "left" : "center",
            alignContent: "start",
            position: isMobile ? "static" : showDetailPane ? "sticky" : "static",
            top: isMobile ? undefined : showDetailPane ? 8 : undefined,
            height: isMobile ? undefined : showDetailPane ? "fit-content" : undefined,
          }}
        >
          <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 34, fontWeight: 900, letterSpacing: "-0.02em" }}
          >
            이 별점 믿어도 될까?
          </h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            style={{
              width: "min(720px, 100%)",
              display: "flex",
              gap: 8,
              alignItems: "stretch",
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="가게 이름 검색"
              style={{
                flex: 1,
                border: `2px solid ${palette.primary}`,
                borderRadius: 14,
                padding: isMobile ? "12px 14px" : "14px 16px",
                fontSize: isMobile ? 16 : 18,
                outline: "none",
                background: palette.bg,
                color: palette.text,
                minHeight: 48,
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              onMouseEnter={() => setHoverSearchBtn(true)}
              onMouseLeave={() => setHoverSearchBtn(false)}
              style={{
                border: `2px solid ${palette.primary}`,
                borderRadius: 14,
                background: hoverSearchBtn ? palette.text : palette.primary,
                color: palette.bg,
                fontWeight: 800,
                padding: isMobile ? "0 14px" : "0 18px",
                cursor: "pointer",
                minHeight: 48,
                minWidth: isMobile ? 68 : 76,
                transition: "background 0.15s ease",
                boxSizing: "border-box",
              }}
            >
              검색
            </button>
          </form>

          {activeQuery.trim() ? (
            <>
              <div style={{ marginTop: 4, fontSize: 13, textAlign: isMobile ? "left" : "center" }}>
                검색 결과 {searchResults.length}개
              </div>
              <AdPlaceholder label="검색 결과 상단" />
              {searchLoading ? (
                <div style={{ fontSize: 12, textAlign: isMobile ? "left" : "center" }}>
                  검색 중...
                </div>
              ) : null}
              {searchError ? (
                <div style={{ fontSize: 12, textAlign: isMobile ? "left" : "center" }}>
                  {searchError}
                </div>
              ) : null}

              <ul
                style={{
                  marginTop: 8,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 8,
                  maxHeight: isMobile && showDetailPane ? "34vh" : undefined,
                  overflowY: isMobile && showDetailPane ? "auto" : undefined,
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {searchResults.map((store) => {
                  const count = store.externalReviewCount ?? 0;
                  const label = reliabilityBySnapshot(store.externalRating, count);
                  return (
                    <li key={store.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedStoreId(store.id)}
                        onMouseEnter={() => setHoveredSearchId(store.id)}
                        onMouseLeave={() => setHoveredSearchId(null)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: `2px solid ${
                            store.id === selectedStoreId || hoveredSearchId === store.id
                              ? palette.text
                              : palette.primary
                          }`,
                          borderRadius: 12,
                          background:
                            store.id === selectedStoreId
                              ? palette.primary
                              : hoveredSearchId === store.id
                                ? "#e1d7c6"
                                : palette.bg,
                          padding: isMobile ? 10 : 12,
                          cursor: "pointer",
                          color: palette.text,
                          minHeight: 60,
                          transition: "background 0.15s ease, border-color 0.15s ease",
                          boxSizing: "border-box",
                          maxWidth: "100%",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            fontSize: isMobile ? 15 : 16,
                            fontWeight: 800,
                            lineHeight: 1.3,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {store.name}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12 }}>{store.address ?? "주소 없음"}</div>
                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            gap: 10,
                            fontSize: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>⭐ {store.externalRating?.toFixed(1) ?? "-"}</span>
                          <span>리뷰 {count}</span>
                          <span>🔒 {label}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {searchHasMore ? (
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => void runSearch(activeQuery, true)}
                    style={{
                      border: `1px solid ${palette.primary}`,
                      borderRadius: 12,
                      background: palette.bg,
                      color: palette.text,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      minHeight: 40,
                    }}
                  >
                    더보기
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ marginTop: 4, fontSize: 13, textAlign: isMobile ? "left" : "center" }}>
              가게 정보는 최소 7일 단위로 업데이트 됩니다.
            </div>
          )}
        </aside>

        <section style={{ padding: isMobile ? 0 : 4, display: showDetailPane ? "block" : "none" }}>
          {detailLoading ? <div style={{ fontSize: 14 }}>가게 정보를 불러오는 중...</div> : null}
          {detailError ? <div style={{ fontSize: 14 }}>{detailError}</div> : null}

          {!detailLoading && !detailError && selectedDetail ? (
            <section
              style={{
                marginTop: 8,
                border: `2px solid ${palette.primary}`,
                borderRadius: 16,
                background: palette.bg,
                padding: isMobile ? 12 : 18,
                display: "grid",
                gap: isMobile ? 10 : 12,
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 26 : 34,
                  fontWeight: 900,
                  lineHeight: 1.25,
                  overflowWrap: "anywhere",
                }}
              >
                🍣 {selectedDetail.store.name}
              </div>
              <div style={{ fontSize: isMobile ? 28 : 28, fontWeight: 800 }}>
                ⭐ {selectedDetail.insight.rating?.toFixed(1) ?? "-"}
              </div>
              <div style={{ fontSize: isMobile ? 22 : 24, fontWeight: 700 }}>
                🔒 {selectedDetail.insight.reliabilityLabel}
              </div>
              <div style={{ fontSize: isMobile ? 22 : 24, fontWeight: 700, lineHeight: 1.3 }}>
                📍 반경 {selectedDetail.insight.radiusKm}km 상위{" "}
                {selectedDetail.insight.topPercent1km !== null
                  ? `${selectedDetail.insight.topPercent1km}%`
                  : "-"}
                {selectedDetail.insight.rankWithin1km !== null &&
                selectedDetail.insight.rankTotalWithin1km !== null
                  ? ` (${selectedDetail.insight.rankWithin1km}위 / ${selectedDetail.insight.rankTotalWithin1km})`
                  : ""}
              </div>
              <div style={{ fontSize: 14 }}>
                리뷰 {selectedDetail.insight.reviewCount}개 · 같은 안정성 라벨끼리 비교 ·{" "}
                {selectedDetail.store.address ?? "주소 없음"}
              </div>
              <AdPlaceholder label="가게 상세 요약 하단" />
              {selectedDetail.insight.comparedStores.length ? (
                <section
                  style={{
                    marginTop: 6,
                    border: `1px solid ${palette.primary}`,
                    borderRadius: 12,
                    padding: isMobile ? 8 : 10,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    1km 비교 대상 (총 {selectedDetail.insight.comparedStores.length}개)
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      maxHeight: isMobile ? "42vh" : undefined,
                      overflowY: isMobile ? "auto" : undefined,
                    }}
                  >
                    {selectedDetail.insight.comparedStores.map((item) => (
                      <li key={`cmp-${item.id}`} style={{ fontSize: 13, marginBottom: 2 }}>
                        {item.isSelf ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: 6,
                              background: palette.primary,
                              color: palette.bg,
                              fontWeight: 800,
                            }}
                          >
                            {item.rank}위 {item.name} · ⭐{item.rating.toFixed(1)} · 리뷰 {item.reviewCount} (현재 가게)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void openComparedStore(item)}
                            onMouseEnter={() => setHoveredComparedKey(item.id)}
                            onMouseLeave={() => setHoveredComparedKey(null)}
                            style={{
                              border: "none",
                              background: hoveredComparedKey === item.id ? palette.primary : "transparent",
                              padding: "6px 8px",
                              margin: 0,
                              color: hoveredComparedKey === item.id ? palette.bg : palette.text,
                              cursor: "pointer",
                              textAlign: "left",
                              fontSize: 13,
                              borderRadius: 6,
                              fontWeight: hoveredComparedKey === item.id ? 800 : 600,
                              minHeight: 36,
                            }}
                          >
                            {item.rank}위 {item.name} · ⭐{item.rating.toFixed(1)} · 리뷰 {item.reviewCount}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </section>
          ) : null}
        </section>

        <section style={{ marginTop: isMobile ? 8 : 0, gridColumn: "1 / -1" }}>
          <AdPlaceholder label="페이지 하단" />
        </section>
      </div>
    </main>
  );
}