const FALLBACK_SITE_URL = "https://jjinreview.vercel.app";

export function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK_SITE_URL;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.endsWith("/") ? withProtocol.slice(0, -1) : withProtocol;
}
