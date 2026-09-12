import React from "react";

export function Button({
  variant = "primary",
  size = "md",
  children,
  disabled = false,
  ...rest
}) {
  const palette = {
    primary: {
      bg: "var(--action-primary)",
      bgHover: "var(--action-primary-hover)",
      fg: "var(--white)",
      border: "var(--action-primary)",
    },
    "outline-secondary": {
      bg: "transparent",
      bgHover: "var(--gray-600)",
      fg: "var(--gray-600)",
      fgHover: "var(--white)",
      border: "var(--gray-600)",
    },
    "outline-light": {
      bg: "transparent",
      bgHover: "var(--white)",
      fg: "var(--white)",
      fgHover: "var(--gray-900)",
      border: "rgba(255,255,255,0.5)",
    },
  }[variant];

  const pad = size === "sm" ? "0.25rem 0.5rem" : "0.375rem 0.75rem";
  const fontSize = size === "sm" ? "var(--text-sm)" : "var(--text-md)";

  const [hover, setHover] = React.useState(false);

  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize,
        padding: pad,
        borderRadius: "var(--radius-md)",
        border: `1px solid ${palette.border}`,
        background: hover && !disabled ? palette.bgHover : palette.bg,
        color: hover && !disabled && palette.fgHover ? palette.fgHover : palette.fg,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        transition: "background-color .15s ease-in-out, color .15s ease-in-out, border-color .15s ease-in-out",
        lineHeight: 1.5,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
