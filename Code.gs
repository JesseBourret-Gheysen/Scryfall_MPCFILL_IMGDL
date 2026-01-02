// // this function is available here:
// // https://github.com/scryfall/google-sheets/blob/main/scryfall-google-sheets.js
// // and was last updated on 2021-01-08 (probably)

// const MAX_RESULTS_ = 700;  // a safe max due to Google Sheets timeout system

// /**
//  * Inserts the results of a search in Scryfall into your spreadsheet
//  *
//  * @param {"name:braids type:legendary"}  query       Scryfall search query
//  * @param {"name power toughness"}        fields      List of fields to return from Scryfall, "name" is default
//  * @param {150}                           num_results Number of results (default 150, maximum 700)
//  * @param {name}                          order       The order to sort cards by, "name" is default
//  * @param {auto}                          dir         Direction to return the sorted cards: auto, asc, or desc 
//  * @param {cards}                         unique      Remove duplicate cards (default), art, or prints
//  * @return                                List of Scryfall search results
//  * @customfunction
//  */
// const SCRYFALL = (query, fields = "name", num_results = 150,
//                   order = "name", dir = "auto", unique = "cards") => {
//   if (query === undefined) { 
//     throw new Error("Must include a query");
//   }

//   // don't break scryfall
//   if (num_results > MAX_RESULTS_) {
//     num_results = MAX_RESULTS_;
//   }

//   // the docs say fields is space separated, but allow comma separated too
//   fields = fields.split(/[\s,]+/);

//   // most people won't know the JSON field names for cards, so let's do some mapping of
//   // what they'll try to what it should be
//   const field_mappings = {
//     "color": "color_identity",
//     "colors": "color_identity",
//     "flavor": "flavor_text",
//     "mana": "mana_cost",
//     "o": "oracle_text",
//     "oracle": "oracle_text",
//     "price": "prices.usd",
//     "type": "type_line",
//     "uri": "scryfall_uri",
//     "url": "scryfall_uri",
//   }

//   // do the same friendly thing, but for sorting options
//   const order_mappings = {
//     "price": "usd",
//     "prices.eur": "eur",
//     "prices.usd": "usd",
//   };

//   fields = fields.map(field => field_mappings[field] === undefined ? field : field_mappings[field]);
//   order = order_mappings[order] === undefined ? order : order_mappings[order];

//   // google script doesn't have URLSearchParams
//   const scryfall_query = {
//     q: query,
//     order: order,
//     dir: dir,
//     unique: unique,
//   };

//   // query scryfall
//   const cards = scryfallSearch_(scryfall_query, num_results);

//   // now, let's accumulate the results
//   let output = [];

//   cards.splice(0, num_results).forEach(card => {
//     let row = [];

//     // there is probably a better way to handle card faces, but this is
//     // probably sufficient for the vast majority of use cases
//     if ("card_faces" in card) {
//       Object.assign(card, card["card_faces"][0]);
//     }

//     // a little hack to make images return an image function; note that Google
//     // sheets doesn't currently execute it or anything
//     card["image"] = `=IMAGE("${card["image_uris"]["normal"]}", 4, 340, 244)`;

//     fields.forEach(field => {
//       // grab the field from the card data
//       let val = deepFind_(card, field) || "";

//       // then, let's do some nice data massaging for use inside Sheets
//       if (typeof val === "string") {
//         val = val.replace(/\n/g, "\n\n");  // double space for readability
//       } else if (Array.isArray(val)) {
//         val = field.includes("color") ? val.join("") : val.join(", ");
//       }

//       row.push(val);
//     });

//     output.push(row);
//   });

//   return output;
// };

// const deepFind_ = (obj, path) => {
//   return path.split(".").reduce((prev, curr) => prev && prev[curr], obj)
// };


// // paginated query of scryfall
// const scryfallSearch_ = (params, num_results = MAX_RESULTS_) => {
//   const query_string = Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&');
//   const scryfall_url = `https://api.scryfall.com/cards/search?${query_string}`;

//   let data = [];
//   let page = 1;
//   let response;

//   // try to get the results from scryfall
//   try {
//     while (true) {
//       response = JSON.parse(UrlFetchApp.fetch(`${scryfall_url}&page=${page}`).getContentText());

//       if (!response.data) {
//         throw new Error("No results from Scryfall");
//       }

//       data.push(...response.data);

//       if (!response.has_more || data.length > num_results) {
//         break;
//       }

//       page++;
//     }
//   } catch (error) {
//     throw new Error(`Unable to retrieve results from Scryfall: ${error}`);
//   }

//   return data;
// };

//-------------------------------------------------------
//-----------Create Local Triggers for DL ops------------
//-------------------------------------------------------
function setup() {
  // Remove any existing triggers for this function to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'handleEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Create installable on-edit trigger
  ScriptApp.newTrigger('handleEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  SpreadsheetApp.getActiveSpreadsheet().toast('Setup complete: On-edit trigger created.');
}


//-------------------------------------------------------
//------------------IMAGE DOWNLOADING SECTION------------
//-------------------------------------------------------
/************ CONFIG ************/
const SHEET_NAME = 'TestSheet';        // exact sheet name
const URL_COLUMN_NUMBER = 10;        // Column number in the sheet (A=1, B=2, etc.)
const FOLDER_ID = '18isDGcHPqgrZKkUu4rqCcmTpBbU8jicS'; // Google Drive folder ID
const HEADER_ROW = 1;               // Header row index
/********************************/

/**
 * Fires automatically when the sheet is edited.
 * Runs ONLY when the target column is edited on the target sheet.
 */
// //------THIS IS ONLY FOR SINGLE CELL EDITS< MAKING A COLUMN EDIT VERSION
// function handleEdit(e) {
//   Logger.log('onEdit fired');

//   const sheet = e.range.getSheet();
//   if (sheet.getName() !== SHEET_NAME) return;
//   Logger.log(`onEdit got sheet name ${sheet}`);

//   // Ignore header row
//   if (e.range.getRow() <= HEADER_ROW) return;
//   Logger.log(`onEdit got row num ${e.range.getRow()}`);

//   // Ignore edits outside the URL column
//   if (e.range.getColumn() !== URL_COLUMN_NUMBER) return;
//   Logger.log(`onEdit - edit was in the url column`);

//   // const url = String(e.value || '').trim(); //this wasn't showing the live value from scryfall()
//   const url = String(e.range.getSheet().getRange(e.range.getRow(), URL_COLUMN_NUMBER).getDisplayValue() || '').trim();
//   Logger.log(
//     `Sheet: ${e.range.getSheet().getName()}, Row: ${e.range.getRow()}, Col: ${e.range.getColumn()}, ` +
//     `EditedDisplay: ${e.range.getDisplayValue()}, TargetUrlDisplay: ${url}`
//   );

//   if (!/^https?:\/\//i.test(url)) return;
//   Logger.log('onEdit fired: Checks Passed, Calling downloadSingleImage_()');
//   downloadSingleImage_(url, e.range.getRow());
// }

// -- COLUMN EDIT VERSION OF DOWNLOAD TRIGGER:
function handleEdit(e) {
  if (!e || !e.range) return;
  Logger.log(`Passed the range check`);

  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  Logger.log(`Passed the sheetName check`);

  const editedRange = e.range;

  // Determine overlap between the edited range and the URL column
  const urlCol = URL_COLUMN_NUMBER; // A=1, B=2, ...
  const r1 = editedRange.getRow();
  const r2 = r1 + editedRange.getNumRows() - 1;
  const c1 = editedRange.getColumn();
  const c2 = c1 + editedRange.getNumColumns() - 1;

  // If the pasted block does not include the URL column, do nothing
  if (urlCol < c1 || urlCol > c2) return;
  Logger.log(`Passed the correctColumn check`);

  // Ignore header row(s)
  const startRow = Math.max(r1, HEADER_ROW + 1);

  // Loop each affected row in the pasted block
  for (let row = startRow; row <= r2; row++) {
    Logger.log(`In the loop, about to dl row ${row}`);
    const url = String(sheet.getRange(row, urlCol).getDisplayValue() || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;

    Logger.log(`Downloading row ${row}: ${url}`);
    downloadSingleImage_(url, row);
  }
}


function onEdit(e) {
  //intentionally empty
}

/**
 * Downloads one image and saves it to Drive
 */
function downloadSingleImage_(url, rowNumber) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
    });

    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log(`Row ${rowNumber}: HTTP ${code}`);
      return;
    }

    const blob = resp.getBlob();
    const contentType = (blob.getContentType() || '').toLowerCase();
    // ----- Naming the Files based on the card name
    const nameFromColB = String(
      SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName(SHEET_NAME)
        .getRange(rowNumber, 2)   // 2 = column B (A=1, B=2, etc.)
        .getDisplayValue()
      ).trim();

    const fileName = nameFromColB
      ? `${nameFromColB.replace(/[^\w.\-]+/g, '_')}.${contentTypeToExt_(contentType)}`
      : buildFileName_(url, rowNumber, contentType);


    DriveApp.getFolderById(FOLDER_ID)
      .createFile(blob.setName(fileName));

    Logger.log(`Row ${rowNumber}: downloaded ${fileName}`);
  } catch (err) {
    Logger.log(`Row ${rowNumber}: ${err.message}`);
  }
}

function buildFileName_(url, rowNumber, contentType) {
  const cleanUrl = url.split('?')[0];
  let base = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1)
           || `image_row_${rowNumber}`;

  base = base.replace(/[^\w.\-]+/g, '_');

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
