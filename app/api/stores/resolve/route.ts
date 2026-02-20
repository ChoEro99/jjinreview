import { NextResponse } from "next/server";
import { createStore } from "@/src/lib/store-service";

type ResolveBody = {
  placeId?: string;
  name?: string;
  address?: string | null;
};

type GooglePlaceDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
};

function normalizePlaceId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ResolveBody;
    const placeId = normalizePlaceId(body.placeId);
    if (!placeId) {
      return NextResponse.json({ ok: false, error: "placeId is required" }, { status: 400 });
    }

    // Already a local id format.
    if (/^store-\d+$/.test(placeId)) {
      const id = Number(placeId.slice("store-".length));
      if (Number.isFinite(id) && id > 0) {
        return NextResponse.json({ ok: true, storeId: id });
      }
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "google api key missing" }, { status: 500 });
    }

    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ko&regionCode=KR`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,rating,userRatingCount,location",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `google place resolve failed: ${response.status}` },
        { status: 502 }
      );
    }

    const place = (await response.json()) as GooglePlaceDetailsResponse;
    const name =
      (typeof place.displayName?.text === "string" && place.displayName.text.trim()) ||
      (typeof body.name === "string" && body.name.trim()) ||
      "";
    const address =
      (typeof place.formattedAddress === "string" && place.formattedAddress.trim()) ||
      (typeof body.address === "string" && body.address.trim()) ||
      null;

    if (!name) {
      return NextResponse.json({ ok: false, error: "resolved name is empty" }, { status: 422 });
    }

    const result = await createStore({
      name,
      address,
      latitude:
        typeof place.location?.latitude === "number" && Number.isFinite(place.location.latitude)
          ? place.location.latitude
          : null,
      longitude:
        typeof place.location?.longitude === "number" && Number.isFinite(place.location.longitude)
          ? place.location.longitude
          : null,
      externalRating:
        typeof place.rating === "number" && Number.isFinite(place.rating) ? place.rating : null,
      externalReviewCount:
        typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
          ? Math.max(0, Math.round(place.userRatingCount))
          : null,
    });

    return NextResponse.json({ ok: true, storeId: result.store.id });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}

