import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabaseServer";
import { getSiteUrl } from "@/src/lib/site-url";

const SITEMAP_MIN_STORE_ID = 1;
const SITEMAP_MAX_STORE_ID = 210;

function isMissingColumnError(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function getStoreRows() {
  const sb = supabaseServer();
  const full = await sb
    .from("stores")
    .select("id, updated_at")
    .gte("id", SITEMAP_MIN_STORE_ID)
    .lte("id", SITEMAP_MAX_STORE_ID)
    .order("id", { ascending: true });

  if (!full.error) {
    return (full.data ?? []) as Array<{ id: number; updated_at: string | null }>;
  }

  if (!isMissingColumnError(full.error)) {
    throw new Error(full.error.message);
  }

  const minimal = await sb
    .from("stores")
    .select("id")
    .gte("id", SITEMAP_MIN_STORE_ID)
    .lte("id", SITEMAP_MAX_STORE_ID)
    .order("id", { ascending: true });
  if (minimal.error) throw new Error(minimal.error.message);

  return ((minimal.data ?? []) as Array<{ id: number }>).map((row) => ({
    id: row.id,
    updated_at: null,
  }));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const nowIso = new Date().toISOString();
  const rows = await getStoreRows();

  const staticUrls = [
    { loc: `${siteUrl}/`, lastmod: nowIso, changefreq: "daily", priority: "1.0" },
    { loc: `${siteUrl}/privacy`, lastmod: nowIso, changefreq: "yearly", priority: "0.3" },
    { loc: `${siteUrl}/terms`, lastmod: nowIso, changefreq: "yearly", priority: "0.3" },
  ];

  const storeUrls = rows.map((row) => ({
    loc: `${siteUrl}/stores/${row.id}`,
    lastmod: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso,
    changefreq: "weekly",
    priority: "0.7",
  }));

  const allUrls = [...staticUrls, ...storeUrls];
  const urlEntries = allUrls
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <lastmod>${escapeXml(item.lastmod)}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
