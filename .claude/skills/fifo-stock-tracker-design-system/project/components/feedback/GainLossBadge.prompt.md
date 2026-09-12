Inline colored number for a Sale's capital gain/loss — green for ≥0, red for negative. Sourced directly from `sale_list.html`'s `text-success`/`text-danger` split and the PDF report's GAIN_COLOR/LOSS_COLOR.

```jsx
<GainLossBadge value={1234.56} />
<GainLossBadge value={-89.10} />
```

Not a pill/chip — just colored text, matching the source template exactly (no background, no border).
