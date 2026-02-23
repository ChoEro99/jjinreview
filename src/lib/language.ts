export const SUPPORTED_APP_LANGUAGES = ["ko", "en", "ja", "zh-CN"] as const;

export type AppLanguage = (typeof SUPPORTED_APP_LANGUAGES)[number];

export function isSupportedAppLanguage(value: string | null | undefined): value is AppLanguage {
  if (!value) return false;
  return SUPPORTED_APP_LANGUAGES.includes(value as AppLanguage);
}

export function normalizeAppLanguage(value: string | null | undefined): AppLanguage {
  if (!value) return "ko";
  const lower = value.toLowerCase();
  if (lower.startsWith("ko")) return "ko";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("zh")) return "zh-CN";
  return "ko";
}

export function appLanguageToLocale(lang: AppLanguage): string {
  if (lang === "ko") return "ko-KR";
  if (lang === "en") return "en-US";
  if (lang === "ja") return "ja-JP";
  return "zh-CN";
}

export function appLanguageToGoogleLanguageCode(lang: AppLanguage): string {
  if (lang === "zh-CN") return "zh-CN";
  return lang;
}

export function appLanguageNativeLabel(lang: AppLanguage): string {
  if (lang === "ko") return "한국어";
  if (lang === "en") return "English";
  if (lang === "ja") return "日本語";
  return "简体中文";
}
