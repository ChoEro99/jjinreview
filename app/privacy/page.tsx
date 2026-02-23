import type { Metadata } from "next";
import PrivacyContent from "@/components/PrivacyContent";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 리뷰랩",
  description: "리뷰랩 개인정보처리방침",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
