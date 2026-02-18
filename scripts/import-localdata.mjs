import fs from "fs";
import path from "path";
import iconv from "iconv-lite";
import { parse } from "csv-parse";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DEFAULT_FILES = [
  path.join(ROOT, "data", "raw", "fulldata_07_24_04_P_일반음식점.csv"),
  path.join(ROOT, "data", "raw", "fulldata_07_24_05_P_휴게음식점.csv"),
];
const INSERT_BATCH_SIZE = 1000;
const SELECT_BATCH_SIZE = 5000;

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function normalizeText(input) {
  return (input ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[()\-_/.,]/g, "");
}

function pickAddress(row) {
  const road = (row["도로명전체주소"] ?? "").toString().trim();
  const jibun = (row["소재지전체주소"] ?? "").toString().trim();
  return road || jibun || "";
}

function makeDedupKey(name, address) {
  const n = normalizeText(name);
  const a = normalizeText(address);
  if (!n || !a) return null;
  return `${n}|${a}`;
}

async function* streamCsvRows(filePath) {
  const parser = fs
    .createReadStream(filePath)
    .pipe(iconv.decodeStream("cp949"))
    .pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      })
    );

  for await (const row of parser) {
    yield row;
  }
}

async function insertBatch(supabase, rows, progress) {
  if (!rows.length) return;
  const { error } = await supabase.from("stores").insert(rows);
  if (error) {
    throw new Error(`stores insert 실패 (inserted=${progress}): ${error.message}`);
  }
}

function isOpenBusiness(row) {
  const status = (row["영업상태명"] ?? "").toString().trim();
  const detail = (row["상세영업상태명"] ?? "").toString().trim();
  return status.includes("영업") || detail === "영업";
}

function isExcludedStoreName(name) {
  const text = (name ?? "").toString().trim().toLowerCase();
  if (!text) return true;
  const excluded = [
    "구내식당",
    "사내식당",
    "다모임",
    "편의점",
    "마트",
    "약국",
    "병원",
    "의원",
    "학원",
    "미용실",
    "주유소",
    "호텔",
    "모텔",
    "펜션",
    "세탁",
    "은행",
  ];
  return excluded.some((word) => text.includes(word));
}

async function loadExistingDedupKeys(supabase) {
  const keys = new Set();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("stores")
      .select("id,name,address")
      .order("id", { ascending: true })
      .range(offset, offset + SELECT_BATCH_SIZE - 1);

    if (error) throw new Error(`기존 stores 조회 실패: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const key = makeDedupKey(row.name, row.address);
      if (key) keys.add(key);
    }

    if (data.length < SELECT_BATCH_SIZE) break;
    offset += SELECT_BATCH_SIZE;
  }

  return keys;
}

function resolveInputFiles() {
  const envFiles = process.env.LOCALDATA_FILES?.trim();
  if (!envFiles) return DEFAULT_FILES;
  return envFiles
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => (path.isAbsolute(v) ? v : path.join(ROOT, v)));
}

async function main() {
  loadDotenv(path.join(ROOT, ".env.local"));
  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? "false");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }

  const files = resolveInputFiles();
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`CSV 파일을 찾을 수 없습니다: ${file}`);
    }
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const existingKeys = await loadExistingDedupKeys(supabase);

  let totalRows = 0;
  let openRows = 0;
  let noAddressRows = 0;
  let excludedNameRows = 0;
  let duplicateInCsvRows = 0;
  let duplicateInDbRows = 0;

  const seenKeys = new Set();
  const pendingInsertRows = [];
  let insertCandidateRows = 0;
  let insertedRows = 0;

  for (const file of files) {
    for await (const row of streamCsvRows(file)) {
      totalRows += 1;
      if (!isOpenBusiness(row)) continue;
      openRows += 1;

      const name = (row["사업장명"] ?? "").toString().trim();
      const address = pickAddress(row);
      if (!name || !address) {
        noAddressRows += 1;
        continue;
      }
      if (isExcludedStoreName(name)) {
        excludedNameRows += 1;
        continue;
      }

      const key = makeDedupKey(name, address);
      if (!key) {
        noAddressRows += 1;
        continue;
      }
      if (seenKeys.has(key)) {
        duplicateInCsvRows += 1;
        continue;
      }
      seenKeys.add(key);

      if (existingKeys.has(key)) {
        duplicateInDbRows += 1;
        continue;
      }
      existingKeys.add(key);

      pendingInsertRows.push({
        name,
        address,
        updated_at: new Date().toISOString(),
      });
      insertCandidateRows += 1;

      if (!dryRun && pendingInsertRows.length >= INSERT_BATCH_SIZE) {
        await insertBatch(supabase, pendingInsertRows, insertedRows);
        insertedRows += pendingInsertRows.length;
        process.stdout.write(`\r삽입 진행: ${insertedRows}/${insertCandidateRows}`);
        pendingInsertRows.length = 0;
      }
    }
  }

  console.log("---- LOCALDATA Import Summary ----");
  console.log(`입력 파일: ${files.length}개`);
  console.log(`원본 행 수: ${totalRows.toLocaleString()}`);
  console.log(`영업중 행 수: ${openRows.toLocaleString()}`);
  console.log(`주소/상호 부족 스킵: ${noAddressRows.toLocaleString()}`);
  console.log(`업종 키워드 필터 스킵: ${excludedNameRows.toLocaleString()}`);
  console.log(`CSV 내부 중복 스킵: ${duplicateInCsvRows.toLocaleString()}`);
  console.log(`DB 기존 중복 스킵: ${duplicateInDbRows.toLocaleString()}`);
  console.log(`신규 삽입 대상: ${insertCandidateRows.toLocaleString()}`);
  console.log(`DRY_RUN: ${dryRun ? "ON" : "OFF"}`);

  if (!insertCandidateRows) {
    console.log("삽입할 신규 데이터가 없습니다.");
    return;
  }

  if (dryRun) {
    console.log("DRY_RUN 모드라 실제 삽입은 수행하지 않았습니다.");
    return;
  }

  if (pendingInsertRows.length) {
    await insertBatch(supabase, pendingInsertRows, insertedRows);
    insertedRows += pendingInsertRows.length;
  }
  process.stdout.write(`\r삽입 진행: ${insertedRows}/${insertCandidateRows}\n`);
  console.log(`완료: stores에 ${insertedRows.toLocaleString()}건 삽입`);
}

main().catch((error) => {
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
