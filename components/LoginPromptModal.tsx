"use client";

import { useSession, signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPromptModal() {
  const { data: session } = useSession();
  const [hasShownModal, setHasShownModal] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem("loginPromptShown") === "true";
    }
    return false;
  });

  const handleClose = () => {
    localStorage.setItem("loginPromptShown", "true");
    setHasShownModal(true);
  };

  const handleLogin = () => {
    localStorage.setItem("loginPromptShown", "true");
    setHasShownModal(true);
    signIn("google", { callbackUrl: window.location.href });
  };

  // Don't show modal if user is logged in or if modal has already been shown
  if (session?.user || hasShownModal) {
    return null;
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: 32,
          maxWidth: 400,
          width: "90%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 16 }}>👋 환영합니다!</div>
        <div
          style={{
            fontSize: 16,
            color: "#28502E",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          리뷰랩에서 리뷰를 작성하려면 로그인이 필요해요.
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={handleLogin}
            style={{
              padding: "12px 24px",
              background: "#28502E",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            구글로 로그인
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: "12px 24px",
              background: "transparent",
              color: "#28502E",
              border: "1px solid #28502E",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#f5f5f5";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  );
}
