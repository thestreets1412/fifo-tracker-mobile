Centered dialog used for "Record a Buy" / "Record a Sell" — the app's only modal use. Backdrop click and × both close it; validation errors re-render inside the body via AJAX in the real app.

```jsx
<Modal title="Record a Buy" open={open} onClose={() => setOpen(false)}>
  <FormField label="Symbol"><Select /></FormField>
  <Button variant="primary">Save</Button>
</Modal>
```
