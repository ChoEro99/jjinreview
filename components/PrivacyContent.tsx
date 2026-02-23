"use client";

import LegalPageActions from "@/components/LegalPageActions";
import { useAppLanguageClient } from "@/src/lib/app-language-client";

export default function PrivacyContent() {
  const { language } = useAppLanguageClient();

  const text =
    language === "en"
      ? {
          title: "Privacy Policy",
          p1: "Review Lab collects and uses only the minimum personal information required to provide the Service, and manages it securely in accordance with applicable laws.",
          p2: "Collected data, purpose of use, retention period, and user rights are announced through service policies. Important changes are announced in advance.",
          contact: "Contact",
        }
      : language === "ja"
        ? {
            title: "プライバシーポリシー",
            p1: "レビューラボは、サービス提供に必要な最小限の個人情報のみを収集・利用し、関連法令に基づいて安全に管理します。",
            p2: "収集項目、利用目的、保管期間、利用者の権利と行使方法は運営ポリシーで案内し、重要な変更は事前に通知します。",
            contact: "お問い合わせ",
          }
        : language === "zh-CN"
          ? {
              title: "隐私政策",
              p1: "评论实验室仅在提供服务所必需的范围内收集和使用最少的个人信息，并依据相关法律法规进行安全管理。",
              p2: "收集项目、使用目的、保存期限以及用户权利与行使方式将通过服务政策进行公告，重要变更会提前通知。",
              contact: "联系",
            }
          : {
              title: "개인정보처리방침",
              p1: "리뷰랩은 서비스 제공을 위해 필요한 범위 내에서 최소한의 개인정보를 수집 및 이용하며, 관련 법령에 따라 안전하게 관리합니다.",
              p2: "수집 항목, 이용 목적, 보관 기간, 이용자 권리 및 행사 방법은 서비스 운영 정책에 따라 공지하며, 중요한 변경 사항은 사전에 안내합니다.",
              contact: "문의",
            };

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-[#2d2d2d]">
      <LegalPageActions />
      <h1 className="text-2xl font-bold">{text.title}</h1>
      <p className="mt-4 leading-7">{text.p1}</p>
      <p className="mt-3 leading-7">{text.p2}</p>
      <p className="mt-6 text-sm text-[#6f5c44]">
        {text.contact}: <a className="underline" href="mailto:color0230@gmail.com">color0230@gmail.com</a>
      </p>
    </main>
  );
}
