Dismissible alert banner rendered for Django `messages` framework output (settings.py maps DEBUG/INFO/SUCCESS/WARNING/ERROR to Bootstrap alert tones).

```jsx
<Alert tone="success" onClose={() => {}}>Buy recorded.</Alert>
```

Five tones map 1:1 to `MESSAGE_TAGS` in config/settings.py: secondary (debug), info, success, warning, danger (error).
