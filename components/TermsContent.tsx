"use client";

import LegalPageActions from "@/components/LegalPageActions";
import { useAppLanguageClient } from "@/src/lib/app-language-client";

export default function TermsContent() {
  const { language } = useAppLanguageClient();

  const text =
    language === "en"
      ? {
          title: "Terms of Service",
          p1: 'These terms define the conditions for using Review Lab (the "Service"), and the rights and responsibilities of users and the Service.',
          p2: "By using the Service, you agree to comply with applicable laws and these terms. The Service may update its policies and content as needed.",
          contact: "Contact",
        }
      : language === "ja"
        ? {
            title: "利用規約",
            p1: "本規約は、レビューラボ（以下「本サービス」）の利用条件および手続き、利用者と本サービスの権利・義務・責任を定めるものです。",
            p2: "本サービスの利用にあたっては、関連法令および本規約を遵守するものとし、運営方針により内容が変更される場合があります。",
            contact: "お問い合わせ",
          }
        : language === "zh-CN"
          ? {
              title: "服务条款",
              p1: "本条款规定了评论实验室（以下简称“本服务”）的使用条件与流程，以及用户与本服务的权利、义务和责任。",
              p2: "使用本服务即表示你同意遵守相关法律法规及本条款。本服务可根据运营政策调整内容。",
              contact: "联系",
            }
          : {
              title: "이용약관",
              p1: "본 약관은 리뷰랩(이하 \"서비스\")의 이용 조건 및 절차, 이용자와 서비스의 권리, 의무 및 책임사항을 규정합니다.",
              p2: "서비스 이용 시 관련 법령과 본 약관을 준수해야 하며, 서비스는 운영 정책에 따라 내용을 변경할 수 있습니다.",
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
