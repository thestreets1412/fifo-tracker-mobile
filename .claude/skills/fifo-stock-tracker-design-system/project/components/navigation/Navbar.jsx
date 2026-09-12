import React from "react";

export function Navbar({ brand = "FIFO Stock Tracker", links = [], user, onLogout }) {
  return (
    <nav
      style={{
        fontFamily: "var(--font-sans)",
        background: "var(--surface-navbar)",
        color: "var(--text-on-dark)",
        padding: "0.5rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.75rem",
        marginBottom: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: "var(--weight-semibold)", fontSize: "1.25rem" }}>{brand}</span>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href || "#"}
              onClick={l.onClick ? (e) => { e.preventDefault(); l.onClick(); } : undefined}
              style={{ color: l.active ? "var(--white)" : "rgba(255,255,255,.55)", textDecoration: "none" }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {user ? (
          <>
            <span style={{ color: "var(--text-on-dark)" }}>Hi, {user}</span>
            <button
              onClick={onLogout}
              style={{
                background: "transparent",
                color: "var(--white)",
                border: "1px solid rgba(255,255,255,.5)",
                borderRadius: "var(--radius-md)",
                padding: "0.25rem 0.5rem",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <a
            href="#"
            style={{
              color: "var(--white)",
              border: "1px solid rgba(255,255,255,.5)",
              borderRadius: "var(--radius-md)",
              padding: "0.25rem 0.5rem",
              fontSize: "var(--text-sm)",
              textDecoration: "none",
            }}
          >
            Login
          </a>
        )}
      </div>
    </nav>
  );
}
