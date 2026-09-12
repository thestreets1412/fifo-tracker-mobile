import React from "react";

const fieldBase = {
  display: "block",
  width: "100%",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-md)",
  padding: "0.375rem 0.75rem",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--gray-400)",
  color: "var(--text-body)",
  background: "var(--white)",
  boxSizing: "border-box",
  transition: "border-color .15s ease-in-out, box-shadow .15s ease-in-out",
};

export function FormField({ label, helpText, error, children }) {
  return (
    <div style={{ marginBottom: "var(--space-3)", fontFamily: "var(--font-sans)" }}>
      {label && (
        <label
          style={{
            display: "block",
            marginBottom: "0.25rem",
            fontSize: "var(--text-md)",
            color: "var(--text-body)",
          }}
        >
          {label}
        </label>
      )}
      {children}
      {helpText && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "0.25rem" }}>
          {helpText}
        </div>
      )}
      {error && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--loss)", marginTop: "0.25rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function TextInput({ type = "text", style, ...rest }) {
  return <input type={type} style={{ ...fieldBase, ...style }} {...rest} />;
}

export function Select({ children, style, ...rest }) {
  return (
    <select style={{ ...fieldBase, background: "var(--white)", ...style }} {...rest}>
      {children}
    </select>
  );
}

export function FileInput({ style, ...rest }) {
  return <input type="file" style={{ ...fieldBase, padding: "0.3rem 0.75rem", ...style }} {...rest} />;
}
