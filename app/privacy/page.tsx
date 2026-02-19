import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 리뷰랩",
  description: "리뷰랩 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-[#2d2d2d]">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-4 leading-7">
        리뷰랩은 서비스 제공을 위해 필요한 범위 내에서 최소한의 개인정보를 수집 및 이용하며,
        관련 법령에 따라 안전하게 관리합니다.
      </p>
      <p className="mt-3 leading-7">
        수집 항목, 이용 목적, 보관 기간, 이용자 권리 및 행사 방법은 서비스 운영 정책에 따라
        공지하며, 중요한 변경 사항은 사전에 안내합니다.
      </p>
      <p className="mt-6 text-sm text-[#6f5c44]">
        문의: <a className="underline" href="mailto:color0230@gmail.com">color0230@gmail.com</a>
      </p>
    </main>
  );
}
