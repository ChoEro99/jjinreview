"use client";

import { useSession, signIn, signOut } from "next-auth/react";

const MAX_DISPLAY_NAME_LENGTH = 10;

export default function AuthButton() {
  const { data: session } = useSession();

  if (session?.user) {
    // Logged in state
    const displayName = session.user.name || session.user.email || "User";
    const truncatedName = displayName.length > MAX_DISPLAY_NAME_LENGTH 
      ? displayName.slice(0, MAX_DISPLAY_NAME_LENGTH) + "..." 
      : displayName;

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
            background: "rgba(255,255,255,0.9)",
            borderRadius: 6,
            padding: "4px 8px",
            color: "#28502E",
            fontWeight: 600,
            fontSize: 13,
            boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          }}
        >
          {truncatedName}
        </span>
        <button
          onClick={() => signOut()}
          style={{
            background: "#ffffff",
            color: "#28502E",
            border: "1px solid #28502E",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#28502E";
            e.currentTarget.style.color = "#ffffff";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "#ffffff";
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
          background: "#ffffff",
          color: "#28502E",
          border: "1px solid #28502E",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = "#28502E";
          e.currentTarget.style.color = "#ffffff";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = "#ffffff";
          e.currentTarget.style.color = "#28502E";
        }}
      >
        구글로 로그인
      </button>
    </div>
  );
}
