"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ExistingStore = {
  id: number;
  name: string;
  address: string | null;
};

type PlaceSearchResult = {
  id: string;
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
};

type KakaoMaps = {
  services: {
    Status: { OK: string };
    Places: new () => {
      keywordSearch: (
        keyword: string,
        callback: (result: PlaceSearchResult[], status: string) => void
      ) => void;
    };
  };
  load: (cb: () => void) => void;
};

function getKakaoGlobal() {
  return window as unknown as { kakao?: { maps: KakaoMaps } };
}

type Props = {
  existingStores: ExistingStore[];
  onSearchResults?: (
    places: Array<{
      id: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
    }>
  ) => void;
  onSelectPlace?: (place: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  }) => void;
  centerAddress?: string;
  nearbyPlaces?: Array<{
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    category: "food" | "cafe" | "spot";
  }>;
  selectedPlace?: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  } | null;
  selectedDetail?: {
    store: {
      id: number;
      name: string;
      address: string | null;
    };
    summary: {
      weightedRating: number | null;
      adSuspectRatio: number;
      trustScore: number;
      reviewCount: number;
    };
    reviews: Array<{
      id: number;
      rating: number;
      content: string;
      authorName: string | null;
      createdAt: string;
    }>;
  } | null;
  detailLoading?: boolean;
};

function loadKakaoSdk(appKey: string): Promise<KakaoMaps> {
  return new Promise((resolve, reject) => {
    const global = getKakaoGlobal();
    if (global.kakao?.maps) {
      global.kakao.maps.load(() => resolve(global.kakao!.maps));
      return;
    }

    const scriptId = "kakao-map-sdk";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    const onLoad = () => {
      const loaded = getKakaoGlobal();
      if (!loaded.kakao?.maps) {
        reject(new Error("kakao maps sdk unavailable"));
        return;
      }
      loaded.kakao.maps.load(() => resolve(loaded.kakao!.maps));
    };

    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`;
    script.onload = onLoad;
    script.onerror = () => reject(new Error("failed to load kakao sdk"));
    document.head.appendChild(script);
  });
}

async function searchPlaces(appKey: string, keyword: string) {
  const maps = await loadKakaoSdk(appKey);
  return new Promise<PlaceSearchResult[]>((resolve, reject) => {
    const places = new maps.services.Places();
    places.keywordSearch(keyword, (result, status) => {
      if (status !== maps.services.Status.OK) {
        reject(new Error("검색 결과가 없습니다."));
        return;
      }
      resolve(result || []);
    });
  });
}

export default function StorePicker({
  existingStores,
  onSearchResults,
  onSelectPlace,
  centerAddress = "",
  nearbyPlaces = [],
  selectedPlace = null,
  selectedDetail = null,
  detailLoading = false,
}: Props) {
  const router = useRouter();
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "";
  const missingAppKey = !appKey;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<"all" | "food" | "cafe" | "spot">("all");

  const keySet = useMemo(() => {
    return new Set(
      existingStores.map((store) => `${store.name}::${(store.address || "").trim()}`)
    );
  }, [existingStores]);

  const nearbyByCategory = useMemo(() => {
    return {
      food: nearbyPlaces.filter((place) => place.category === "food"),
      cafe: nearbyPlaces.filter((place) => place.category === "cafe"),
      spot: nearbyPlaces.filter((place) => place.category === "spot"),
    };
  }, [nearbyPlaces]);

  const filteredNearby = useMemo(() => {
    if (activeCategory === "all") return nearbyPlaces;
    return nearbyByCategory[activeCategory];
  }, [activeCategory, nearbyPlaces, nearbyByCategory]);

  async function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const keyword = query.trim();
    if (!keyword) {
      setError("검색어를 입력하세요.");
      return;
    }

    if (missingAppKey) {
      setError("NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 없어 검색할 수 없습니다.");
      return;
    }

    try {
      setLoading(true);
      const found = await searchPlaces(appKey, keyword);
      setResults(found.slice(0, 10));
      onSearchResults?.(
        found
          .map((place) => ({
            id: place.id,
            name: place.place_name,
            address: place.road_address_name || place.address_name || null,
            latitude: Number(place.y),
            longitude: Number(place.x),
          }))
          .filter(
            (place) =>
              Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
          )
          .slice(0, 10)
      );
      if (!found.length) {
        setNotice("검색 결과가 없습니다.");
      }
    } catch (e) {
      setResults([]);
      onSearchResults?.([]);
      setError(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setLoading(false);
    }
  }

  async function addStore(place: PlaceSearchResult) {
    setError(null);
    setNotice(null);
    setAddingId(place.id);

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kakaoPlaceId: place.id,
          name: place.place_name,
          address: place.road_address_name || place.address_name || null,
          latitude: Number(place.y),
          longitude: Number(place.x),
        }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        created?: boolean;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "가게 추가 실패");
      }

      setNotice(json.created ? "가게를 추가했습니다." : "이미 등록된 가게입니다.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "가게 추가 실패");
    } finally {
      setAddingId(null);
    }
  }

  async function importAnseong() {
    setError(null);
    setNotice(null);
    setImporting(true);

    try {
      const res = await fetch("/api/stores/import/anseong", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        foundPlaceCount?: number;
        createdCount?: number;
        duplicateCount?: number;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "안성 자동수집 실패");
      }

      setNotice(
        `안성 수집 완료: 발견 ${json.foundPlaceCount ?? 0}건, 신규 ${json.createdCount ?? 0}건, 중복 ${json.duplicateCount ?? 0}건`
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "안성 자동수집 실패");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 20,
        border: "1px solid #ddd",
        borderRadius: 12,
        background: "#fff",
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 800 }}>카카오 장소 검색으로 가게 추가</div>
      <div
        style={{
          marginTop: 8,
          border: "1px solid #e9edf3",
          borderRadius: 10,
          background: "#f8fafc",
          padding: "14px 12px",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.1,
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          {centerAddress || "위치 확인 중"}
        </div>
      </div>
      <form onSubmit={onSearch} style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="가게명 또는 지역 검색"
          style={{
            flex: 1,
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "9px 10px",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            border: "none",
            borderRadius: 8,
            background: "#0c5dd6",
            color: "#fff",
            padding: "9px 14px",
            fontWeight: 700,
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "검색 중" : "검색"}
        </button>
      </form>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={() => void importAnseong()}
          disabled={importing}
          style={{
            border: "1px solid #ccc",
            borderRadius: 8,
            background: "#fff",
            padding: "8px 11px",
            cursor: "pointer",
            fontWeight: 700,
            opacity: importing ? 0.7 : 1,
          }}
        >
          {importing ? "안성 자동수집 중..." : "안성 음식점 자동수집"}
        </button>
      </div>

      {error ? <div style={{ marginTop: 8, color: "#b00020", fontSize: 13 }}>{error}</div> : null}
      {notice ? <div style={{ marginTop: 8, color: "#0a6d2a", fontSize: 13 }}>{notice}</div> : null}

      {results.length ? (
        <ul style={{ marginTop: 12, listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {results.map((place) => {
            const address = place.road_address_name || place.address_name || "";
            const dup = keySet.has(`${place.place_name}::${address.trim()}`);

            return (
              <li
                key={place.id}
                style={{
                  border: "1px solid #ececec",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPlace?.({
                        id: place.id,
                        name: place.place_name,
                        address: address || null,
                        latitude: Number(place.y),
                        longitude: Number(place.x),
                      })
                    }
                    style={{
                      fontWeight: 800,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      color: "#0c5dd6",
                    }}
                  >
                    {place.place_name}
                  </button>
                  <div style={{ marginTop: 3, fontSize: 12, color: "#666" }}>
                    {address || "주소 없음"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={dup || addingId === place.id}
                  onClick={() => addStore(place)}
                  style={{
                    border: "1px solid #ccc",
                    borderRadius: 7,
                    background: dup ? "#f5f5f5" : "#fff",
                    padding: "7px 10px",
                    cursor: dup ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    minWidth: 88,
                  }}
                >
                  {dup ? "등록됨" : addingId === place.id ? "추가 중" : "가게 추가"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <section style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>지금 지도에 보이는 가게</div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
          {([
            { key: "all", label: `전체 ${nearbyPlaces.length}개`, color: "#334155", bg: "#e2e8f0" },
            { key: "food", label: `음식점 ${nearbyByCategory.food.length}`, color: "#b45309", bg: "#fff1e8" },
            { key: "cafe", label: `카페 ${nearbyByCategory.cafe.length}`, color: "#c2410c", bg: "#fff7ed" },
            { key: "spot", label: `놀러갈곳 ${nearbyByCategory.spot.length}`, color: "#0e7490", bg: "#ecfeff" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveCategory(tab.key)}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                background: activeCategory === tab.key ? tab.bg : "#f1f5f9",
                color: activeCategory === tab.key ? tab.color : "#475569",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <ul style={{ marginTop: 8, listStyle: "none", padding: 0, display: "grid", gap: 7 }}>
          {filteredNearby.slice(0, 20).map((place) => (
            <li
              key={`${place.category}-${place.id}`}
              style={{
                border: "1px solid #ececec",
                borderRadius: 9,
                padding: "8px 9px",
                background: "#fff",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  onSelectPlace?.({
                    id: place.id,
                    name: place.name,
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                  })
                }
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#0c5dd6",
                  fontWeight: 700,
                }}
              >
                {place.name}
              </button>
              <div style={{ marginTop: 3, fontSize: 12, color: "#666" }}>{place.address ?? "주소 없음"}</div>
            </li>
          ))}
        </ul>
      </section>

      {(selectedPlace || detailLoading) && (
        <section
          style={{
            marginTop: 12,
            border: "1px solid #dbe4f0",
            borderRadius: 10,
            background: "#f8fbff",
            padding: 10,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {selectedPlace?.name ?? "선택된 가게"}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            {selectedPlace?.address ?? "주소 없음"}
          </div>

          {detailLoading ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>리뷰 정보를 불러오는 중...</div>
          ) : selectedDetail ? (
            <>
              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                <span>종합 점수 {selectedDetail.summary.weightedRating?.toFixed(1) ?? "-"}</span>
                <span>리뷰 {selectedDetail.summary.reviewCount}개</span>
                <span>신뢰 {Math.round(selectedDetail.summary.trustScore * 100)}점</span>
              </div>
              <ul style={{ marginTop: 8, listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
                {selectedDetail.reviews.slice(0, 5).map((review) => (
                  <li
                    key={review.id}
                    style={{
                      border: "1px solid #e3ebf7",
                      borderRadius: 8,
                      padding: "7px 8px",
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{review.rating.toFixed(1)}점</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "#444", lineHeight: 1.45 }}>
                      {review.content}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              등록되지 않은 가게라 리뷰 데이터가 없습니다.
            </div>
          )}
        </section>
      )}
    </section>
  );
}
