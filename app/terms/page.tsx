import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관 | 리뷰랩",
  description: "리뷰랩 이용약관",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 text-[#2d2d2d]">
      <h1 className="text-2xl font-bold">이용약관</h1>
      <p className="mt-4 leading-7">
        본 약관은 리뷰랩(이하 &quot;서비스&quot;)의 이용 조건 및 절차, 이용자와 서비스의 권리,
        의무 및 책임사항을 규정합니다.
      </p>
      <p className="mt-3 leading-7">
        서비스 이용 시 관련 법령과 본 약관을 준수해야 하며, 서비스는 운영 정책에 따라 내용을
        변경할 수 있습니다.
      </p>
      <p className="mt-6 text-sm text-[#6f5c44]">
        문의: <a className="underline" href="mailto:color0230@gmail.com">color0230@gmail.com</a>
      </p>
    </main>
  );
}
