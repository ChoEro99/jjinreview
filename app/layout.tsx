import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import AuthButton from "@/components/AuthButton";
import LoginPromptModal from "@/components/LoginPromptModal";

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
        </Providers>
      </body>
    </html>
  );
}