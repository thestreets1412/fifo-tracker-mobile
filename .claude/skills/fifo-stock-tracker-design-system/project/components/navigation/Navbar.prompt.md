Dark (`bg-dark`) top navbar — the app's only navigation chrome. Brand text on the left, page links, then either "Hi, {username}" + Logout or a Login button on the right.

```jsx
<Navbar brand="FIFO Stock Tracker" links={[{label:"Lots", active:true}, {label:"Sell History"}]} user="patipan" onLogout={() => {}} />
```
