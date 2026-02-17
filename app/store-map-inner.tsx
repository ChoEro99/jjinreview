"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  searchPlaces?: Array<{
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  }>;
  focus?: { latitude: number; longitude: number; nonce: number } | null;
  selectedPlace?: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  } | null;
  onMapPlaceClick?: (place: {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
  }) => void;
  onViewportData?: (data: {
    center: { latitude: number; longitude: number };
    address: string;
    nearbyPlaces: Array<{
      id: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
      category: "food" | "cafe" | "spot";
    }>;
  }) => void;
};

type NearbyCategory = "food" | "cafe" | "spot";

type NearbyPlace = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category: NearbyCategory;
};

type LatLng = {
  getLat: () => number;
  getLng: () => number;
};

type KakaoMapInstance = {
  setBounds?: (bounds: unknown) => void;
  setCenter?: (center: unknown) => void;
  setLevel?: (level: number) => void;
  relayout?: () => void;
  getCenter?: () => LatLng;
};

type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => LatLng;
  Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMapInstance;
  Marker: new (options: { map: unknown; position: unknown; title?: string }) => {
    setMap: (map: unknown | null) => void;
  };
  InfoWindow: new (options: { content: string }) => {
    open: (map: unknown, marker: unknown) => void;
    close: () => void;
  };
  event: {
    addListener: (
      target: unknown,
      eventName: string,
      handler: (...args: unknown[]) => void
    ) => void;
  };
  services: {
    Status: { OK: string };
    SortBy?: { DISTANCE?: string; ACCURACY?: string };
    Places: new () => {
      categorySearch: (
        categoryCode: string,
        callback: (
          result: Array<{
            id: string;
            place_name: string;
            road_address_name: string;
            address_name: string;
            x: string;
            y: string;
          }>,
          status: string
        ) => void,
        options: { location: LatLng; radius: number; size: number; sort?: string }
      ) => void;
    };
    Geocoder: new () => {
      coord2Address: (
        x: number,
        y: number,
        callback: (
          result: Array<{
            road_address?: { address_name?: string };
            address?: { address_name?: string };
          }>,
          status: string
        ) => void
      ) => void;
    };
  };
  load: (cb: () => void) => void;
  LatLngBounds: new () => {
    extend: (latlng: unknown) => void;
  };
};

declare global {
  interface Window {
    kakao?: {
      maps: KakaoMaps;
    };
  }
}

const DEFAULT_CENTER = { latitude: 37.0079, longitude: 127.2797 };

function loadKakaoSdk(appKey: string): Promise<KakaoMaps> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      window.kakao.maps.load(() => resolve(window.kakao!.maps));
      return;
    }

    const scriptId = "kakao-map-sdk";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    const onLoad = () => {
      if (!window.kakao?.maps) {
        reject(new Error("kakao maps sdk unavailable"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao!.maps));
    };

    if (existing) {
      if (window.kakao?.maps) onLoad();
      else existing.addEventListener("load", onLoad, { once: true });
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

function reverseGeocode(maps: KakaoMaps, latitude: number, longitude: number): Promise<string> {
  return new Promise((resolve) => {
    const geocoder = new maps.services.Geocoder();
    geocoder.coord2Address(longitude, latitude, (result, status) => {
      if (status !== maps.services.Status.OK || !result?.[0]) {
        resolve("주소 정보를 불러오지 못했습니다.");
        return;
      }

      const road = result[0].road_address?.address_name;
      const addr = result[0].address?.address_name;
      resolve(road || addr || "주소 정보를 불러오지 못했습니다.");
    });
  });
}

function toShortAreaLabel(fullAddress: string) {
  const tokens = fullAddress
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const cityToken = tokens.find((token) => /(시|군|구)$/.test(token));
  const districtToken = tokens.find((token) => /(읍|면|동)$/.test(token));
  if (cityToken && districtToken) return `${cityToken} ${districtToken}`;
  if (districtToken) return districtToken;
  if (cityToken) return cityToken;

  const fallback = tokens.filter((token) => /(리|가)$/.test(token));
  if (fallback.length) return fallback.slice(-1)[0];
  return tokens.slice(-1)[0] || fullAddress;
}

function extractCityAndDistrict(fullAddress: string) {
  const tokens = fullAddress
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const city = tokens.find((token) => /(시|군|구)$/.test(token)) || null;
  const district = tokens.find((token) => /(읍|면|동)$/.test(token)) || null;
  return { city, district };
}

function toShortAreaLabelWithNearby(fullAddress: string, nearby: NearbyPlace[]) {
  const fromCenter = extractCityAndDistrict(fullAddress);
  if (fromCenter.city && fromCenter.district) {
    return `${fromCenter.city} ${fromCenter.district}`;
  }

  for (const place of nearby) {
    if (!place.address) continue;
    const fromPlace = extractCityAndDistrict(place.address);
    if (fromCenter.city && fromPlace.district) {
      return `${fromCenter.city} ${fromPlace.district}`;
    }
    if (fromPlace.city && fromPlace.district) {
      return `${fromPlace.city} ${fromPlace.district}`;
    }
  }

  return toShortAreaLabel(fullAddress);
}

function searchCategoryNearby(
  maps: KakaoMaps,
  categoryCode: string,
  location: LatLng,
  radius: number,
  category: NearbyCategory
): Promise<NearbyPlace[]> {
  return new Promise((resolve) => {
    const places = new maps.services.Places();
    const sortByDistance = maps.services.SortBy?.DISTANCE;
    places.categorySearch(
      categoryCode,
      (result, status) => {
        if (status !== maps.services.Status.OK || !result?.length) {
          resolve([]);
          return;
        }

        resolve(
          result
            .map((row) => ({
              id: row.id,
              name: row.place_name,
              address: row.road_address_name || row.address_name || null,
              latitude: Number(row.y),
              longitude: Number(row.x),
              category,
            }))
            .filter(
              (place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
            )
        );
      },
      {
        location,
        radius,
        size: 15,
        ...(sortByDistance ? { sort: sortByDistance } : {}),
      }
    );
  });
}

export default function StoreMapInner({
  searchPlaces = [],
  focus = null,
  selectedPlace = null,
  onMapPlaceClick,
  onViewportData,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapsRef = useRef<KakaoMaps | null>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "";
  const missingAppKey = !appKey;
  const lastFetchTsRef = useRef(0);
  const candidatePlacesRef = useRef<NearbyPlace[]>([]);
  const selectedMarkerRef = useRef<{ setMap: (map: unknown | null) => void } | null>(null);
  const selectedInfoRef = useRef<{ close: () => void } | null>(null);

  const [sdkError, setSdkError] = useState<string | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);

  function findNearestCandidate(lat: number, lon: number) {
    const candidates = candidatePlacesRef.current;
    if (!candidates.length) return null;

    let nearest: NearbyPlace | null = null;
    let best = Number.POSITIVE_INFINITY;

    for (const place of candidates) {
      const dLat = place.latitude - lat;
      const dLon = place.longitude - lon;
      const dist2 = dLat * dLat + dLon * dLon;
      if (dist2 < best) {
        best = dist2;
        nearest = place;
      }
    }

    // Roughly ~500m in latitude scale.
    if (!nearest || best > 0.00002) return null;
    return nearest;
  }

  useEffect(() => {
    const merged: NearbyPlace[] = [...nearbyPlaces];
    for (const place of searchPlaces) {
      if (!merged.some((row) => row.id === place.id)) {
        merged.push({ ...place, category: "food" });
      }
    }
    candidatePlacesRef.current = merged;
  }, [nearbyPlaces, searchPlaces]);

  useEffect(() => {
    if (missingAppKey) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    async function fetchAroundCenter(trigger: "init" | "idle") {
      const maps = mapsRef.current;
      const map = mapRef.current;
      if (!maps || !map || !map.getCenter) return;

      const now = Date.now();
      if (trigger === "idle" && now - lastFetchTsRef.current < 500) return;
      lastFetchTsRef.current = now;

      const center = map.getCenter();
      const latitude = center.getLat();
      const longitude = center.getLng();
      const location = new maps.LatLng(latitude, longitude);

      const [address, food, cafe, spot] = await Promise.all([
        reverseGeocode(maps, latitude, longitude),
        searchCategoryNearby(maps, "FD6", location, 1800, "food").catch(() => []),
        searchCategoryNearby(maps, "CE7", location, 1800, "cafe").catch(() => []),
        searchCategoryNearby(maps, "AT4", location, 2500, "spot").catch(() => []),
      ]);

      if (cancelled) return;

      const merged = [...food, ...cafe, ...spot];
      const dedup = new Map<string, NearbyPlace>();
      for (const place of merged) dedup.set(place.id, place);
      const normalized = Array.from(dedup.values()).slice(0, 45);

      const shortLabel = toShortAreaLabelWithNearby(address, normalized);
      setNearbyPlaces(normalized);
      onViewportData?.({
        center: { latitude, longitude },
        address: shortLabel,
        nearbyPlaces: normalized,
      });
    }

    async function initMap() {
      try {
        const maps = await loadKakaoSdk(appKey);
        if (cancelled || !containerRef.current) return;

        mapsRef.current = maps;

        if (!mapRef.current) {
          const center = new maps.LatLng(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude);
          mapRef.current = new maps.Map(containerRef.current, { center, level: 6 });

          maps.event.addListener(mapRef.current, "idle", () => {
            void fetchAroundCenter("idle");
          });

          maps.event.addListener(mapRef.current, "click", (...args: unknown[]) => {
            const evt = args[0] as { latLng?: LatLng } | undefined;
            const clicked = evt?.latLng;
            if (!clicked) return;

            const lat = clicked.getLat();
            const lon = clicked.getLng();
            const nearest = findNearestCandidate(lat, lon);
            if (!nearest) return;

            onMapPlaceClick?.({
              id: nearest.id,
              name: nearest.name,
              address: nearest.address,
              latitude: nearest.latitude,
              longitude: nearest.longitude,
            });
          });

          maps.event.addListener(mapRef.current, "mousemove", (...args: unknown[]) => {
            const evt = args[0] as { latLng?: LatLng } | undefined;
            const moved = evt?.latLng;
            if (!moved || !containerRef.current) return;

            const nearest = findNearestCandidate(moved.getLat(), moved.getLng());
            containerRef.current.style.cursor = nearest ? "pointer" : "grab";
          });
        }

        mapRef.current?.relayout?.();
        setSdkError(null);

        observer = new ResizeObserver(() => {
          mapRef.current?.relayout?.();
        });
        observer.observe(containerRef.current);

        await fetchAroundCenter("init");
      } catch (e) {
        if (!cancelled) {
          setSdkError(e instanceof Error ? e.message : "지도를 불러오지 못했습니다.");
        }
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [appKey, missingAppKey, onViewportData, onMapPlaceClick]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || missingAppKey) return;
    if (!searchPlaces.length) return;

    const bounds = new maps.LatLngBounds();
    for (const place of searchPlaces) {
      const latlng = new maps.LatLng(place.latitude, place.longitude);
      bounds.extend(latlng);
    }
    map.setBounds?.(bounds);
  }, [searchPlaces, missingAppKey]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !focus || missingAppKey) return;

    const center = new maps.LatLng(focus.latitude, focus.longitude);
    map.setCenter?.(center);
  }, [focus, missingAppKey]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || missingAppKey) return;

    if (selectedInfoRef.current) {
      selectedInfoRef.current.close();
      selectedInfoRef.current = null;
    }
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.setMap(null);
      selectedMarkerRef.current = null;
    }

    if (!selectedPlace) return;

    const latlng = new maps.LatLng(selectedPlace.latitude, selectedPlace.longitude);
    const marker = new maps.Marker({
      map,
      position: latlng,
      title: selectedPlace.name,
    });
    selectedMarkerRef.current = marker;

    const infoWindow = new maps.InfoWindow({
      content:
        `<div style=\"padding:10px 12px;min-width:210px;\">` +
        `<div style=\"font-weight:800;\">${selectedPlace.name}</div>` +
        `<div style=\"margin-top:5px;font-size:12px;color:#666;\">${selectedPlace.address ?? "주소 없음"}</div>` +
        `</div>`,
    });
    infoWindow.open(map, marker);
    selectedInfoRef.current = infoWindow;
  }, [selectedPlace, missingAppKey]);

  return (
    <section style={{ height: "100%", overflow: "hidden", background: "#f5f7fa" }}>
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #e6e9ef",
          fontWeight: 700,
          background: "#fff",
        }}
      >
        지도에서 주변 장소 탐색
      </div>

      <div
        ref={containerRef}
        style={{ height: "calc(100% - 72px)", width: "100%", cursor: "grab" }}
      />

      <div style={{ padding: "8px 14px", fontSize: 12, color: "#666", background: "#fff" }}>
        중심 이동 시 주변 장소를 새로 불러옵니다.
      </div>

      {missingAppKey ? (
        <div style={{ padding: "0 14px 12px", fontSize: 12, color: "#b00020" }}>
          NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 없어 지도를 표시할 수 없습니다.
        </div>
      ) : null}

      {sdkError ? (
        <div style={{ padding: "0 14px 12px", fontSize: 12, color: "#b00020" }}>{sdkError}</div>
      ) : null}
    </section>
  );
}
