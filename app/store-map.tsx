"use client";

import dynamic from "next/dynamic";

type StoreMapItem = {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type SearchPlaceItem = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

type Props = {
  stores?: StoreMapItem[];
  searchPlaces?: SearchPlaceItem[];
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

const StoreMapInner = dynamic(() => import("@/app/store-map-inner"), {
  ssr: false,
});

export default function StoreMap(props: Props) {
  return <StoreMapInner {...props} />;
}
