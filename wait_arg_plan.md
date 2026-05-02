# Plan: Add `wait` Argument to SCRYFALL()

## Context

The `=SCRYFALL()` custom function has no built-in delay. When a user places it in many rows, all instances evaluate in parallel and flood the Scryfall API simultaneously. A `wait` parameter lets the user manually stagger calls by specifying a delay in seconds per formula — e.g., row 2 gets `wait=0`, row 3 gets `wait=1`, row 4 gets `wait=2`, etc.

This is a low-friction workaround for moderate-size sheets without requiring the full batch infrastructure.

---

## Change

**File:** `Code.gs`

### 1. Update function signature (line 19)

Current:
```js
const SCRYFALL = (query, fields = "name", num_results = 150,
                  order = "name", dir = "auto", unique = "cards") => {
```

New:
```js
const SCRYFALL = (query, fields = "name", num_results = 150,
                  order = "name", dir = "auto", unique = "cards", wait = 0) => {
```

### 2. Add sleep before the API call (after input validation, before `scryfallSearch_`)

Insert after the `num_results` clamp block (~line 29) and before `fields = fields.split(...)`:

```js
  if (wait > 0) {
    Utilities.sleep(wait * 1000);
  }
```

### 3. Update JSDoc (lines 7–18)

Add a new `@param` line:

```js
 * @param {2}                            wait        Seconds to wait before executing the API call (default 0)
```

---

## Usage Example

```
=SCRYFALL(A2, "name image_uris.large", 1, "name", "auto", "cards", 0)
=SCRYFALL(A3, "name image_uris.large", 1, "name", "auto", "cards", 1)
=SCRYFALL(A4, "name image_uris.large", 1, "name", "auto", "cards", 2)
```

Each row fires 1 second apart, staying well under the 10 req/sec limit.

---

## Constraints

- Custom functions have a **6-minute execution timeout**. A `wait` value of more than ~300 seconds on a single call risks timeout.
- `Utilities.sleep()` IS available in custom functions.
- This approach works for moderate row counts. For 500+ rows, use the batch menu function instead (see `rate_batch_plan.md`).

---

## Verification

1. Update `Code.gs` in Apps Script editor
2. Use `=SCRYFALL(A2, "name", 1, "name", "auto", "cards", 2)` in a cell — confirm it waits ~2 seconds before returning
3. Place 3 formulas with `wait=0`, `wait=1`, `wait=2` — confirm staggered execution in the Executions log
