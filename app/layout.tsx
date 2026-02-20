import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Providers from "./providers";
import AuthButton from "@/components/AuthButton";
import LoginPromptModal from "@/components/LoginPromptModal";
import { getSiteUrl } from "@/src/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const adsenseClient = "ca-pub-6051453612452994";

export const metadata: Metadata = {
  title: "리뷰랩",
  description: "이 평점 믿어도 될까? AI가 분석해주는 평점 믿음 수치",
  metadataBase: new URL(getSiteUrl()),
};

export default function RootLayout({
  children,
}: Readonly<{  
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>  
        <Providers>
          <AuthButton />
          <LoginPromptModal />
          {children}
          <footer className="border-t border-[#c9b99e] bg-[rgba(71,104,44,0.06)] px-6 py-6 text-sm text-[#6f5c44]">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <a href="mailto:color0230@gmail.com" className="hover:underline">
                문의: color0230@gmail.com
              </a>
              <div className="flex items-center gap-4">
                <Link href="/terms" className="hover:underline">
                  이용약관
                </Link>
                <Link href="/privacy" className="hover:underline">
                  개인정보처리방침
                </Link>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
