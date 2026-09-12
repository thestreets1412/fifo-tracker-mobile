import React from "react";

export function Alert({ tone = "info", children, onClose }) {
  const palette = {
    info: { bg: "#cff4fc", border: "#9eeaf9", fg: "#055160" },
    success: { bg: "#d1e7dd", border: "#a3cfbb", fg: "#0f5132" },
    warning: { bg: "#fff3cd", border: "#ffe69c", fg: "#664d03" },
    danger: { bg: "#f8d7da", border: "#f1aeb5", fg: "#842029" },
    secondary: { bg: "#e2e3e5", border: "#c4c8cb", fg: "#41464b" },
  }[tone];

  return (
    <div
      style={{
        fontFamily: "var(--font-sans)",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.fg,
        borderRadius: "var(--radius-md)",
        padding: "1rem",
        marginBottom: "var(--space-3)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            fontSize: "1.1rem",
            lineHeight: 1,
            color: palette.fg,
            opacity: 0.6,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
