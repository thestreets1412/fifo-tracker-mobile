Zebra-striped, row-hover data table — the app's primary content pattern (Stock Lots, Sell History).

```jsx
<Table columns={["Symbol", "Buy Date", "Qty"]}>
  <TableRow index={0}><TableCell>NVDA</TableCell><TableCell>2026-01-05</TableCell><TableCell>10</TableCell></TableRow>
</Table>
```

Odd rows get a faint gray stripe; any row darkens further on hover. Pair with `GainLossBadge` for numeric gain/loss cells.
