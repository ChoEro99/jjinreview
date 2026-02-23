import type { Metadata } from "next";
import TermsContent from "@/components/TermsContent";

export const metadata: Metadata = {
  title: "이용약관 | 리뷰랩",
  description: "리뷰랩 이용약관",
};

export default function TermsPage() {
  return <TermsContent />;
}
