"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButton() {
  const { data: session } = useSession();

  if (session?.user) {
    // Logged in state
    const displayName = session.user.name || session.user.email || "User";
    const truncatedName = displayName.length > 10 ? displayName.slice(0, 10) + "..." : displayName;

    return (
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "#28502E",
            fontWeight: 500,
          }}
        >
          {truncatedName}
        </span>
        <button
          onClick={() => signOut()}
          style={{
            background: "transparent",
            border: "1px solid #28502E",
            color: "#28502E",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#28502E";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#28502E";
          }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  // Not logged in state
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1000,
      }}
    >
      <button
        onClick={() => signIn("google", { callbackUrl: window.location.href })}
        style={{
          background: "#28502E",
          color: "#ffffff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 500,
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
    </div>
  );
}
