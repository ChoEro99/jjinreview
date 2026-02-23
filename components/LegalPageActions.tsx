"use client";

import { useAppLanguageClient } from "@/src/lib/app-language-client";

export default function LegalPageActions() {
  const { language } = useAppLanguageClient();
  const closeLabel =
    language === "en" ? "Close" : language === "ja" ? "閉じる" : language === "zh-CN" ? "关闭" : "닫기";

  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleClose}
        className="rounded-lg border border-[#b8ad95] bg-white px-3 py-2 text-sm font-semibold text-[#28502E]"
      >
        {closeLabel}
      </button>
    </div>
  );
}
