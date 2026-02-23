"use client";

import Link from "next/link";
import { useAppLanguageClient } from "@/src/lib/app-language-client";

export default function FooterLinks() {
  const { language } = useAppLanguageClient();

  const text =
    language === "en"
      ? { contact: "Contact", terms: "Terms", privacy: "Privacy Policy" }
      : language === "ja"
        ? { contact: "お問い合わせ", terms: "利用規約", privacy: "プライバシーポリシー" }
        : language === "zh-CN"
          ? { contact: "联系", terms: "服务条款", privacy: "隐私政策" }
          : { contact: "문의", terms: "이용약관", privacy: "개인정보처리방침" };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <a href="mailto:color0230@gmail.com" className="hover:underline">
        {text.contact}: color0230@gmail.com
      </a>
      <div className="flex items-center gap-4">
        <Link href="/terms" className="hover:underline">
          {text.terms}
        </Link>
        <Link href="/privacy" className="hover:underline">
          {text.privacy}
        </Link>
      </div>
    </div>
  );
}
