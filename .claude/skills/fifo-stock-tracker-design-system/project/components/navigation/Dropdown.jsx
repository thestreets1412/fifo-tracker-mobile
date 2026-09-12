import React from "react";

export function Dropdown({ label, items }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block", fontFamily: "var(--font-sans)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "transparent",
          border: "1px solid var(--gray-600)",
          color: "var(--gray-600)",
          borderRadius: "var(--radius-md)",
          padding: "0.375rem 0.75rem",
          cursor: "pointer",
          fontSize: "var(--text-md)",
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            background: "var(--white)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-dropdown)",
            minWidth: 180,
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href || "#"}
              style={{
                display: "block",
                padding: "0.5rem 1rem",
                color: "var(--text-body)",
                textDecoration: "none",
                fontSize: "var(--text-md)",
              }}
            >
              {it.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
