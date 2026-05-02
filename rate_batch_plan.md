# Plan: Rate-Limit-Safe Batch SCRYFALL Function

## Context

The `=SCRYFALL()` custom function is designed for single-cell use. When placed in 500 rows, Google Sheets evaluates all 500 calls **in parallel** — there is no way to stagger them from within the custom function because `LockService` and `PropertiesService` are unavailable in that execution context. The result is a flood of near-simultaneous API requests that triggers Scryfall's 429 rate limit (10 req/sec).

A random delay inside the custom function won't help: all 500 calls sleep simultaneously and fire simultaneously. The only correct fix for bulk use is a **menu-driven batch function**, which runs sequentially in a single execution with full service access and a 6-minute timeout.

---

## Approach: Two-Part Implementation

**Part 1 — Batch menu function (primary fix for 500 rows)**
A new "Run batch SCRYFALL" menu item reads queries from a configured column, calls Scryfall one row at a time with a configurable random delay between each call, and writes results back to the sheet.

**Part 2 — Retry logic in `scryfallSearch_` (secondary resilience)**
Add exponential backoff with jitter to `scryfallSearch_` for cases where a handful of parallel custom-function calls happen to collide. Won't stop the flood but handles transient 429s gracefully.

---

## Implementation Details

### New config keys (extend `CONFIG_KEYS` object, Code.gs line 149)

```
BATCH_QUERY_COLUMN  — column number containing card name/query per row
BATCH_OUTPUT_COLUMN — column where results are written (rightward)
BATCH_FIELDS        — space-separated Scryfall field names (e.g. "name image_uris.large")
BATCH_WAIT_MIN_MS   — minimum ms to sleep between requests  (default 110)
BATCH_WAIT_MAX_MS   — maximum ms to sleep between requests  (default 350)
```

### New functions to add to `Code.gs`

#### `configureBatch()` — wizard
Prompts for the 5 keys above using the existing `promptInt_` / `promptRequired_` helpers.
Saves to `PropertiesService.getDocumentProperties()`.

#### `getBatchConfig_(opts)` — config loader (mirrors existing `getConfig_`)
Reads and validates batch config. Throws a descriptive error if required keys are missing.

#### `scryfallSearchWithRetry_(params, num_results)` — retry wrapper
Wraps `scryfallSearch_` with up to 3 retries on 429:
- On 429: sleep `60000 + random(0, 15000)` ms (Scryfall says "try again after 60 seconds"), then retry
- On other non-200: throw immediately

#### `runScryfallBatch()` — main batch processor
```
1. Load batch config via getBatchConfig_()
2. Find last data row in BATCH_QUERY_COLUMN
3. For each row from HEADER_ROW+1 to last row:
   a. Read query from BATCH_QUERY_COLUMN — skip if blank
   b. Call scryfallSearchWithRetry_() → array of card objects
   c. Map fields → 2D array (reuse field_mappings and deepFind_ from SCRYFALL())
   d. Write 2D array to sheet starting at (row, BATCH_OUTPUT_COLUMN)
   e. Sleep random(BATCH_WAIT_MIN_MS, BATCH_WAIT_MAX_MS) ms via Utilities.sleep()
   f. Toast progress every 25 rows: "Processed X / Y rows…"
4. Final toast: "Batch complete: X rows processed, Y skipped"
```

### Change to existing `scryfallSearch_` (Code.gs line 110)
Add a single retry on 429 inside the while-loop's catch path so the existing custom function handles edge-case collisions. Max 1 retry (don't stack sleeps in a formula cell).

### Menu additions — `onOpen()` (Code.gs line 162)

```
Image Downloader
  ├─ Setup (create trigger + configure)      [existing]
  ├─ Configure…                              [existing]
  ├─ Show current config                     [existing]
  ├─ ─────────────────────
  ├─ Batch SCRYFALL → Configure batch…       [new]
  ├─ Batch SCRYFALL → Run batch now          [new]
  ├─ ─────────────────────
  └─ Remove trigger                          [existing]
```

---

## Critical Files

- `Code.gs` — all changes:
  - `CONFIG_KEYS` (line 149): add 5 new keys
  - `onOpen()` (line 162): add separator + 2 new menu items
  - `scryfallSearch_` (line 110): add single-retry on 429
  - Append before `// eof`: `configureBatch`, `getBatchConfig_`, `scryfallSearchWithRetry_`, `runScryfallBatch`
- `README.md` — add a "Batch Mode" section explaining the workflow and the parallel-call limitation of `=SCRYFALL()` for large datasets

## Existing utilities reused (no duplication)

- `promptRequired_` (line 431) and `promptInt_` (line 441) — used as-is in `configureBatch()`
- `field_mappings` and `deepFind_` (lines 35–105) — shared for result formatting in the batch loop
- `getConfig_` pattern (line 404) — cloned for `getBatchConfig_()`

---

## Verification

1. Copy updated `Code.gs` into Apps Script editor and save
2. Reload the spreadsheet — confirm two new menu items appear
3. Click **Batch SCRYFALL → Configure batch…** and fill in test values
4. Place 5 card names in the query column; click **Run batch now**
5. Confirm results appear in the output column and Executions log shows ~200ms gaps between requests
6. Confirm no 429 errors appear in the Executions log
7. Test with 500 rows — should complete in ~3 min (500 × 350ms max), within the 6-minute limit
