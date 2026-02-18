import fs from "fs";

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadDotenv(".env.local");
  const mod = await import("../src/lib/store-service.ts");
  const fn = mod.dedupeStoresByNormalizedNameAddress;
  if (typeof fn !== "function") {
    throw new Error("dedupeStoresByNormalizedNameAddress 함수 import 실패");
  }

  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? "false");
  const maxGroups = Number(process.env.MAX_GROUPS ?? 1000);
  const result = await fn({
    dryRun,
    maxGroups: Number.isFinite(maxGroups) ? maxGroups : 1000,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
