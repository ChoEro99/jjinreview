"use client";

import { useEffect } from "react";

// Extend the Window interface to include adsbygoogle
declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

type AdSenseProps = {
  label: string;
  slot?: string;
  format?: string;
  style?: React.CSSProperties;
};

export function AdSense({ label, slot, format, style }: AdSenseProps) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const adSlot = slot || process.env.NEXT_PUBLIC_ADSENSE_SLOT;
  const adFormat = format || process.env.NEXT_PUBLIC_ADSENSE_FORMAT || "auto";

  const hasRequiredValues = client && adSlot;

  useEffect(() => {
    if (hasRequiredValues && typeof window !== "undefined") {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (err) {
        console.error("AdSense error:", err);
      }
    }
  }, [hasRequiredValues]);

  // Show placeholder if no slot/format configured
  if (!hasRequiredValues) {
    return (
      <div
        style={{
          border: "1px dashed #d4c7ba",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 12,
          color: "#7a6f65",
          background: "#faf7f3",
          textAlign: "center",
          ...style,
        }}
      >
        <div style={{ marginBottom: 4, fontWeight: 600, color: "#a8927d" }}>광고</div>
        광고 영역 ({label}) · 슬롯 ID 입력 후 활성화
      </div>
    );
  }

  // Render actual AdSense tag
  return (
    <div style={{ position: "relative", ...style }}>
      <div
        style={{
          position: "absolute",
          top: -20,
          left: 0,
          fontSize: 11,
          color: "#999",
          fontWeight: 500,
        }}
      >
        광고
      </div>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      />
    </div>
  );
}
