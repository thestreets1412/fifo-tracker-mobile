Primary action button, and its outline variants used on toolbars and the dark navbar.

```jsx
<Button variant="primary">Record Buy</Button>
<Button variant="outline-secondary" size="sm">View</Button>
<Button variant="outline-light" size="sm">Logout</Button>
```

Variants: `primary` (filled blue, main CTAs like Record Buy/Sell, Save, Sell (FIFO)), `outline-secondary` (FIFO Report dropdown trigger, evidence "View" links), `outline-light` (Login/Logout on the dark navbar). Sizes: `md` (default) and `sm` (toolbar/table-row actions). All are disabled-aware (65% opacity, no pointer).
