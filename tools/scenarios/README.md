# Area-owned test scenarios

`tools/shot.mjs` imports every `*.mjs` here. Each file default-exports a function that gets the
driver's helpers and returns scenarios:

```js
export default ({ page, ev, shot, frames, sleep, hold, tap, fps, fresh, OUT, PORT, ROOT, errors }) => ({
  async validate() { /* ... */ },
});
```

One file per area (`world.mjs`, `cars.mjs`, `people.mjs`, `ui.mjs`, `gameplay.mjs`), owned by that
area, so parallel agents never edit the same file. `fresh()` has already loaded the game
(`?test=1`) before each scenario runs. `OUT=<dir>` redirects screenshots.
