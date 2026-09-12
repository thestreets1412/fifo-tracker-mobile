/* @ds-bundle: {"format":4,"namespace":"FIFOStockTrackerDesignSystem_00fc1c","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardBody","sourcePath":"components/core/Card.jsx"},{"name":"CardTitle","sourcePath":"components/core/Card.jsx"},{"name":"Table","sourcePath":"components/core/Table.jsx"},{"name":"TableRow","sourcePath":"components/core/Table.jsx"},{"name":"TableCell","sourcePath":"components/core/Table.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"GainLossBadge","sourcePath":"components/feedback/GainLossBadge.jsx"},{"name":"FormField","sourcePath":"components/forms/FormField.jsx"},{"name":"TextInput","sourcePath":"components/forms/FormField.jsx"},{"name":"Select","sourcePath":"components/forms/FormField.jsx"},{"name":"FileInput","sourcePath":"components/forms/FormField.jsx"},{"name":"Dropdown","sourcePath":"components/navigation/Dropdown.jsx"},{"name":"Modal","sourcePath":"components/navigation/Modal.jsx"},{"name":"Navbar","sourcePath":"components/navigation/Navbar.jsx"}],"sourceHashes":{"components/core/Button.jsx":"61a21cf664b8","components/core/Card.jsx":"9c52ce73ffe3","components/core/Table.jsx":"16127d6f2cc9","components/feedback/Alert.jsx":"45d3df1d1b73","components/feedback/GainLossBadge.jsx":"6a4dd1136f7e","components/forms/FormField.jsx":"355d54c3f111","components/navigation/Dropdown.jsx":"cd1d07eede7c","components/navigation/Modal.jsx":"1c8218c1ef79","components/navigation/Navbar.jsx":"aebe06aabb95","ui_kits/fifo-tracker/App.jsx":"090ea64356be"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FIFOStockTrackerDesignSystem_00fc1c = window.FIFOStockTrackerDesignSystem_00fc1c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
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
      border: "var(--action-primary)"
    },
    "outline-secondary": {
      bg: "transparent",
      bgHover: "var(--gray-600)",
      fg: "var(--gray-600)",
      fgHover: "var(--white)",
      border: "var(--gray-600)"
    },
    "outline-light": {
      bg: "transparent",
      bgHover: "var(--white)",
      fg: "var(--white)",
      fgHover: "var(--gray-900)",
      border: "rgba(255,255,255,0.5)"
    }
  }[variant];
  const pad = size === "sm" ? "0.25rem 0.5rem" : "0.375rem 0.75rem";
  const fontSize = size === "sm" ? "var(--text-sm)" : "var(--text-md)";
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      lineHeight: 1.5
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function Card({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, children);
}
function CardBody({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-4)",
      ...style
    }
  }, children);
}
function CardTitle({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "var(--text-lg)",
      fontWeight: "var(--weight-normal)",
      marginBottom: "var(--space-4)",
      marginTop: 0,
      color: "var(--text-body)",
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card, CardBody, CardTitle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Table.jsx
try { (() => {
function Table({
  columns,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: "auto",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "var(--text-md)"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c,
    style: {
      textAlign: "left",
      padding: "0.75rem",
      borderBottom: "2px solid var(--border-default)",
      color: "var(--text-body)",
      fontWeight: "var(--weight-bold)"
    }
  }, c)))), /*#__PURE__*/React.createElement("tbody", null, children)));
}
function TableRow({
  children,
  striped,
  index = 0
}) {
  const [hover, setHover] = React.useState(false);
  const bg = hover ? "var(--surface-hover)" : index % 2 === 1 ? "var(--surface-stripe)" : "transparent";
  return /*#__PURE__*/React.createElement("tr", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: bg,
      transition: "background-color .1s ease-in-out"
    }
  }, children);
}
function TableCell({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "0.75rem",
      borderBottom: "1px solid var(--border-default)",
      verticalAlign: "middle",
      color: "var(--text-body)",
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Table, TableRow, TableCell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Table.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function Alert({
  tone = "info",
  children,
  onClose
}) {
  const palette = {
    info: {
      bg: "#cff4fc",
      border: "#9eeaf9",
      fg: "#055160"
    },
    success: {
      bg: "#d1e7dd",
      border: "#a3cfbb",
      fg: "#0f5132"
    },
    warning: {
      bg: "#fff3cd",
      border: "#ffe69c",
      fg: "#664d03"
    },
    danger: {
      bg: "#f8d7da",
      border: "#f1aeb5",
      fg: "#842029"
    },
    secondary: {
      bg: "#e2e3e5",
      border: "#c4c8cb",
      fg: "#41464b"
    }
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-sans)",
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      color: palette.fg,
      borderRadius: "var(--radius-md)",
      padding: "1rem",
      marginBottom: "var(--space-3)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, children), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      background: "none",
      border: "none",
      fontSize: "1.1rem",
      lineHeight: 1,
      color: palette.fg,
      opacity: 0.6,
      cursor: "pointer"
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/GainLossBadge.jsx
try { (() => {
function GainLossBadge({
  value,
  currency = "THB"
}) {
  const gain = Number(value) >= 0;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      color: gain ? "var(--gain)" : "var(--loss)",
      fontVariantNumeric: "tabular-nums"
    }
  }, gain ? "+" : "", Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }), currency ? ` ${currency}` : "");
}
Object.assign(__ds_scope, { GainLossBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/GainLossBadge.jsx", error: String((e && e.message) || e) }); }

// components/forms/FormField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  transition: "border-color .15s ease-in-out, box-shadow .15s ease-in-out"
};
function FormField({
  label,
  helpText,
  error,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "var(--space-3)",
      fontFamily: "var(--font-sans)"
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      marginBottom: "0.25rem",
      fontSize: "var(--text-md)",
      color: "var(--text-body)"
    }
  }, label), children, helpText && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      marginTop: "0.25rem"
    }
  }, helpText), error && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--loss)",
      marginTop: "0.25rem"
    }
  }, error));
}
function TextInput({
  type = "text",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    style: {
      ...fieldBase,
      ...style
    }
  }, rest));
}
function Select({
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("select", _extends({
    style: {
      ...fieldBase,
      background: "var(--white)",
      ...style
    }
  }, rest), children);
}
function FileInput({
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("input", _extends({
    type: "file",
    style: {
      ...fieldBase,
      padding: "0.3rem 0.75rem",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { FormField, TextInput, Select, FileInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FormField.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Dropdown.jsx
try { (() => {
function Dropdown({
  label,
  items
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "inline-block",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    style: {
      background: "transparent",
      border: "1px solid var(--gray-600)",
      color: "var(--gray-600)",
      borderRadius: "var(--radius-md)",
      padding: "0.375rem 0.75rem",
      cursor: "pointer",
      fontSize: "var(--text-md)"
    }
  }, label, " \u25BE"), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 0,
      top: "calc(100% + 4px)",
      background: "var(--white)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-dropdown)",
      minWidth: 180,
      zIndex: 10,
      overflow: "hidden"
    }
  }, items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it.label,
    href: it.href || "#",
    style: {
      display: "block",
      padding: "0.5rem 1rem",
      color: "var(--text-body)",
      textDecoration: "none",
      fontSize: "var(--text-md)"
    }
  }, it.label))));
}
Object.assign(__ds_scope, { Dropdown });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Dropdown.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Modal.jsx
try { (() => {
function Modal({
  title,
  open,
  onClose,
  children
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1050,
      fontFamily: "var(--font-sans)"
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--white)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-modal)",
      width: "min(500px, 92vw)",
      maxHeight: "90vh",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "1rem",
      borderBottom: "1px solid var(--border-default)"
    }
  }, /*#__PURE__*/React.createElement("h5", {
    style: {
      margin: 0,
      fontSize: "1.25rem"
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      background: "none",
      border: "none",
      fontSize: "1.25rem",
      cursor: "pointer",
      color: "var(--text-muted)"
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "1rem"
    }
  }, children)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Modal.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Navbar.jsx
try { (() => {
function Navbar({
  brand = "FIFO Stock Tracker",
  links = [],
  user,
  onLogout
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      fontFamily: "var(--font-sans)",
      background: "var(--surface-navbar)",
      color: "var(--text-on-dark)",
      padding: "0.5rem 1rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "0.75rem",
      marginBottom: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "1.5rem",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: "var(--weight-semibold)",
      fontSize: "1.25rem"
    }
  }, brand), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "1rem",
      flexWrap: "wrap"
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l.label,
    href: l.href || "#",
    onClick: l.onClick ? e => {
      e.preventDefault();
      l.onClick();
    } : undefined,
    style: {
      color: l.active ? "var(--white)" : "rgba(255,255,255,.55)",
      textDecoration: "none"
    }
  }, l.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem"
    }
  }, user ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-on-dark)"
    }
  }, "Hi, ", user), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    style: {
      background: "transparent",
      color: "var(--white)",
      border: "1px solid rgba(255,255,255,.5)",
      borderRadius: "var(--radius-md)",
      padding: "0.25rem 0.5rem",
      fontSize: "var(--text-sm)",
      cursor: "pointer"
    }
  }, "Logout")) : /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: "var(--white)",
      border: "1px solid rgba(255,255,255,.5)",
      borderRadius: "var(--radius-md)",
      padding: "0.25rem 0.5rem",
      fontSize: "var(--text-sm)",
      textDecoration: "none"
    }
  }, "Login")));
}
Object.assign(__ds_scope, { Navbar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Navbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/fifo-tracker/App.jsx
try { (() => {
const {
  Navbar,
  Alert,
  Table,
  TableRow,
  TableCell,
  GainLossBadge,
  Button,
  Dropdown,
  Modal,
  FormField,
  TextInput,
  Select,
  FileInput
} = window.FIFOStockTrackerDesignSystem_00fc1c;
const SYMBOLS = ["NVDA", "SGOV", "TSLA", "AAPL"];
const INITIAL_LOTS = [{
  symbol: "NVDA",
  buyDate: "2026-01-05",
  price: 132.4,
  qty: 10,
  qtyRemaining: 10,
  fx: 35.2,
  costThb: 46604.8,
  evidence: true
}, {
  symbol: "SGOV",
  buyDate: "2026-02-11",
  price: 100.42,
  qty: 40,
  qtyRemaining: 0,
  fx: 34.9,
  costThb: 140186.32,
  evidence: false
}, {
  symbol: "SGOV",
  buyDate: "2026-03-02",
  price: 100.55,
  qty: 25,
  qtyRemaining: 25,
  fx: 34.7,
  costThb: 87227.13,
  evidence: true
}, {
  symbol: "TSLA",
  buyDate: "2026-04-18",
  price: 244.1,
  qty: 6,
  qtyRemaining: 6,
  fx: 34.6,
  costThb: 50691.72,
  evidence: false
}];
const INITIAL_SALES = [{
  symbol: "SGOV",
  sellDate: "2026-05-20",
  qty: 40,
  price: 101.1,
  fee: 1.5,
  proceedsThb: 141137.55,
  costBasisThb: 140186.32,
  evidence: true,
  allocations: [{
    buyDate: "2026-02-11",
    qty: 40
  }]
}, {
  symbol: "NVDA",
  sellDate: "2026-06-02",
  qty: 4,
  price: 128.0,
  fee: 1.0,
  proceedsThb: 17953.28,
  costBasisThb: 18641.92,
  evidence: false,
  allocations: [{
    buyDate: "2026-01-05",
    qty: 4
  }]
}];
function capitalGain(sale) {
  return sale.proceedsThb - sale.costBasisThb;
}
function EvidenceThumb({
  has,
  onClick
}) {
  if (!has) {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-muted)"
      }
    }, "\u2014");
  }
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    "aria-label": "View evidence",
    style: {
      width: 36,
      height: 36,
      padding: 0,
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      background: "var(--surface-muted)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--gray-600)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "bi bi-image",
    style: {
      fontSize: 16
    }
  }));
}
const cardListItemStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  padding: "0.75rem 1rem",
  marginBottom: "0.75rem",
  background: "var(--surface-card)"
};
const cardListHeadStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "var(--text-lg)",
  marginBottom: "0.5rem"
};
function CardListRow({
  label,
  value,
  last
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: "1rem",
      padding: "0.4rem 0",
      borderBottom: last ? "none" : "1px solid var(--surface-muted)",
      fontSize: "var(--text-sm)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, value));
}
function App() {
  const [tab, setTab] = React.useState("lots");
  const [lots, setLots] = React.useState(INITIAL_LOTS);
  const [sales, setSales] = React.useState(INITIAL_SALES);
  const [symbolFilter, setSymbolFilter] = React.useState("");
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [flash, setFlash] = React.useState(null);
  const [sellError, setSellError] = React.useState("");
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const [buyForm, setBuyForm] = React.useState({
    symbol: SYMBOLS[0],
    buyDate: "",
    price: "",
    qty: "",
    fx: ""
  });
  const [sellForm, setSellForm] = React.useState({
    symbol: SYMBOLS[0],
    sellDate: "",
    qty: "",
    price: "",
    fee: "0",
    fx: ""
  });
  const visibleLots = symbolFilter ? lots.filter(l => l.symbol === symbolFilter) : lots;
  const visibleSales = symbolFilter ? sales.filter(s => s.symbol === symbolFilter) : sales;
  function submitBuy(e) {
    e.preventDefault();
    const {
      symbol,
      buyDate,
      price,
      qty,
      fx
    } = buyForm;
    if (!buyDate || !price || !qty || !fx) return;
    const p = parseFloat(price),
      q = parseFloat(qty),
      f = parseFloat(fx);
    setLots(prev => [...prev, {
      symbol,
      buyDate,
      price: p,
      qty: q,
      qtyRemaining: q,
      fx: f,
      costThb: p * q * f
    }]);
    setBuyOpen(false);
    setFlash({
      tone: "success",
      text: `Buy recorded: ${q} ${symbol} @ $${p}.`
    });
    setBuyForm({
      symbol: SYMBOLS[0],
      buyDate: "",
      price: "",
      qty: "",
      fx: ""
    });
  }
  function submitSell(e) {
    e.preventDefault();
    const {
      symbol,
      sellDate,
      qty,
      price,
      fee,
      fx
    } = sellForm;
    if (!sellDate || !qty || !price || !fx) return;
    const q = parseFloat(qty),
      p = parseFloat(price),
      fe = parseFloat(fee || "0"),
      f = parseFloat(fx);
    const openLots = lots.map((l, idx) => ({
      ...l,
      idx
    })).filter(l => l.symbol === symbol && l.qtyRemaining > 0).sort((a, b) => a.buyDate.localeCompare(b.buyDate));
    const totalAvailable = openLots.reduce((sum, l) => sum + l.qtyRemaining, 0);
    if (q > totalAvailable) {
      setSellError(`Cannot sell ${q} shares of ${symbol} — only ${totalAvailable} remaining across open lots.`);
      return;
    }
    let remaining = q;
    let costBasisThb = 0;
    const allocations = [];
    const lotsCopy = [...lots];
    for (const lot of openLots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.qtyRemaining);
      const costPerShare = lot.costThb / lot.qty;
      costBasisThb += take * costPerShare;
      allocations.push({
        buyDate: lot.buyDate,
        qty: take
      });
      lotsCopy[lot.idx] = {
        ...lot,
        qtyRemaining: lot.qtyRemaining - take
      };
      remaining -= take;
    }
    setLots(lotsCopy);
    setSales(prev => [{
      symbol,
      sellDate,
      qty: q,
      price: p,
      fee: fe,
      proceedsThb: (p * q - fe) * f,
      costBasisThb,
      allocations
    }, ...prev]);
    setSellOpen(false);
    setSellError("");
    setFlash({
      tone: "success",
      text: `Sell recorded: ${q} ${symbol} @ $${p} (FIFO-matched across ${allocations.length} lot${allocations.length > 1 ? "s" : ""}).`
    });
    setSellForm({
      symbol: SYMBOLS[0],
      sellDate: "",
      qty: "",
      price: "",
      fee: "0",
      fx: ""
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "var(--surface-page)",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement(Navbar, {
    brand: "FIFO Stock Tracker",
    links: [{
      label: "Lots",
      active: tab === "lots",
      onClick: () => setTab("lots")
    }, {
      label: "Sell History",
      active: tab === "sales",
      onClick: () => setTab("sales")
    }],
    user: "patipan",
    onLogout: () => setFlash({
      tone: "secondary",
      text: "Logged out."
    })
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      maxWidth: 1140,
      margin: "0 auto",
      padding: "0 1rem 3rem"
    }
  }, flash && /*#__PURE__*/React.createElement(Alert, {
    tone: flash.tone,
    onClose: () => setFlash(null)
  }, flash.text), /*#__PURE__*/React.createElement("div", {
    className: "fifo-toolbar",
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem",
      flexWrap: "wrap",
      gap: "0.75rem"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: "var(--text-2xl)",
      fontWeight: "var(--weight-bold)"
    }
  }, tab === "lots" ? "Stock Lots" : "Sell History"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "0.5rem"
    }
  }, /*#__PURE__*/React.createElement(Dropdown, {
    label: "FIFO Report",
    items: [{
      label: "Download CSV"
    }, {
      label: "Download PDF"
    }]
  }), tab === "lots" ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => setBuyOpen(true)
  }, "Record Buy") : /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => setSellOpen(true)
  }, "Record Sell"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "1rem",
      display: "flex",
      gap: "0.5rem",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: "var(--text-md)"
    }
  }, "Symbol:"), /*#__PURE__*/React.createElement("select", {
    value: symbolFilter,
    onChange: e => setSymbolFilter(e.target.value),
    style: {
      fontFamily: "var(--font-sans)",
      padding: "0.375rem 0.75rem",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--gray-400)"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "-- All Symbols --"), SYMBOLS.map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s)))), tab === "lots" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "fifo-table-wrap"
  }, /*#__PURE__*/React.createElement(Table, {
    columns: ["Symbol", "Buy Date", "Price (USD)", "Qty", "Qty Remaining", "FX Rate", "Cost (THB)", "Evidence"]
  }, visibleLots.map((l, i) => /*#__PURE__*/React.createElement(TableRow, {
    key: i,
    index: i
  }, /*#__PURE__*/React.createElement(TableCell, null, l.symbol), /*#__PURE__*/React.createElement(TableCell, null, l.buyDate), /*#__PURE__*/React.createElement(TableCell, null, l.price.toFixed(2)), /*#__PURE__*/React.createElement(TableCell, null, l.qty), /*#__PURE__*/React.createElement(TableCell, null, l.qtyRemaining === 0 ? /*#__PURE__*/React.createElement("span", {
    style: {
      textDecoration: "line-through",
      color: "var(--text-muted)"
    }
  }, "0") : l.qtyRemaining), /*#__PURE__*/React.createElement(TableCell, null, l.fx.toFixed(2)), /*#__PURE__*/React.createElement(TableCell, null, l.costThb.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(EvidenceThumb, {
    has: l.evidence,
    onClick: () => setEvidenceOpen(true)
  })))))), /*#__PURE__*/React.createElement("div", {
    className: "fifo-card-list"
  }, visibleLots.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: cardListItemStyle
  }, /*#__PURE__*/React.createElement("div", {
    style: cardListHeadStyle
  }, /*#__PURE__*/React.createElement("strong", null, l.symbol), /*#__PURE__*/React.createElement(EvidenceThumb, {
    has: l.evidence,
    onClick: () => setEvidenceOpen(true)
  })), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Buy Date",
    value: l.buyDate
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Price (USD)",
    value: l.price.toFixed(2)
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Qty",
    value: l.qty
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Qty Remaining",
    value: l.qtyRemaining === 0 ? "0 (closed)" : l.qtyRemaining
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "FX Rate",
    value: l.fx.toFixed(2)
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Cost (THB)",
    value: l.costThb.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    last: true
  }))))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "fifo-table-wrap"
  }, /*#__PURE__*/React.createElement(Table, {
    columns: ["Symbol", "Sell Date", "Qty Sold", "Sale Price (USD)", "Fee (USD)", "Proceeds (THB)", "Cost Basis (THB)", "Capital Gain (THB)", "Lots Affected", "Evidence"]
  }, visibleSales.map((s, i) => /*#__PURE__*/React.createElement(TableRow, {
    key: i,
    index: i
  }, /*#__PURE__*/React.createElement(TableCell, null, s.symbol), /*#__PURE__*/React.createElement(TableCell, null, s.sellDate), /*#__PURE__*/React.createElement(TableCell, null, s.qty), /*#__PURE__*/React.createElement(TableCell, null, s.price.toFixed(2)), /*#__PURE__*/React.createElement(TableCell, null, s.fee.toFixed(2)), /*#__PURE__*/React.createElement(TableCell, null, s.proceedsThb.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })), /*#__PURE__*/React.createElement(TableCell, null, s.costBasisThb.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(GainLossBadge, {
    value: capitalGain(s)
  })), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      fontSize: "var(--text-sm)"
    }
  }, s.allocations.map((a, j) => /*#__PURE__*/React.createElement("li", {
    key: j
  }, a.buyDate, " \u2014 ", a.qty, " shares")))), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(EvidenceThumb, {
    has: s.evidence,
    onClick: () => setEvidenceOpen(true)
  })))))), /*#__PURE__*/React.createElement("div", {
    className: "fifo-card-list"
  }, visibleSales.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: cardListItemStyle
  }, /*#__PURE__*/React.createElement("div", {
    style: cardListHeadStyle
  }, /*#__PURE__*/React.createElement("strong", null, s.symbol), /*#__PURE__*/React.createElement(EvidenceThumb, {
    has: s.evidence,
    onClick: () => setEvidenceOpen(true)
  })), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Sell Date",
    value: s.sellDate
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Qty Sold",
    value: s.qty
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Sale Price (USD)",
    value: s.price.toFixed(2)
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Fee (USD)",
    value: s.fee.toFixed(2)
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Proceeds (THB)",
    value: s.proceedsThb.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Cost Basis (THB)",
    value: s.costBasisThb.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Capital Gain",
    value: /*#__PURE__*/React.createElement(GainLossBadge, {
      value: capitalGain(s)
    })
  }), /*#__PURE__*/React.createElement(CardListRow, {
    label: "Lots Affected",
    value: s.allocations.map(a => `${a.buyDate} \u2014 ${a.qty}`).join(", "),
    last: true
  })))))), /*#__PURE__*/React.createElement(Modal, {
    title: "Evidence",
    open: evidenceOpen,
    onClose: () => setEvidenceOpen(false)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "4 / 3",
      background: "var(--surface-muted)",
      borderRadius: "var(--radius-md)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--gray-500)",
      border: "1px solid var(--border-default)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "bi bi-image",
    style: {
      fontSize: 40
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)",
      marginTop: "0.75rem"
    }
  }, "Placeholder \u2014 the real app renders the uploaded receipt/screenshot here (", /*#__PURE__*/React.createElement("code", null, "lot.evidence.url"), ").")), /*#__PURE__*/React.createElement(Modal, {
    title: "Record a Buy",
    open: buyOpen,
    onClose: () => setBuyOpen(false)
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submitBuy
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Symbol"
  }, /*#__PURE__*/React.createElement(Select, {
    value: buyForm.symbol,
    onChange: e => setBuyForm({
      ...buyForm,
      symbol: e.target.value
    })
  }, SYMBOLS.map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s)))), /*#__PURE__*/React.createElement(FormField, {
    label: "Buy Date"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "date",
    value: buyForm.buyDate,
    onChange: e => setBuyForm({
      ...buyForm,
      buyDate: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Price Usd"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: buyForm.price,
    onChange: e => setBuyForm({
      ...buyForm,
      price: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Qty"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: buyForm.qty,
    onChange: e => setBuyForm({
      ...buyForm,
      qty: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Fx Rate Usd Thb"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: buyForm.fx,
    onChange: e => setBuyForm({
      ...buyForm,
      fx: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Evidence"
  }, /*#__PURE__*/React.createElement(FileInput, null)), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    type: "submit"
  }, "Save"))), /*#__PURE__*/React.createElement(Modal, {
    title: "Record a Sell",
    open: sellOpen,
    onClose: () => {
      setSellOpen(false);
      setSellError("");
    }
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submitSell
  }, sellError && /*#__PURE__*/React.createElement(Alert, {
    tone: "danger"
  }, sellError), /*#__PURE__*/React.createElement(FormField, {
    label: "Symbol"
  }, /*#__PURE__*/React.createElement(Select, {
    value: sellForm.symbol,
    onChange: e => setSellForm({
      ...sellForm,
      symbol: e.target.value
    })
  }, SYMBOLS.map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s)))), /*#__PURE__*/React.createElement(FormField, {
    label: "Sell Date"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "date",
    value: sellForm.sellDate,
    onChange: e => setSellForm({
      ...sellForm,
      sellDate: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Qty Sold"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: sellForm.qty,
    onChange: e => setSellForm({
      ...sellForm,
      qty: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Sale Price Usd"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: sellForm.price,
    onChange: e => setSellForm({
      ...sellForm,
      price: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Fee Usd"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: sellForm.fee,
    onChange: e => setSellForm({
      ...sellForm,
      fee: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Fx Rate Usd Thb"
  }, /*#__PURE__*/React.createElement(TextInput, {
    type: "number",
    step: "0.01",
    value: sellForm.fx,
    onChange: e => setSellForm({
      ...sellForm,
      fx: e.target.value
    })
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Evidence"
  }, /*#__PURE__*/React.createElement(FileInput, null)), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    type: "submit"
  }, "Sell (FIFO)"))));
}
window.App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/fifo-tracker/App.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardBody = __ds_scope.CardBody;

__ds_ns.CardTitle = __ds_scope.CardTitle;

__ds_ns.Table = __ds_scope.Table;

__ds_ns.TableRow = __ds_scope.TableRow;

__ds_ns.TableCell = __ds_scope.TableCell;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.GainLossBadge = __ds_scope.GainLossBadge;

__ds_ns.FormField = __ds_scope.FormField;

__ds_ns.TextInput = __ds_scope.TextInput;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.FileInput = __ds_scope.FileInput;

__ds_ns.Dropdown = __ds_scope.Dropdown;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Navbar = __ds_scope.Navbar;

})();
