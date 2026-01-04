# Image Downloader for Google Sheets

An automatic image downloader from cells containing image URLs packaged with a forked version of a google sheets custom function for the scryfall api. This is for placing orders of MTG proxy orders on MPCfill.

# USAGE
The Scryfall() GS function can be used to pull out image urls, eg. 

=SCRYFALL(<Cell address with your card name or card search query>, <A String of space separated Scryfall Field names>, <Max Number of results returned (Each gets its own line below where this is called)>)

=SCRYFALL(A2, "name type oracle_text power toughness mana_cost prices.usd image_uris.normal image_uris.large image_uris.png", 3)

The Image Downloader Trigger gets called when the column specified in the setup config is edited - so copying and pasting the column will trigger the downloads. The above example puts the 'large' images in the 9th column of the results, so in my case it would be 10 because of the reference column A before the results.

## What this does

When you paste image URLs into a specific column, the script automatically downloads each image to a Google Drive folder you choose.

It supports:

- Single-cell edits
- Multi-row copy/paste
- Automatic operation after setup

---

## One-Time Setup (Required)

### 1) Creating the sheet script
First click on the extensions menu and navigate to the 'Apps Script' button.
![Click on Extensions](images/1.png)

![Click on Apps Script](images/2.png)

Now Name your script
![Name your script](images/3.png)

Navigate to script settings page
![Click on Script Settings](images/4.png)

Ensure you have the correct timezone selected - this can impact api calls. And also select the 'show appscript.json manifest' check box.
![Confirm timezone, and check appscript.json](images/5.png)

Navigate back to the script tab, and copy in the Code.gs file
![Copy script into Code.gs](images/6.png)

In the appsscript.json folder, allow for Oauth by pasting in the scopes - keep all other parameters in your own file. 
![Copy script into appscript.json](images/7.png)

Apply your Scryfall call to get the image urls.
![Use Scryfall() function to get img urls](images/8.png)

Copy the Google Drive Folder ID you'll be using to store the images
![Setup the Image downloader script](images/10.png)

### 3) Run Setup

Setup the image downloader script. If you don't see this menu after saving your script, try refreshing the page.
![Setup the Image downloader script](images/9.png)

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