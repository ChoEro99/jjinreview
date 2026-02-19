"use client";

export default function LegalPageActions() {
  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleClose}
        className="rounded-lg border border-[#b8ad95] bg-white px-3 py-2 text-sm font-semibold text-[#28502E]"
      >
        닫기
      </button>
    </div>
  );
}
