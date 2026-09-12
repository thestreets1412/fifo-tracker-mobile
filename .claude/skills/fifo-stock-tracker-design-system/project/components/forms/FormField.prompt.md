Labeled form field wrapper matching the Buy/Sell modal forms, plus the three input primitives the app actually uses (text/number/date, select, file).

```jsx
<FormField label="Symbol">
  <Select><option>NVDA</option></Select>
</FormField>
<FormField label="Buy Date">
  <TextInput type="date" />
</FormField>
<FormField label="Evidence" helpText="Screenshot or receipt">
  <FileInput />
</FormField>
```

`error` renders a small red line below the field (mirrors Django's `field.errors` block). No custom Checkbox/Radio/Switch exist in the source app — StockLotForm and SellForm use only text/number/date/select/file inputs.
