import React from "react";

export function GainLossBadge({ value, currency = "THB" }) {
  const gain = Number(value) >= 0;
  return (
    <span
      style={{
        fontFamily: "var(--font-sans)",
        color: gain ? "var(--gain)" : "var(--loss)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {gain ? "+" : ""}
      {Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {currency ? ` ${currency}` : ""}
    </span>
  );
}
