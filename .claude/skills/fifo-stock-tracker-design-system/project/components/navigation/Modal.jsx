import React from "react";

export function Modal({ title, open, onClose, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1050,
        fontFamily: "var(--font-sans)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--white)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-modal)",
          width: "min(500px, 92vw)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <h5 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h5>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--text-muted)" }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "1rem" }}>{children}</div>
      </div>
    </div>
  );
}
