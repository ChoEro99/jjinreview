"use client";

import { useCallback, useEffect, useState } from "react";
import { type AppLanguage, normalizeAppLanguage } from "@/src/lib/language";

const APP_LANGUAGE_STORAGE_KEY = "reviewlab:app-language";
const APP_LANGUAGE_EVENT_NAME = "reviewlab:app-language-change";

function getBrowserLanguage() {
  if (typeof navigator === "undefined") return "ko";
  const candidate =
    navigator.languages?.find((value) => typeof value === "string" && value.trim().length > 0) ??
    navigator.language;
  return normalizeAppLanguage(candidate);
}

export function getAppLanguageClient(): AppLanguage {
  if (typeof window === "undefined") return "ko";
  const stored = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  if (stored) return normalizeAppLanguage(stored);
  return getBrowserLanguage();
}

export function setAppLanguageClient(language: AppLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(
    new CustomEvent(APP_LANGUAGE_EVENT_NAME, {
      detail: { language },
    })
  );
}

export function useAppLanguageClient() {
  const [language, setLanguageState] = useState<AppLanguage>(() => getAppLanguageClient());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
      setLanguageState(getAppLanguageClient());
    };
    const onCustom = () => {
      setLanguageState(getAppLanguageClient());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(APP_LANGUAGE_EVENT_NAME, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_LANGUAGE_EVENT_NAME, onCustom as EventListener);
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    setAppLanguageClient(next);
    setLanguageState(next);
  }, []);

  return { language, setLanguage };
}
