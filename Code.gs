// this function is available here:
// https://github.com/scryfall/google-sheets/blob/main/scryfall-google-sheets.js
// and was last updated on 2021-01-08 (probably)

const MAX_RESULTS_ = 700;  // a safe max due to Google Sheets timeout system

/**
 * Inserts the results of a search in Scryfall into your spreadsheet
 *
 * @param {"name:braids type:legendary"}  query       Scryfall search query
 * @param {"name power toughness"}        fields      List of fields to return from Scryfall, "name" is default. Pass "*" to return all fields.
 * @param {150}                           num_results Number of results (default 150, maximum 700)
 * @param {name}                          order       The order to sort cards by, "name" is default
 * @param {auto}                          dir         Direction to return the sorted cards: auto, asc, or desc 
 * @param {cards}                         unique      Remove duplicate cards (default), art, or prints
 * @param {number}                        wait        Seconds to wait before the API call (default 0, max 20 — custom functions time out at 30s)
 * @param {false}                         headers     Output field names as a header row before results (default false)
 * @return                                List of Scryfall search results
 * @customfunction
 */
const SCRYFALL = (query, fields = "name", num_results = 150,
                  order = "name", dir = "auto", unique = "cards", wait = 0, headers = false) => {
  if (query === undefined) {
    throw new Error("Must include a query");
  }

  // don't break scryfall
  if (num_results > MAX_RESULTS_) {
    num_results = MAX_RESULTS_;
  }

  // custom functions hard-timeout at 30s; leave headroom for the fetch
  const MAX_WAIT_SEC = 20;
  const waitNum = Number(wait);
  if (Number.isFinite(waitNum) && waitNum > 0) {
    if (waitNum > MAX_WAIT_SEC) {
      throw new Error(`wait must be <= ${MAX_WAIT_SEC} seconds (Google Sheets custom functions time out at 30s)`);
    }
    Utilities.sleep(waitNum * 1000);
  }

  const wildcard = (typeof fields === "string" ? fields.trim() : fields) === "*";

  // the docs say fields is space separated, but allow comma separated too
  fields = wildcard ? [] : fields.split(/[\s,]+/);

  // most people won't know the JSON field names for cards, so let's do some mapping of
  // what they'll try to what it should be
  const field_mappings = {
    "color": "color_identity",
    "colors": "color_identity",
    "flavor": "flavor_text",
    "mana": "mana_cost",
    "o": "oracle_text",
    "oracle": "oracle_text",
    "price": "prices.usd",
    "type": "type_line",
    "uri": "scryfall_uri",
    "url": "scryfall_uri",
  };

  // do the same friendly thing, but for sorting options
  const order_mappings = {
    "price": "usd",
    "prices.eur": "eur",
    "prices.usd": "usd",
  };

  fields = fields.map(field => field_mappings[field] === undefined ? field : field_mappings[field]);
  order = order_mappings[order] === undefined ? order : order_mappings[order];

  // google script doesn't have URLSearchParams
  const scryfall_query = {
    q: query,
    order: order,
    dir: dir,
    unique: unique,
  };

  // query scryfall
  const cards = scryfallSearch_(scryfall_query, num_results);

  // when "*" is used, derive the field list from the first card's keys
  if (wildcard && cards.length > 0) {
    fields = Object.keys(cards[0]);
  }

  // now, let's accumulate the results
  let output = [];

  if (headers) {
    output.push(fields);
  }

  cards.splice(0, num_results).forEach(card => {
    let row = [];

    // there is probably a better way to handle card faces, but this is
    // probably sufficient for the vast majority of use cases
    if ("card_faces" in card) {
      Object.assign(card, card["card_faces"][0]);
    }

    // Modify the image field to return the URL directly, and use a helper script to evaluate it as a formula
    card["image"] = card["image_uris"] && card["image_uris"]["normal"] ? card["image_uris"]["normal"] : "";

    fields.forEach(field => {
      // grab the field from the card data
      let val = deepFind_(card, field);

      // stringify objects/arrays rather than returning [object Object]
      if (val !== null && val !== undefined && typeof val === "object") {
        val = JSON.stringify(val);
      } else if (val === null || val === undefined) {
        val = "";
      }

      // then, let's do some nice data massaging for use inside Sheets
      if (typeof val === "string") {
        val = val.replace(/\n/g, "\n\n");  // double space for readability
      } else if (Array.isArray(val)) {
        val = field.includes("color") ? val.join("") : val.join(", ");
      }

      row.push(val);
    });

    output.push(row);
  });

  return output;
};

const deepFind_ = (obj, path) => {
  return path.split(".").reduce((prev, curr) => prev && prev[curr], obj)
};


// paginated query of scryfall
const scryfallSearch_ = (params, num_results = MAX_RESULTS_) => {
  const query_string = Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&');
  const scryfall_url = `https://api.scryfall.com/cards/search?${query_string}`;

  let data = [];
  let page = 1;
  let response;

  // try to get the results from scryfall
  try {
    while (true) {
      let raw = UrlFetchApp.fetch(`${scryfall_url}&page=${page}`, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'GoogleSheetsScryfallScript/1.0',
          'Accept': 'application/json'
        }
      });
      // single retry on 429 to absorb edge-case parallel-call collisions
      if (raw.getResponseCode() === 429) {
        Utilities.sleep(1500 + Math.floor(Math.random() * 1000));
        raw = UrlFetchApp.fetch(`${scryfall_url}&page=${page}`, {
          muteHttpExceptions: true,
          headers: {
            'User-Agent': 'GoogleSheetsScryfallScript/1.0',
            'Accept': 'application/json'
          }
        });
      }
      if (raw.getResponseCode() !== 200) {
        throw new Error(`Scryfall returned ${raw.getResponseCode()}: ${raw.getContentText()}`);
      }
      response = JSON.parse(raw.getContentText());

      if (!response.data) {
        throw new Error("No results from Scryfall");
      }

      data.push(...response.data);

      if (!response.has_more || data.length > num_results) {
        break;
      }

      page++;
    }
  } catch (error) {
    throw new Error(`Unable to retrieve results from Scryfall: ${error}`);
  }

  return data;
};

/*******************************************************
 * Image Downloader for Google Sheets (Scryfall URLs)
 * - Installable on-edit trigger (created via setup())
 * - User configuration stored in Document Properties
 * - Multi-cell paste supported (processes all affected rows)
 *******************************************************/

/************ CONFIG STORAGE KEYS ************/
const CONFIG_KEYS = {
  SHEET_NAME: 'SHEET_NAME',
  URL_COLUMN_NUMBER: 'URL_COLUMN_NUMBER',
  FOLDER_ID: 'FOLDER_ID',
  HEADER_ROW: 'HEADER_ROW',
  IMAGE_NAME_COLUMN: 'IMAGE_NAME_COLUMN', // New key for image name column
  BATCH_QUERY_COLUMN: 'BATCH_QUERY_COLUMN',
  BATCH_OUTPUT_COLUMN: 'BATCH_OUTPUT_COLUMN',
  BATCH_FIELDS: 'BATCH_FIELDS',
  BATCH_WAIT_MIN_MS: 'BATCH_WAIT_MIN_MS',
  BATCH_WAIT_MAX_MS: 'BATCH_WAIT_MAX_MS'
};
/********************************************/

/**
 * Adds a custom menu whenever the spreadsheet is opened.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Image Downloader')
    .addItem('Setup (create trigger + configure)', 'setup')
    .addItem('Configure…', 'configure')
    .addSeparator()
    .addItem('Show current config', 'showConfig')
    .addSeparator()
    .addItem('Batch SCRYFALL → Configure batch…', 'configureBatch')
    .addItem('Batch SCRYFALL → Run batch now', 'runScryfallBatch')
    .addSeparator()
    .addItem('Remove trigger', 'removeTrigger')
    .addToUi();
}

/**
 * One-time setup:
 * 1) Prompts for config and saves it
 * 2) Creates an INSTALLABLE on-edit trigger bound to this spreadsheet
 */
function setup() {
  configure(); // prompt user and save config first

  // Remove existing triggers for the handler to avoid duplicates
  const handler = 'handleEdit';
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });

  // Create installable on-edit trigger (required for UrlFetchApp/DriveApp)
  ScriptApp.newTrigger(handler)
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Setup complete: configuration saved and installable on-edit trigger created.'
  );
}

/**
 * Removes the installable trigger for handleEdit (if present).
 */
function removeTrigger() {
  const handler = 'handleEdit';
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  SpreadsheetApp.getActiveSpreadsheet().toast(
    removed ? `Removed ${removed} trigger(s).` : 'No triggers found to remove.'
  );
}

/**
 * Prompt-driven wizard to collect config and store it in Document Properties.
 */
function configure() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();

  // Existing values (as defaults)
  const current = getConfig_({ allowMissing: true });

  const sheetName = promptRequired_(
    ui,
    'Sheet name',
    'Enter the exact sheet/tab name to watch.',
    current.SHEET_NAME || 'Sheet1'
  );

  const urlCol = promptInt_(
    ui,
    'URL column number',
    'Enter the column NUMBER containing image URLs (A=1, B=2, ...).',
    current.URL_COLUMN_NUMBER || 1,
    1,
    1000
  );

  const folderId = promptRequired_(
    ui,
    'Drive folder ID',
    'Paste the Google Drive folder ID where images will be saved.',
    current.FOLDER_ID || ''
  );

  const headerRow = promptInt_(
    ui,
    'Header row',
    'Enter the header row number (rows at or above this are ignored). Use 0 for none.',
    Number.isFinite(current.HEADER_ROW) ? current.HEADER_ROW : 1,
    0,
    1000
  );

  const imageNameCol = promptInt_(
    ui,
    'Image Name Column',
    'Enter the column NUMBER to use for image names (A=1, B=2, ...). Use 0 to disable.',
    Number.isFinite(current.IMAGE_NAME_COLUMN) ? current.IMAGE_NAME_COLUMN : 0,
    0,
    1000
  );

  // Persist config for this spreadsheet
  props.setProperties(
    {
      [CONFIG_KEYS.SHEET_NAME]: sheetName,
      [CONFIG_KEYS.URL_COLUMN_NUMBER]: String(urlCol),
      [CONFIG_KEYS.FOLDER_ID]: folderId,
      [CONFIG_KEYS.HEADER_ROW]: String(headerRow),
      [CONFIG_KEYS.IMAGE_NAME_COLUMN]: String(imageNameCol),
    },
    true
  );

  ui.alert('Saved', 'Configuration saved successfully.', ui.ButtonSet.OK);
}

/**
 * Convenience menu item to display current config.
 */
function showConfig() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getConfig_({ allowMissing: true });

  ui.alert(
    'Current config',
    `SHEET_NAME: ${cfg.SHEET_NAME || '(not set)'}\n` +
      `URL_COLUMN_NUMBER: ${Number.isFinite(cfg.URL_COLUMN_NUMBER) ? cfg.URL_COLUMN_NUMBER : '(not set)'}\n` +
      `FOLDER_ID: ${cfg.FOLDER_ID ? cfg.FOLDER_ID : '(not set)'}\n` +
      `HEADER_ROW: ${Number.isFinite(cfg.HEADER_ROW) ? cfg.HEADER_ROW : '(not set)'}\n` +
      `IMAGE_NAME_COLUMN: ${Number.isFinite(cfg.IMAGE_NAME_COLUMN) ? cfg.IMAGE_NAME_COLUMN : '(not set)'}`,
    ui.ButtonSet.OK
  );
}

/**
 * INSTALLABLE trigger handler (created by setup()).
 * Supports multi-cell paste: processes every affected row within the pasted block,
 * but only if the pasted block includes the configured URL column.
 */
function handleEdit(e) {
  if (!e || !e.range) return;

  const cfg = getConfig_(); // throws if missing
  const sheet = e.range.getSheet();
  if (sheet.getName() !== cfg.SHEET_NAME) return;

  const editedRange = e.range;

  // Ignore header row(s)
  const r1 = editedRange.getRow();
  const r2 = r1 + editedRange.getNumRows() - 1;
  if (r2 <= cfg.HEADER_ROW) return;

  // Only act if the pasted/edited block includes the URL column
  const c1 = editedRange.getColumn();
  const c2 = c1 + editedRange.getNumColumns() - 1;
  const urlCol = cfg.URL_COLUMN_NUMBER;
  if (urlCol < c1 || urlCol > c2) return;

  const startRow = Math.max(r1, cfg.HEADER_ROW + 1);

  for (let row = startRow; row <= r2; row++) {
    const url = String(sheet.getRange(row, urlCol).getDisplayValue() || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;

    // Download and save
    downloadSingleImage_(url, row, cfg.FOLDER_ID, cfg.IMAGE_NAME_COLUMN);
  }
}

/**
 * Downloads one image and saves it to Drive folder.
 */
function downloadSingleImage_(url, rowNumber, folderId, imageNameCol) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
    });

    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log(`Row ${rowNumber}: HTTP ${code} for ${url}`);
      return;
    }

    const blob = resp.getBlob();
    const contentType = (blob.getContentType() || '').toLowerCase();

    let fileName;
    if (imageNameCol > 0) {
      const nameFromCol = String(
        SpreadsheetApp.getActiveSpreadsheet()
          .getActiveSheet()
          .getRange(rowNumber, imageNameCol)
          .getDisplayValue()
      ).trim();

      fileName = nameFromCol
        ? `${nameFromCol.replace(/[^\w.\-]+/g, '_')}.${contentTypeToExt_(contentType)}`
        : buildFileName_(url, rowNumber, contentType);
    } else {
      fileName = buildFileName_(url, rowNumber, contentType);
    }

    DriveApp.getFolderById(folderId).createFile(blob.setName(fileName));

    Logger.log(`Row ${rowNumber}: downloaded ${fileName}`);
  } catch (err) {
    Logger.log(`Row ${rowNumber}: error downloading ${url} - ${err.message}`);
  }
}

function buildFileName_(url, rowNumber, contentType) {
  // Strip querystring for naming
  const cleanUrl = url.split('?')[0];

  let base = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1) || `image_row_${rowNumber}`;
  base = base.replace(/[^\w.\-]+/g, '_');

  // Ensure extension exists if possible
  if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(base)) {
    base += '.' + contentTypeToExt_(contentType);
  }

  return base;
}

function contentTypeToExt_(contentType) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

/************ Helpers ************/
function getConfig_(opts) {
  const allowMissing = !!(opts && opts.allowMissing);
  const props = PropertiesService.getDocumentProperties();

  const SHEET_NAME = props.getProperty(CONFIG_KEYS.SHEET_NAME);
  const URL_COLUMN_NUMBER = parseInt(props.getProperty(CONFIG_KEYS.URL_COLUMN_NUMBER), 10);
  const FOLDER_ID = props.getProperty(CONFIG_KEYS.FOLDER_ID);
  const HEADER_ROW = parseInt(props.getProperty(CONFIG_KEYS.HEADER_ROW), 10);
  const IMAGE_NAME_COLUMN = parseInt(props.getProperty(CONFIG_KEYS.IMAGE_NAME_COLUMN), 10);

  if (!allowMissing) {
    const missing = [];
    if (!SHEET_NAME) missing.push('SHEET_NAME');
    if (!Number.isFinite(URL_COLUMN_NUMBER)) missing.push('URL_COLUMN_NUMBER');
    if (!FOLDER_ID) missing.push('FOLDER_ID');
    if (!Number.isFinite(HEADER_ROW)) missing.push('HEADER_ROW');

    if (missing.length) {
      throw new Error(
        `Missing config: ${missing.join(', ')}. Use Image Downloader → Configure… or Setup.`
      );
    }
  }

  return { SHEET_NAME, URL_COLUMN_NUMBER, FOLDER_ID, HEADER_ROW, IMAGE_NAME_COLUMN };
}

function promptRequired_(ui, title, message, defaultValue) {
  const resp = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) throw new Error('User cancelled setup.');

  const value = (resp.getResponseText() || defaultValue || '').trim();
  if (!value) throw new Error(`${title} is required.`);

  return value;
}

function promptInt_(ui, title, message, defaultValue, min, max) {
  const resp = ui.prompt(title, `${message}\n\nDefault: ${defaultValue}`, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) throw new Error('User cancelled setup.');

  const raw = (resp.getResponseText() || '').trim();
  const value = raw ? parseInt(raw, 10) : parseInt(defaultValue, 10);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${title} must be an integer between ${min} and ${max}.`);
  }

  return value;
}

// Add a helper function to evaluate the IMAGE formulas after the SCRYFALL function runs
function evaluateImageFormulas() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getDataRange(); // Adjust this range to target the specific cells with the image URLs
  const values = range.getValues();

  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      const cellValue = values[row][col];
      Logger.log(`Checking cell at row ${row + 1}, column ${col + 1}: ${cellValue}`);
      if (typeof cellValue === "string" && cellValue.startsWith("http")) {
        // Set the formula in the cell
        sheet.getRange(row + 1, col + 1).setFormula(`=IMAGE("${cellValue}", 4, 340, 244)`);
      }
    }
  }
}

/**
 * Returns a single row listing every field name available from a Scryfall card result.
 * Useful as a header row placed above a SCRYFALL() result block, or to discover what fields exist.
 *
 * @param {"Lightning Bolt"}  query  Any valid Scryfall search query (only the first result is used)
 * @return                           Single row of field names
 * @customfunction
 */
const SCRYFALL_FIELDS = (query) => {
  if (query === undefined) {
    throw new Error("Must include a query");
  }

  const scryfall_query = { q: query, unique: "cards" };
  const cards = scryfallSearch_(scryfall_query, 1);

  if (!cards.length) {
    throw new Error("No results found for that query");
  }

  return [Object.keys(cards[0])];
};

/*******************************************************
 * Batch SCRYFALL — sequential, rate-limit-safe processor
 *
 * Custom functions run in parallel and cannot share state, so
 * =SCRYFALL() in 500 cells will trigger 429 errors. This menu-driven
 * batch runs in a single execution with full service access and
 * sleeps a random 110–350 ms between requests by default.
 *******************************************************/

function configureBatch() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getDocumentProperties();
  const current = getBatchConfig_({ allowMissing: true });

  const queryCol = promptInt_(
    ui,
    'Batch query column',
    'Column NUMBER containing the card name / Scryfall query per row (A=1, B=2, ...).',
    Number.isFinite(current.BATCH_QUERY_COLUMN) ? current.BATCH_QUERY_COLUMN : 1,
    1,
    1000
  );

  const outCol = promptInt_(
    ui,
    'Batch output column',
    'Column NUMBER where results start. Result fields are written rightward from this column.',
    Number.isFinite(current.BATCH_OUTPUT_COLUMN) ? current.BATCH_OUTPUT_COLUMN : 2,
    1,
    1000
  );

  const fields = promptRequired_(
    ui,
    'Batch fields',
    'Space- or comma-separated Scryfall field names (e.g. "name image_uris.large prices.usd").',
    current.BATCH_FIELDS || 'name image_uris.large'
  );

  const minMs = promptInt_(
    ui,
    'Min wait (ms)',
    'Minimum milliseconds to sleep between requests. Scryfall asks for ~100 ms minimum.',
    Number.isFinite(current.BATCH_WAIT_MIN_MS) ? current.BATCH_WAIT_MIN_MS : 110,
    50,
    60000
  );

  const maxMs = promptInt_(
    ui,
    'Max wait (ms)',
    'Maximum milliseconds to sleep between requests. Must be >= min.',
    Number.isFinite(current.BATCH_WAIT_MAX_MS) ? current.BATCH_WAIT_MAX_MS : 350,
    minMs,
    60000
  );

  props.setProperties(
    {
      [CONFIG_KEYS.BATCH_QUERY_COLUMN]: String(queryCol),
      [CONFIG_KEYS.BATCH_OUTPUT_COLUMN]: String(outCol),
      [CONFIG_KEYS.BATCH_FIELDS]: fields,
      [CONFIG_KEYS.BATCH_WAIT_MIN_MS]: String(minMs),
      [CONFIG_KEYS.BATCH_WAIT_MAX_MS]: String(maxMs),
    },
    false
  );

  ui.alert('Saved', 'Batch configuration saved.', ui.ButtonSet.OK);
}

function getBatchConfig_(opts) {
  const allowMissing = !!(opts && opts.allowMissing);
  const props = PropertiesService.getDocumentProperties();

  const BATCH_QUERY_COLUMN = parseInt(props.getProperty(CONFIG_KEYS.BATCH_QUERY_COLUMN), 10);
  const BATCH_OUTPUT_COLUMN = parseInt(props.getProperty(CONFIG_KEYS.BATCH_OUTPUT_COLUMN), 10);
  const BATCH_FIELDS = props.getProperty(CONFIG_KEYS.BATCH_FIELDS);
  const BATCH_WAIT_MIN_MS = parseInt(props.getProperty(CONFIG_KEYS.BATCH_WAIT_MIN_MS), 10);
  const BATCH_WAIT_MAX_MS = parseInt(props.getProperty(CONFIG_KEYS.BATCH_WAIT_MAX_MS), 10);

  if (!allowMissing) {
    const missing = [];
    if (!Number.isFinite(BATCH_QUERY_COLUMN)) missing.push('BATCH_QUERY_COLUMN');
    if (!Number.isFinite(BATCH_OUTPUT_COLUMN)) missing.push('BATCH_OUTPUT_COLUMN');
    if (!BATCH_FIELDS) missing.push('BATCH_FIELDS');
    if (!Number.isFinite(BATCH_WAIT_MIN_MS)) missing.push('BATCH_WAIT_MIN_MS');
    if (!Number.isFinite(BATCH_WAIT_MAX_MS)) missing.push('BATCH_WAIT_MAX_MS');
    if (missing.length) {
      throw new Error(
        `Missing batch config: ${missing.join(', ')}. Use Image Downloader → Batch SCRYFALL → Configure batch…`
      );
    }
  }

  return { BATCH_QUERY_COLUMN, BATCH_OUTPUT_COLUMN, BATCH_FIELDS, BATCH_WAIT_MIN_MS, BATCH_WAIT_MAX_MS };
}

function scryfallSearchWithRetry_(params, num_results) {
  let attempt = 0;
  while (true) {
    try {
      return scryfallSearch_(params, num_results);
    } catch (err) {
      const msg = String(err && err.message || err);
      const is429 = msg.indexOf('Scryfall returned 429') !== -1;
      if (is429 && attempt < 3) {
        attempt++;
        Utilities.sleep(60000 + Math.floor(Math.random() * 15000));
        continue;
      }
      throw err;
    }
  }
}

const BATCH_FIELD_MAPPINGS_ = {
  "color": "color_identity",
  "colors": "color_identity",
  "flavor": "flavor_text",
  "mana": "mana_cost",
  "o": "oracle_text",
  "oracle": "oracle_text",
  "price": "prices.usd",
  "type": "type_line",
  "uri": "scryfall_uri",
  "url": "scryfall_uri",
};

function batchFormatCard_(card, fields) {
  if ("card_faces" in card) {
    Object.assign(card, card["card_faces"][0]);
  }
  card["image"] = card["image_uris"] && card["image_uris"]["normal"] ? card["image_uris"]["normal"] : "";

  return fields.map(field => {
    let val = deepFind_(card, field);
    if (val !== null && val !== undefined && typeof val === "object") {
      val = JSON.stringify(val);
    } else if (val === null || val === undefined) {
      val = "";
    }
    if (typeof val === "string") {
      val = val.replace(/\n/g, "\n\n");
    } else if (Array.isArray(val)) {
      val = field.includes("color") ? val.join("") : val.join(", ");
    }
    return val;
  });
}

function runScryfallBatch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const baseCfg = getConfig_({ allowMissing: true });
  const cfg = getBatchConfig_();

  const sheet = baseCfg.SHEET_NAME
    ? ss.getSheetByName(baseCfg.SHEET_NAME) || ss.getActiveSheet()
    : ss.getActiveSheet();

  const headerRow = Number.isFinite(baseCfg.HEADER_ROW) ? baseCfg.HEADER_ROW : 1;
  const fields = cfg.BATCH_FIELDS.split(/[\s,]+/).filter(Boolean)
    .map(f => BATCH_FIELD_MAPPINGS_[f] === undefined ? f : BATCH_FIELD_MAPPINGS_[f]);

  // find last row in the query column
  const lastRow = sheet.getLastRow();
  const startRow = headerRow + 1;
  if (lastRow < startRow) {
    ui.alert('Nothing to do', `No data rows below header row ${headerRow}.`, ui.ButtonSet.OK);
    return;
  }

  const queryRange = sheet.getRange(startRow, cfg.BATCH_QUERY_COLUMN, lastRow - startRow + 1, 1);
  const queries = queryRange.getValues();

  let processed = 0;
  let skipped = 0;
  const total = queries.length;

  for (let i = 0; i < total; i++) {
    const row = startRow + i;
    const query = String(queries[i][0] || '').trim();
    if (!query) {
      skipped++;
      continue;
    }

    let cards;
    try {
      cards = scryfallSearchWithRetry_({ q: query, unique: 'cards' }, 1);
    } catch (err) {
      sheet.getRange(row, cfg.BATCH_OUTPUT_COLUMN).setValue(`ERROR: ${err.message || err}`);
      skipped++;
      // still pause so we don't tight-loop on a failing API
      Utilities.sleep(cfg.BATCH_WAIT_MIN_MS + Math.floor(Math.random() * (cfg.BATCH_WAIT_MAX_MS - cfg.BATCH_WAIT_MIN_MS + 1)));
      continue;
    }

    if (!cards.length) {
      sheet.getRange(row, cfg.BATCH_OUTPUT_COLUMN).setValue('No results');
      skipped++;
    } else {
      const rowVals = batchFormatCard_(cards[0], fields);
      sheet.getRange(row, cfg.BATCH_OUTPUT_COLUMN, 1, rowVals.length).setValues([rowVals]);
      processed++;
    }

    if ((i + 1) % 25 === 0) {
      ss.toast(`Processed ${i + 1} / ${total} rows…`, 'Batch SCRYFALL');
    }

    Utilities.sleep(cfg.BATCH_WAIT_MIN_MS + Math.floor(Math.random() * (cfg.BATCH_WAIT_MAX_MS - cfg.BATCH_WAIT_MIN_MS + 1)));
  }

  ss.toast(`Batch complete: ${processed} processed, ${skipped} skipped`, 'Batch SCRYFALL', 10);
}

// eof
