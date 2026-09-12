const {
  Navbar, Alert, Table, TableRow, TableCell, GainLossBadge, Button,
  Dropdown, Modal, FormField, TextInput, Select, FileInput,
} = window.FIFOStockTrackerDesignSystem_00fc1c;

const SYMBOLS = ["NVDA", "SGOV", "TSLA", "AAPL"];

const INITIAL_LOTS = [
  { symbol: "NVDA", buyDate: "2026-01-05", price: 132.4, qty: 10, qtyRemaining: 10, fx: 35.2, costThb: 46604.8, evidence: true },
  { symbol: "SGOV", buyDate: "2026-02-11", price: 100.42, qty: 40, qtyRemaining: 0, fx: 34.9, costThb: 140186.32, evidence: false },
  { symbol: "SGOV", buyDate: "2026-03-02", price: 100.55, qty: 25, qtyRemaining: 25, fx: 34.7, costThb: 87227.13, evidence: true },
  { symbol: "TSLA", buyDate: "2026-04-18", price: 244.1, qty: 6, qtyRemaining: 6, fx: 34.6, costThb: 50691.72, evidence: false },
];

const INITIAL_SALES = [
  {
    symbol: "SGOV", sellDate: "2026-05-20", qty: 40, price: 101.1, fee: 1.5,
    proceedsThb: 141137.55, costBasisThb: 140186.32, evidence: true,
    allocations: [{ buyDate: "2026-02-11", qty: 40 }],
  },
  {
    symbol: "NVDA", sellDate: "2026-06-02", qty: 4, price: 128.0, fee: 1.0,
    proceedsThb: 17953.28, costBasisThb: 18641.92, evidence: false,
    allocations: [{ buyDate: "2026-01-05", qty: 4 }],
  },
];

function capitalGain(sale) {
  return sale.proceedsThb - sale.costBasisThb;
}

function EvidenceThumb({ has, onClick }) {
  if (!has) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return (
    <button
      onClick={onClick}
      aria-label="View evidence"
      style={{
        width: 36, height: 36, padding: 0, border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)", background: "var(--surface-muted)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gray-600)",
      }}
    >
      <i className="bi bi-image" style={{ fontSize: 16 }}></i>
    </button>
  );
}

const cardListItemStyle = {
  border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)",
  padding: "0.75rem 1rem", marginBottom: "0.75rem", background: "var(--surface-card)",
};
const cardListHeadStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  fontSize: "var(--text-lg)", marginBottom: "0.5rem",
};

function CardListRow({ label, value, last }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.4rem 0",
        borderBottom: last ? "none" : "1px solid var(--surface-muted)", fontSize: "var(--text-sm)",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
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

  const [buyForm, setBuyForm] = React.useState({ symbol: SYMBOLS[0], buyDate: "", price: "", qty: "", fx: "" });
  const [sellForm, setSellForm] = React.useState({ symbol: SYMBOLS[0], sellDate: "", qty: "", price: "", fee: "0", fx: "" });

  const visibleLots = symbolFilter ? lots.filter((l) => l.symbol === symbolFilter) : lots;
  const visibleSales = symbolFilter ? sales.filter((s) => s.symbol === symbolFilter) : sales;

  function submitBuy(e) {
    e.preventDefault();
    const { symbol, buyDate, price, qty, fx } = buyForm;
    if (!buyDate || !price || !qty || !fx) return;
    const p = parseFloat(price), q = parseFloat(qty), f = parseFloat(fx);
    setLots((prev) => [...prev, { symbol, buyDate, price: p, qty: q, qtyRemaining: q, fx: f, costThb: p * q * f }]);
    setBuyOpen(false);
    setFlash({ tone: "success", text: `Buy recorded: ${q} ${symbol} @ $${p}.` });
    setBuyForm({ symbol: SYMBOLS[0], buyDate: "", price: "", qty: "", fx: "" });
  }

  function submitSell(e) {
    e.preventDefault();
    const { symbol, sellDate, qty, price, fee, fx } = sellForm;
    if (!sellDate || !qty || !price || !fx) return;
    const q = parseFloat(qty), p = parseFloat(price), fe = parseFloat(fee || "0"), f = parseFloat(fx);

    const openLots = lots
      .map((l, idx) => ({ ...l, idx }))
      .filter((l) => l.symbol === symbol && l.qtyRemaining > 0)
      .sort((a, b) => a.buyDate.localeCompare(b.buyDate));

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
      allocations.push({ buyDate: lot.buyDate, qty: take });
      lotsCopy[lot.idx] = { ...lot, qtyRemaining: lot.qtyRemaining - take };
      remaining -= take;
    }

    setLots(lotsCopy);
    setSales((prev) => [
      { symbol, sellDate, qty: q, price: p, fee: fe, proceedsThb: (p * q - fe) * f, costBasisThb, allocations },
      ...prev,
    ]);
    setSellOpen(false);
    setSellError("");
    setFlash({ tone: "success", text: `Sell recorded: ${q} ${symbol} @ $${p} (FIFO-matched across ${allocations.length} lot${allocations.length > 1 ? "s" : ""}).` });
    setSellForm({ symbol: SYMBOLS[0], sellDate: "", qty: "", price: "", fee: "0", fx: "" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-page)", fontFamily: "var(--font-sans)" }}>
      <Navbar
        brand="FIFO Stock Tracker"
        links={[
          { label: "Lots", active: tab === "lots", onClick: () => setTab("lots") },
          { label: "Sell History", active: tab === "sales", onClick: () => setTab("sales") },
        ]}
        user="patipan"
        onLogout={() => setFlash({ tone: "secondary", text: "Logged out." })}
      />
      <main style={{ maxWidth: 1140, margin: "0 auto", padding: "0 1rem 3rem" }}>
        {flash && (
          <Alert tone={flash.tone} onClose={() => setFlash(null)}>
            {flash.text}
          </Alert>
        )}

        <div className="fifo-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: "var(--weight-bold)" }}>
            {tab === "lots" ? "Stock Lots" : "Sell History"}
          </h1>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Dropdown label="FIFO Report" items={[{ label: "Download CSV" }, { label: "Download PDF" }]} />
            {tab === "lots" ? (
              <Button variant="primary" onClick={() => setBuyOpen(true)}>Record Buy</Button>
            ) : (
              <Button variant="primary" onClick={() => setSellOpen(true)}>Record Sell</Button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ fontSize: "var(--text-md)" }}>Symbol:</label>
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            style={{ fontFamily: "var(--font-sans)", padding: "0.375rem 0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--gray-400)" }}
          >
            <option value="">-- All Symbols --</option>
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {tab === "lots" ? (
          <React.Fragment>
            <div className="fifo-table-wrap">
              <Table columns={["Symbol", "Buy Date", "Price (USD)", "Qty", "Qty Remaining", "FX Rate", "Cost (THB)", "Evidence"]}>
                {visibleLots.map((l, i) => (
                  <TableRow key={i} index={i}>
                    <TableCell>{l.symbol}</TableCell>
                    <TableCell>{l.buyDate}</TableCell>
                    <TableCell>{l.price.toFixed(2)}</TableCell>
                    <TableCell>{l.qty}</TableCell>
                    <TableCell>
                      {l.qtyRemaining === 0 ? (
                        <span style={{ textDecoration: "line-through", color: "var(--text-muted)" }}>0</span>
                      ) : (
                        l.qtyRemaining
                      )}
                    </TableCell>
                    <TableCell>{l.fx.toFixed(2)}</TableCell>
                    <TableCell>{l.costThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><EvidenceThumb has={l.evidence} onClick={() => setEvidenceOpen(true)} /></TableCell>
                  </TableRow>
                ))}
              </Table>
            </div>
            <div className="fifo-card-list">
              {visibleLots.map((l, i) => (
                <div key={i} style={cardListItemStyle}>
                  <div style={cardListHeadStyle}>
                    <strong>{l.symbol}</strong>
                    <EvidenceThumb has={l.evidence} onClick={() => setEvidenceOpen(true)} />
                  </div>
                  <CardListRow label="Buy Date" value={l.buyDate} />
                  <CardListRow label="Price (USD)" value={l.price.toFixed(2)} />
                  <CardListRow label="Qty" value={l.qty} />
                  <CardListRow label="Qty Remaining" value={l.qtyRemaining === 0 ? "0 (closed)" : l.qtyRemaining} />
                  <CardListRow label="FX Rate" value={l.fx.toFixed(2)} />
                  <CardListRow label="Cost (THB)" value={l.costThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} last />
                </div>
              ))}
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div className="fifo-table-wrap">
              <Table columns={["Symbol", "Sell Date", "Qty Sold", "Sale Price (USD)", "Fee (USD)", "Proceeds (THB)", "Cost Basis (THB)", "Capital Gain (THB)", "Lots Affected", "Evidence"]}>
                {visibleSales.map((s, i) => (
                  <TableRow key={i} index={i}>
                    <TableCell>{s.symbol}</TableCell>
                    <TableCell>{s.sellDate}</TableCell>
                    <TableCell>{s.qty}</TableCell>
                    <TableCell>{s.price.toFixed(2)}</TableCell>
                    <TableCell>{s.fee.toFixed(2)}</TableCell>
                    <TableCell>{s.proceedsThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{s.costBasisThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell><GainLossBadge value={capitalGain(s)} /></TableCell>
                    <TableCell>
                      <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "var(--text-sm)" }}>
                        {s.allocations.map((a, j) => (
                          <li key={j}>{a.buyDate} — {a.qty} shares</li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell><EvidenceThumb has={s.evidence} onClick={() => setEvidenceOpen(true)} /></TableCell>
                  </TableRow>
                ))}
              </Table>
            </div>
            <div className="fifo-card-list">
              {visibleSales.map((s, i) => (
                <div key={i} style={cardListItemStyle}>
                  <div style={cardListHeadStyle}>
                    <strong>{s.symbol}</strong>
                    <EvidenceThumb has={s.evidence} onClick={() => setEvidenceOpen(true)} />
                  </div>
                  <CardListRow label="Sell Date" value={s.sellDate} />
                  <CardListRow label="Qty Sold" value={s.qty} />
                  <CardListRow label="Sale Price (USD)" value={s.price.toFixed(2)} />
                  <CardListRow label="Fee (USD)" value={s.fee.toFixed(2)} />
                  <CardListRow label="Proceeds (THB)" value={s.proceedsThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                  <CardListRow label="Cost Basis (THB)" value={s.costBasisThb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                  <CardListRow label="Capital Gain" value={<GainLossBadge value={capitalGain(s)} />} />
                  <CardListRow
                    label="Lots Affected"
                    value={s.allocations.map((a) => `${a.buyDate} \u2014 ${a.qty}`).join(", ")}
                    last
                  />
                </div>
              ))}
            </div>
          </React.Fragment>
        )}
      </main>

      <Modal title="Evidence" open={evidenceOpen} onClose={() => setEvidenceOpen(false)}>
        <div
          style={{
            aspectRatio: "4 / 3", background: "var(--surface-muted)", borderRadius: "var(--radius-md)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gray-500)",
            border: "1px solid var(--border-default)",
          }}
        >
          <i className="bi bi-image" style={{ fontSize: 40 }}></i>
        </div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: "0.75rem" }}>
          Placeholder — the real app renders the uploaded receipt/screenshot here (<code>lot.evidence.url</code>).
        </p>
      </Modal>

      <Modal title="Record a Buy" open={buyOpen} onClose={() => setBuyOpen(false)}>
        <form onSubmit={submitBuy}>
          <FormField label="Symbol">
            <Select value={buyForm.symbol} onChange={(e) => setBuyForm({ ...buyForm, symbol: e.target.value })}>
              {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Buy Date">
            <TextInput type="date" value={buyForm.buyDate} onChange={(e) => setBuyForm({ ...buyForm, buyDate: e.target.value })} />
          </FormField>
          <FormField label="Price Usd">
            <TextInput type="number" step="0.01" value={buyForm.price} onChange={(e) => setBuyForm({ ...buyForm, price: e.target.value })} />
          </FormField>
          <FormField label="Qty">
            <TextInput type="number" step="0.01" value={buyForm.qty} onChange={(e) => setBuyForm({ ...buyForm, qty: e.target.value })} />
          </FormField>
          <FormField label="Fx Rate Usd Thb">
            <TextInput type="number" step="0.01" value={buyForm.fx} onChange={(e) => setBuyForm({ ...buyForm, fx: e.target.value })} />
          </FormField>
          <FormField label="Evidence">
            <FileInput />
          </FormField>
          <Button variant="primary" type="submit">Save</Button>
        </form>
      </Modal>

      <Modal title="Record a Sell" open={sellOpen} onClose={() => { setSellOpen(false); setSellError(""); }}>
        <form onSubmit={submitSell}>
          {sellError && <Alert tone="danger">{sellError}</Alert>}
          <FormField label="Symbol">
            <Select value={sellForm.symbol} onChange={(e) => setSellForm({ ...sellForm, symbol: e.target.value })}>
              {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Sell Date">
            <TextInput type="date" value={sellForm.sellDate} onChange={(e) => setSellForm({ ...sellForm, sellDate: e.target.value })} />
          </FormField>
          <FormField label="Qty Sold">
            <TextInput type="number" step="0.01" value={sellForm.qty} onChange={(e) => setSellForm({ ...sellForm, qty: e.target.value })} />
          </FormField>
          <FormField label="Sale Price Usd">
            <TextInput type="number" step="0.01" value={sellForm.price} onChange={(e) => setSellForm({ ...sellForm, price: e.target.value })} />
          </FormField>
          <FormField label="Fee Usd">
            <TextInput type="number" step="0.01" value={sellForm.fee} onChange={(e) => setSellForm({ ...sellForm, fee: e.target.value })} />
          </FormField>
          <FormField label="Fx Rate Usd Thb">
            <TextInput type="number" step="0.01" value={sellForm.fx} onChange={(e) => setSellForm({ ...sellForm, fx: e.target.value })} />
          </FormField>
          <FormField label="Evidence">
            <FileInput />
          </FormField>
          <Button variant="primary" type="submit">Sell (FIFO)</Button>
        </form>
      </Modal>
    </div>
  );
}

window.App = App;
