// NOTE: This file appears to have been corrupted/incomplete in the repository.
// The actual implementations of these functions are missing.
// These are stub implementations to prevent build errors.
// TODO: Restore proper implementations from backup or reimplement.

export async function getStoresWithSummary(): Promise<never> {
  throw new Error("getStoresWithSummary: Implementation missing");
}

export async function createStore(_params: {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}): Promise<never> {
  throw new Error("createStore: Implementation missing");
}

export async function getStoreDetail(_storeId: number): Promise<never> {
  throw new Error("getStoreDetail: Implementation missing");
}

export async function createInappReview(_params: unknown): Promise<never> {
  throw new Error("createInappReview: Implementation missing");
}

export async function searchAndAutoRegisterStoreByKeyword(
  _query: string,
  _limit: number,
  _userLocation: unknown,
  _offset: number
): Promise<never> {
  throw new Error("searchAndAutoRegisterStoreByKeyword: Implementation missing");
}

export async function runIncrementalAnalysisBatch(_params: unknown): Promise<never> {
  throw new Error("runIncrementalAnalysisBatch: Implementation missing");
}

export async function dedupeStoresByNormalizedNameAddress(): Promise<never> {
  throw new Error("dedupeStoresByNormalizedNameAddress: Implementation missing");
}

export async function backfillStoreGeoFromGoogle(_params: unknown): Promise<never> {
  throw new Error("backfillStoreGeoFromGoogle: Implementation missing");
}

export async function importGoogleReviewsForRegisteredStores(_params: unknown): Promise<never> {
  throw new Error("importGoogleReviewsForRegisteredStores: Implementation missing");
}

export async function getGoogleReviewsWithAiForStore(_storeId: number): Promise<never> {
  throw new Error("getGoogleReviewsWithAiForStore: Implementation missing");
}

export async function getNaverSignalsForStore(_storeId: number): Promise<never> {
  throw new Error("getNaverSignalsForStore: Implementation missing");
}