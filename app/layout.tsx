import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  title: "찐리뷰",
  description: "광고성 리뷰 필터 기반 가게 리뷰 종합 평점 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{  
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="light" style={{ colorScheme: "light" }}>
      <head>
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>  
        {children}
      </body>
    </html>
  );
}