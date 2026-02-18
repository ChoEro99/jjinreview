import { NextResponse } from "next/server";

const cache = new Map<string, string>();

type ReverseAddress = {
  city?: string;
  town?: string;
  county?: string;
  state?: string;
  suburb?: string;
  neighbourhood?: string;
  village?: string;
  hamlet?: string;
  quarter?: string;
  city_district?: string;
};

function normalizeCityName(raw: string | undefined) {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const match = text.match(/([가-힣]+시)/);
  if (match?.[1]) return match[1];

  if (text.endsWith("특별시")) return text.replace("특별시", "시");
  if (text.endsWith("광역시")) return text.replace("광역시", "시");
  if (text.endsWith("특별자치시")) return text.replace("특별자치시", "시");
  return text;
}

function pickDongEupRi(address: ReverseAddress) {
  const candidates = [
    address.suburb,
    address.neighbourhood,
    address.village,
    address.hamlet,
    address.quarter,
    address.city_district,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const matched = candidates.find((v) => /(동|읍|리)$/.test(v));
  if (matched) return matched;

  return candidates[0] || null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { ok: false, error: "lat/lon query is required" },
        { status: 400 }
      );
    }

    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = cache.get(key);
    if (cached) {
      return NextResponse.json({ ok: true, label: cached, cached: true });
    }

    const target = new URL("https://nominatim.openstreetmap.org/reverse");
    target.searchParams.set("lat", String(latitude));
    target.searchParams.set("lon", String(longitude));
    target.searchParams.set("format", "jsonv2");
    target.searchParams.set("addressdetails", "1");
    target.searchParams.set("zoom", "16");

    const response = await fetch(target, {
      headers: {
        "User-Agent": "jjinreview-local-dev/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "reverse geocoding request failed" },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as { address?: ReverseAddress };
    const address = payload.address ?? {};
    const city = normalizeCityName(address.city || address.town || address.county || address.state);
    const dongEupRi = pickDongEupRi(address);

    const label = [city, dongEupRi].filter(Boolean).join(" ");
    if (!label) {
      return NextResponse.json({ ok: false, error: "location not resolved" }, { status: 404 });
    }

    cache.set(key, label);
    return NextResponse.json({ ok: true, label, cached: false });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 }
    );
  }
}

