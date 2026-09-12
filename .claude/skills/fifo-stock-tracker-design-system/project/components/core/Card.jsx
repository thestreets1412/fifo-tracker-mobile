import React from "react";

export function Card({ children, style }) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, style }) {
  return <div style={{ padding: "var(--space-4)", ...style }}>{children}</div>;
}

export function CardTitle({ children, style }) {
  return (
    <h1
      style={{
        fontSize: "var(--text-lg)",
        fontWeight: "var(--weight-normal)",
        marginBottom: "var(--space-4)",
        marginTop: 0,
        color: "var(--text-body)",
        ...style,
      }}
    >
      {children}
    </h1>
  );
}
