import type { MetadataRoute } from "next";
import { supabaseServer } from "@/src/lib/supabaseServer";
import { getSiteUrl } from "@/src/lib/site-url";

const SITEMAP_MIN_STORE_ID = 1;
const SITEMAP_MAX_STORE_ID = 210;

function isMissingColumnError(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function getStoreSitemapRows() {
  const sb = supabaseServer();
  const full = await sb
    .from("stores")
    .select("id, updated_at")
    .gte("id", SITEMAP_MIN_STORE_ID)
    .lte("id", SITEMAP_MAX_STORE_ID)
    .order("id", { ascending: true })
    .limit(SITEMAP_MAX_STORE_ID - SITEMAP_MIN_STORE_ID + 1);

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
    .order("id", { ascending: true })
    .limit(SITEMAP_MAX_STORE_ID - SITEMAP_MIN_STORE_ID + 1);
  if (minimal.error) throw new Error(minimal.error.message);

  return ((minimal.data ?? []) as Array<{ id: number }>).map((row) => ({
    id: row.id,
    updated_at: null,
  }));
}

export async function generateSitemaps() {
  return [{ id: 0 }];
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  if (id !== 0) return [];
  const siteUrl = getSiteUrl();
  const rows = await getStoreSitemapRows();

  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const storeUrls: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${siteUrl}/stores/${row.id}`,
    lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticUrls, ...storeUrls];
}
