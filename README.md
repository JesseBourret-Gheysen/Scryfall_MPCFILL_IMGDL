# Image Downloader for Google Sheets

(Automatic image downloads from URL cells — Scryfall-friendly)

## What this does

When you paste image URLs into a specific column, the script automatically downloads each image to a Google Drive folder you choose.

It supports:

- Single-cell edits
- Multi-row copy/paste
- Automatic operation after setup

---

## One-Time Setup (Required)

### 1) Make a copy of the Sheet

Open the template and choose:

**File → Make a copy**

You must own the copy to authorize scripts.

### 2) Open the Image Downloader menu

After opening your copy, wait 2–3 seconds. You will see a new menu:

**Image Downloader**

If you do not see it, refresh the page.

### 3) Run Setup

Click:

**Image Downloader → Setup (create trigger + configure)**

You will be asked for four values:

- **Sheet name**
  - The exact name of the tab containing your image URLs
  - Example: `Sheet1` or `Cards`

- **URL column number**
  - The column that contains the image URLs
  - Column A = 1, B = 2, C = 3, etc.

- **Drive folder ID**
  - Open Google Drive
  - Navigate to the folder where images should be saved
  - Copy the ID from the URL:

    `https://drive.google.com/drive/folders/XXXXXXXXXXXX`

    Copy only the `XXXXXXXXXXXX` part

- **Header row**
  - Row number of your header row
  - Rows at or above this number will be ignored
  - Use `1` for a single header row, or `0` if you have no headers

### 4) Authorize the script

Google will prompt you to approve permissions:

- Read spreadsheet edits
- Download files from the internet
- Save files to Google Drive

Click **Allow**.

This only happens once.

---

## How to Use (After Setup)

### Paste URLs into the configured column

- Paste one URL
- Or paste many rows at once

Each valid image URL will be:

- Downloaded
- Saved as a separate file
- Stored in your chosen Drive folder

No buttons, no formulas, no manual runs needed.

### What triggers a download

- Editing or pasting into the configured URL column
- Multi-row pastes are fully supported

### What does NOT trigger a download

- Editing other columns
- Editing header rows
- Pasting non-URL text

---

## Common Issues & Fixes

### “Nothing happens”

- Confirm you ran **Setup**
- Confirm the correct sheet name and URL column number
- Make sure the pasted value starts with `http://` or `https://`

### “Permission error”

- Re-run **Image Downloader → Setup**
- Approve permissions when prompted

### Duplicate downloads

- The script does not deduplicate by default
- Re-pasting the same URL will download again

(An optional “deduplication by row or card ID” version can be added later.)

---

## Optional Menu Tools

From **Image Downloader** menu:

- **Configure…** — change settings without recreating the trigger
- **Show current config** — verify your setup
- **Remove trigger** — disable automatic downloading

---

## Recommended Workflow (Scryfall users)

- Generate URLs (or paste static values)
- Paste them into the configured URL column
- Images appear automatically in Drive

---

## Support

If something breaks:

- Check **Extensions → Apps Script → Executions**
- Look for red “Failed” runs and read the error message