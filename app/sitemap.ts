import type { MetadataRoute } from "next";
import { supabaseServer } from "@/src/lib/supabaseServer";
import { getSiteUrl } from "@/src/lib/site-url";

const SITEMAP_CHUNK_SIZE = 5000;

function isMissingColumnError(error: { code?: string } | null | undefined) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function getStoreCount() {
  const sb = supabaseServer();
  const { count, error } = await sb.from("stores").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function getStoreSitemapRows(offset: number, limit: number) {
  const sb = supabaseServer();
  const full = await sb
    .from("stores")
    .select("id, updated_at")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (!full.error) {
    return (full.data ?? []) as Array<{ id: number; updated_at: string | null }>;
  }

  if (!isMissingColumnError(full.error)) {
    throw new Error(full.error.message);
  }

  const minimal = await sb
    .from("stores")
    .select("id")
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (minimal.error) throw new Error(minimal.error.message);

  return ((minimal.data ?? []) as Array<{ id: number }>).map((row) => ({
    id: row.id,
    updated_at: null,
  }));
}

export async function generateSitemaps() {
  const total = await getStoreCount();
  const pages = Math.max(1, Math.ceil(total / SITEMAP_CHUNK_SIZE));
  return Array.from({ length: pages }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const offset = id * SITEMAP_CHUNK_SIZE;
  const rows = await getStoreSitemapRows(offset, SITEMAP_CHUNK_SIZE);

  const staticUrls: MetadataRoute.Sitemap =
    id === 0
      ? [
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
        ]
      : [];

  const storeUrls: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${siteUrl}/stores/${row.id}`,
    lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticUrls, ...storeUrls];
}
