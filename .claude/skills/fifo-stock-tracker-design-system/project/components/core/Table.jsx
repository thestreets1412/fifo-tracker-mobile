import React from "react";

export function Table({ columns, children }) {
  return (
    <div style={{ overflowX: "auto", fontFamily: "var(--font-sans)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-md)" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: "left",
                  padding: "0.75rem",
                  borderBottom: "2px solid var(--border-default)",
                  color: "var(--text-body)",
                  fontWeight: "var(--weight-bold)",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, striped, index = 0 }) {
  const [hover, setHover] = React.useState(false);
  const bg = hover ? "var(--surface-hover)" : index % 2 === 1 ? "var(--surface-stripe)" : "transparent";
  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ background: bg, transition: "background-color .1s ease-in-out" }}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, style }) {
  return (
    <td
      style={{
        padding: "0.75rem",
        borderBottom: "1px solid var(--border-default)",
        verticalAlign: "middle",
        color: "var(--text-body)",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
