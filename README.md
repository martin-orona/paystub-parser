Why does this tool exist?
> I needed to gather data from several of my paystubs. Doing it manually is tedious. I have had to do it multiple times already, and will probably have to do it again multiple times. So I wrote a utility app to do it for me.

**Note:** I made wrote this tool by hand, and then created [paystub-parser-ai-vibe-coding](https://github.com/martin-orona/paystub-parser-ai-vibe-coding) to experiment with Vibe Coding.  
The output I tested, the Excel version, is the same. That repo has some test case scenario fixtures because consistent automated testing is more vital when I'm not looking at the data in the debugger as I code like I did on this repo.  
**Note:** [paystub-parser-ai-vibe-coding](https://github.com/martin-orona/paystub-parser-ai-vibe-coding) has a few lessons learned from using AI. Super short summary: AI doesn't readily write human-maintainble production quality code and it can take longer to generate software via an AI than by a human hand.

**Note:** Neither repo is shipping quality because I don't need production reliability in a personal use tool.

**Note:** [PATCHES.md](PATCHES.md) is needed because the PDF parsing library I used, `pdf-parse`, has a bug in my execution environment.

## Quick Start

- Extract pay data to Excel:
  ```bash
  npm run dev -- --file "data/paystubs/Pay-Statement.PDF" --output:excel --output:file output.xlsx
  ```
- Extract pay data to CSV file:
  ```bash
  npm run dev -- --file "data/paystubs/Pay-Statement.PDF" --output:csv --output:file output.csv
  ```
- Parse multiple files and output to Excel:
  ```bash
  npm run dev -- --file \
    "data/paystubs/20250703-Pay-Statement.PDF" \
    "data/paystubs/20250815-Pay-Statement.PDF" \
    --output:excel --output:file output.xlsx
  ```
- Parse a file and print formatted tables to console:
  ```bash
  npm run dev -- --file "data/paystubs/Pay-Statement.PDF" \
    --output:unprocessed_table_text_padded --output:console
  ```
- Generate a PII-safe test fixture:
  ```bash
  npm run dev -- --test:fixtures:generate --test:fixtures:scrub_pii_source "data/paystubs/pii-removal.xlsx" --file "data/paystubs/20250815*.PDF"
  ```

## CLI Parameters

### Full list of supported CLI parameters

To get a full list of the supported CLI parameters:
```
npm run dev -- --help
```

### Frequently used CLI parameters

Here are some of the commonly useful parameters.

* `--file <files...>` - Specific file(s) to parse (absolute path, relative to CWD, or relative to `--directory`)
* `-d, --directory <path>` - Directory containing paystub PDF files (optional if `--file` is a full/relative path)
* `--file-pattern <regex>` - Regex pattern to filter files
* `--file-pattern-flags <flags>` - Regex flags (e.g., "i", "im")
* `--pay-data:regex-parsing-rules <path>` - JSON file with regex parsing rules. This allows for extracting different data without having to modify code. The default value is 'src/regex.rules.json'
* `--output:file <path>` - Output file path/name for raw or structured data
* `--output:console` - Output raw parsed PDF text or raw PDF object to console instead of file

## Test Fixture Generation

Generate complete test fixtures (raw PDF JSON, table text, and PII-scrubbed versions) in one command:

```bash
npm run dev -- --file "data/paystubs/20Pay-Statement.PDF" \
  --test:fixtures:generate \
  --test:fixtures:scrub_pii_source "data/paystubs/pii-removal.xlsx"
```

This will:
1. Extract raw PDF data to `fixtures/paystub_YYYYMMDD.json` (check date determines filename)
2. Generate table text to `fixtures/paystub_YYYYMMDD_tables.txt`
3. Scrub PII from both files using the provided Excel mapping
4. Auto-generate `fixtures/paystub_YYYYMMDD.simplified.json`

**Equivalent individual steps:**
```bash
# Step 1: Extract raw PDF JSON
npm run dev -- --file "data/paystubs/Pay-Statement.PDF" \
  --output:raw_pdf --output:file "fixtures/paystub_20250815.json"

# Step 2: Generate table text from JSON
npm run dev -- --input:raw_pdf "fixtures/paystub_20250815.json" \
  --output:unprocessed_table_text --output:file "fixtures/paystub_20250815_tables.txt"

# Step 3: Scrub PII from JSON
npm run dev -- --test:fixtures:scrub_pii \
  --test:fixtures:scrub_pii_source "data/paystubs/pii-removal.xlsx" \
  --test:fixtures:scrub_pii_paystub "Pay-Statement.PDF" \
  --test:fixtures:scrub_pii_target "fixtures/paystub_20250815.json"

# Step 4: Scrub PII from table text
npm run dev -- --test:fixtures:scrub_pii \
  --test:fixtures:scrub_pii_source "data/paystubs/pii-removal.xlsx" \
  --test:fixtures:scrub_pii_paystub "Pay-Statement.PDF" \
  --test:fixtures:scrub_pii_target "fixtures/paystub_20250815_tables.txt"
```

**Output consistency guarantee:** Both the all-in-one `--test:fixtures:generate` command and the individual steps use the same underlying `processRawPdfPages()` function, ensuring identical table text output.

**PII Mapping Excel Format:**
The Excel file should have this structure:
- **Columns A-M**: Source data (original values from PDF)
- **Columns N-Z**: Scrubbed data (replacement values)
- Each paystub section starts with a "Paystub File" header row
- System automatically detects field labels and table contexts for context-aware replacement

See `PII_SCRUBBING_GUIDE.md` for complete Excel format specification and examples.

## CLI usage note

- `--directory` is optional when `--file` includes a resolvable path (absolute or relative to the current working directory). For batch processing (multiple files and patterns), provide `--directory`.
- `--file` accepts multiple files: `--file file1.pdf file2.pdf file3.pdf`

## Debugger/runtime PDF loading fix

When running under tsx/VS Code debugging, `pdf-parse` may internally resolve a browser build of `pdfjs-dist`, which expects DOM APIs and can throw errors like:

- `DOMMatrix is not defined`
- `process.getBuiltinModule is not a function` (from ESM paths such as `pdfjs-dist/legacy/build/pdf.mjs`)

To make PDF text extraction stable in all environments without adding dependencies or changing the build, we apply two minimal safeguards in `src/parser.ts`:

1) Prefer the Node/CommonJS path for `pdf-parse` by using `require('pdf-parse')` instead of dynamic `import()`.
2) Provide a tiny no-op `DOMMatrix` stub only if it’s missing. This prevents crashes if a browser-oriented path is accidentally chosen at runtime in a debugger.

Excerpt (inside `loadPdfContent`):

```ts
// Provide a minimal DOMMatrix stub for debug environments that pull a browser path
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
	(globalThis as any).DOMMatrix = class {
		constructor(..._args: any[]) {}
	};
}

// Load pdf-parse via CommonJS require to prefer its Node path
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfCjs: any = require('pdf-parse');
const PDFParseCtor = pdfCjs.PDFParse || pdfCjs.default || pdfCjs;
const parser = new PDFParseCtor(new Uint8Array(dataBuffer));
```

Notes:
- You might see warnings like: `Warning: UnknownErrorException: Ensure that the standardFontDataUrl API parameter is provided.` These are emitted by `pdfjs-dist` and are benign for text extraction.
- Avoid requiring unexported subpaths like `pdf-parse/node/cjs`—they’re not part of the package exports and can trigger `ERR_PACKAGE_PATH_NOT_EXPORTED`.

This approach keeps changes minimal and contained to `src/parser.ts`, ensuring PDF text extraction works reliably during development and debugging.

## PDF.js Legacy Build & Font Warning Fix (2025-11)

- The parser now **only uses the legacy pdfjs-dist build** (`pdfjs-dist/legacy/build/pdf.js`) for all PDF parsing. This eliminates the warning:
  > Please use the `legacy` build in Node.js environments.
- The `standardFontDataUrl` is set **only** on the legacy build's `GlobalWorkerOptions`.
- The default (non-legacy) pdfjs-dist entry is never required, so no legacy warning is triggered.
- A suppression wrapper is in place to filter out any remaining `standardFontDataUrl` or legacy build warnings from pdf.js, ensuring a clean console for users.
- These changes are implemented in both `src/parser.ts` and the CLI's raw PDF path in `src/index.ts`.

**User impact:**
- Users will no longer see font or legacy build warnings when running the CLI, regardless of environment (Node, tsx, VS Code debug, etc).
- No CLI flags are needed for this behavior; it is always on.
- All PDF parsing and extraction features remain unchanged and stable.

## Text item delimiter

PDF text content is composed of many small text items that can be positioned close together. By default, extracting text can produce squashed output like "GrossPay1234.56" where separate items run together.

To make parsing and debugging easier, we configure pdf-parse to insert a visible delimiter between each text item:

```ts
const textResult = await parser.getText({
    itemJoiner: ' | ',
});
```

This produces output like: "GrossPay | 1234.56", making it clear where individual PDF text elements begin and end.

- The delimiter is currently hardcoded as `' | '` in `src/parser.ts`.
- This applies to all text extraction and helps identify field boundaries during parsing development.
- pdf-parse's `lineEnforce` (enabled by default) still inserts newlines when vertical spacing indicates a new line.

## Horizontal line detection

Many paystubs use horizontal rules (lines) to visually separate data tables and sections. To make these structural boundaries visible in extracted text, we detect horizontal lines from the PDF's drawing operations and insert markers in the output.

The extraction process:
1. For each page, retrieve both text content (with positions) and the operator list (drawing commands)
2. Scan operator arguments for patterns matching thin horizontal rectangles or horizontal line segments
3. Sort detected lines by Y position and merge lines within 2 pixels of each other
4. Insert `[═══ HORIZONTAL LINE ═══]` markers at the appropriate vertical positions in the text output

Example output:
```
 | Check Date |   | Voucher Number
[═══ HORIZONTAL LINE ═══]
 | July 3, 2025 |   | 88888
[═══ HORIZONTAL LINE ═══]
Direct Deposits |   | Type |   | Account |   | Amount
[═══ HORIZONTAL LINE ═══]
```

Detection criteria:
- Rectangles with `height < 5` and `width > 50` (thin horizontal bars)
- Line segments where Y positions match (within 1 pixel) and X span > 50

This makes table boundaries explicit in the text, simplifying regex or position-based parsing logic.

## Output Data Sorting

When processing multiple paystubs, the extracted data is automatically sorted before being written to any output format (CSV, JSON, or Excel):

- **Primary sort**: Check Date (descending) - most recent paystubs appear first
- **Secondary sort**: Check Number (descending) - when dates are equal, higher check numbers appear first

This sorting applies uniformly across all output formats, ensuring consistent ordering whether you're generating CSV files, JSON output, or Excel spreadsheets.

## Table Text Output Modes

The parser provides two modes for outputting extracted table text:

### `--output:unprocessed_table_text`
Outputs pipe-delimited tables with minimal formatting:
- Columns separated by ` | ` (space-pipe-space)
- No padding or alignment
- Header/footer separator lines (`===` and `---`) sized to approximate content width
- Faster processing, smaller output

Example:
```
Direct Deposits | Type | Account | Amount
======================================
MY BANK | CHK | 9876 | 4,930.96
```

### `--output:unprocessed_table_text_padded`
Outputs pipe-delimited tables with column alignment:
- Columns padded with spaces for visual alignment
- Numeric columns right-aligned (decimal points align vertically)
- Text columns left-aligned
- Uniform row widths within each logical table (header, body, footer all same width)
- Header/footer separator lines (`===` and `---`) extended to match row width
- Better readability for console output and manual review

Example:
```
Direct Deposits        | Type | Account | Amount   
===================================================
MY BANK                | CHK  |    9876 | 4,930.96
```

**When to use:**
- Use `unprocessed_table_text` for automated parsing or compact storage
- Use `unprocessed_table_text_padded` for human review, debugging, or presentations where readability matters

**Performance:** Padded output adds minimal overhead (<5% processing time) due to two-pass column width calculation and numeric alignment logic.


# Paystub Parser Table Extraction (Implementation Overview)

This tool extracts structured tables (Earnings, Taxes, Deductions, Direct Deposits, etc.) from PDF paystubs using visual cues:

- **Header detection**: Finds bold text rows matching known table labels
- **Underline detection**: Locates horizontal rules (lines) at or just below the header
- **Width derivation**: Table width is derived from the header underline: merge adjacent underline segments at the chosen header Y (gap ≤ 3), then take the union of spans overlapping the header label X range to form table bounds (supports arbitrary side‑by‑side tables)
- **Column mapping**: Uses X positions of header/underline to assign text to columns
- **Body extraction**: Captures all rows between header underline and the next major horizontal rule (footer)
- **Summary row**: Identifies the first bold row below the footer as the summary
- **Output formatting**: Adds `=` and `-` lines matching the header width, and an empty line between tables

## Example Output (Multi‑Table with Side‑by‑Side Disambiguation)
```
Earnings | Rate | Hours | Amount | YTD
======================================
ER Cost of |  | 0.00 | 36.13 | 108.39
ER Cost of |  | 0.00 | 7.92 | 24.08
ER Cost of |  | 0.00 | 285.85 | 857.55
ER Cost of |  | 0.00 | 8.39 | 25.17
ER Cost of |  | 0.00 | 4.55 | 13.65
GROUP TE |  | 0.00 | 39.30 | 117.90
Holiday Me |  |  |  | 808.15
REGULAR | 101.0192 | 80.00 | 8,081.54 | 27,072.78
SICK |  |  |  | 1,212.24
--------------------------------------
Gross Earnings |  | 80.00 | 8,120.84 | 28,402.92

Taxes | Amount | YTD
====================
CA | 650.56 | 2,196.93
CASDI-E | 96.03 | 336.57
FITW | 1,626.98 | 5,567.29
MED | 116.60 | 408.39
SS | 498.58 | 1,746.24
--------------------
Taxes | 2,988.75 | 10,255.42

Deductions | Amount | YTD
=========================
DENTAL INS | 7.74 | 23.22
GROUP TERM LIFE CALCULA | 39.30 | 117.90
MEDICAL INS | 71.46 | 214.38
Vol Employee Life | 32.63 | 97.89
-------------------------
Deductions | 151.13 | 453.39

Direct Deposits | Type | Account | Amount
=========================================
BANK OF AMERICA, N.A. | C | ***6457 | 4,980.96
-----------------------------------------
Total Direct Deposits |  |  | 4,980.96
```

See [DESIGN.md](./DESIGN.md) for full extraction rules and algorithm details.

## Time Off table (multi‑line headers, no PDF footer)

Some paystubs include a "Time Off" table with multi‑line headers and no terminating footer rule in the PDF content. The extractor handles this with targeted logic:

- Multi‑line headers: The second and third headers are rendered on two lines (e.g., "Available" / "to Use" and "Plan Year" / "Used"). We reconstruct column anchors by matching their top/bottom parts by X proximity.
- Invisible text filtering: Some PDFs contain invisible or accessibility helper text that sits at the same X as the visible text but is slightly higher in Y (typically by ~0.1–0.2 units). We treat the higher item as invisible when a lower counterpart exists at the same X within that Y delta. This removes spurious labels like a stray "Time Off" or truncated prefixes (e.g., "Exempt Ti") that shouldn't appear in output.
- No footer rule: If the PDF doesn't provide a footer rule for this table, the extractor synthesizes a footer line ("-" repeated to the header width) at the end of the Time Off rows to make the table boundary explicit for downstream parsing.

Example (with synthesized footer):
```
Time Off | Available to Use | Plan Year Used
============================================
COVID | 40.00 | 0.00
Jury Duty | 24.00 | 0.00
SICK | 76.00 | 44.00
US | -88.00 | 88.00
Other | 24.00 | 0.00
--------------------------------------------
```

## Generic Table Discovery Algorithm (No Hardcoded Names)

The extractor can discover tables generically—without pre‑configured column lists—by combining visual PDF features and lightweight semantic checks:

1. Header candidate: a horizontal row of text with ≥2 underline segments within 15px below it whose X spans overlap the row’s text X range.
2. Table bounds: derive [X1, X2] from overlapping underline segments; for multi‑table rows use anchor keywords (e.g. “Earnings”, “Deductions”, “Taxes”, “Direct Deposits”) to split spans horizontally.
3. Side‑by‑side isolation: if only one anchor is present on a mixed row (e.g. Direct Deposits sharing Y with left‑side data), restrict rules to a window around the anchor’s X instead of taking all rules at that Y band.
4. Body validation: require at least one body row 10–50px beneath the header within the same X bounds.
5. Spacing heuristic: rows with more whitespace above than the gap to the first body row are more likely true table headers (tables have space around them, tighter spacing inside).
6. Precision Y filtering: when extracting header labels, only accept items at the underline Y (±0.5px) to avoid mixing adjacent lines (prevents “Taxes” + “COVID” contamination).
7. Content sanity: reject headers if >30% of labels are numeric or the first label is numeric; require at least one known header token or common column label (Rate, Hours, Amount, YTD, Type, Account).
8. Summary detection: below the footer, prefer the longest bold match containing the table’s first column token (e.g. “Gross Earnings” over “Earnings”, “Total Direct Deposits” over “Direct Deposits”).

Result: All four paystub tables (Earnings, Deductions, Direct Deposits, Taxes) are discovered correctly, with side‑by‑side tables cleanly separated and summary rows preserved verbatim.

There are three extraction paths you can choose from via CLI flags:

- Raw: baseline pdf-parse ordering, no delimiter, no grouping.
- Default (current default): per-page getTextContent(), visible delimiter, boundary cleanup, and rule-based table separation.
- Enhanced: inserts visible horizontal-line markers and uses column grouping.

Details for Default mode:

- Per-page getTextContent(): Avoids artifacts that can occur with parser.getText().
- Item delimiter: Joins visible text runs with " | ".
- Boundary cleanup: Only strips a leading or trailing delimiter from each line; empty interior fields are preserved.
- Whitespace filter: Drops whitespace-only runs to avoid spurious empty fields.
Side-by-side table disambiguation & width computation:
	- Collect all header label occurrences in a vertical band.
	- Anchor on the first column label closest to band top.
	- Accept other labels only if same header row (±2px Y) and to the right of anchor.
	- Gather underline rules within 15px below header; group by Y; pick row with largest total covered width.
	- Merge adjacent rule segments (gap ≤ 3 units) into spans.
	- Union spans overlapping header label X range to produce [tableX1, tableX2].
	- Constrain body and summary detection to this X range.

Tuning thresholds (implementation constants):
- Vertical association window: 60 units below the rule.
- X-range margin: 4 units.
- Free-content x-cluster width: 80 units.

Related code (in `src/parser.ts`): `discoverTables()` (generic discovery), `findTableOnPage()` (extraction), `extractTextWithoutHorizontalLines()` (render/format), and `detectHorizontalRulesWithRanges()` (rule detection).

## Gotchas & Tuning

- **Header content filtering**: Paystubs may contain header sections with duplicate table structures (e.g., duplicate Direct Deposits table above "Non Negotiable" marker). The extractor filters out items above the "Non Negotiable - This is not a check - Non Negotiable" marker (if present) to focus only on the main content area.
- **Invisible text “shadows”**: Some documents include invisible text stacked above visible text at nearly the same X position and ~0.1–0.2 Y units higher. During table body extraction (not header), any higher item with a lower counterpart at the same X within that Y delta is treated as invisible and dropped. This prevents stray labels like "Time Off" and truncated prefixes (e.g., "Exempt Ti") from polluting rows.
- **Underline segmentation**: Header underline is often split into multiple adjacent rectangles per column; merge segments with gap ≤ 3 units to reconstruct contiguous spans.
- **Header text vs underline Y**: Header text row and underline may differ (underline commonly 5–15px below header text). Search for underline within that vertical window instead of assuming equal Y.
- **Body top boundary**: Use the underline Y as the body start; exclude header text items even if they share or nearly share Y with underline.
- **Footer rule selection**: Pick the horizontal rule whose first bold summary row appears 5–15px below it to avoid selecting decorative or unrelated rules.
- **Synthetic footer for Time Off**: If the PDF omits a footer rule for the Time Off table, we add a dashed footer line matching the header width in the text output to mark the end of that table for reliable downstream parsing.
- **Side‑by‑side tables**: Anchor on the first column label; accept only same-row labels to the right; restrict extraction to union of underline spans overlapping header label X range so adjacent tables don't bleed together.
- **Rows sharing footer Y**: Adaptively handle items at the footer rule Y—include them if non-bold (regular data rows like SICK, SS, Vol Employee Life), exclude them if bold (summary rows like Total Direct Deposits) to prevent duplicates.
- **Coordinate system tolerance**: PDF Y values have minor floating variance; group items with ±2px when comparing row Y positions.
- **Noise filtering**: Ignore horizontal rectangles narrower than ~50 units to reduce false rule detections.
- **Bold summary detection**: When determining body boundaries, first look for bold summary rows ABOVE any detected end rule (e.g., "Total Earnings"). These rows must contain the table's first column name to avoid false matches. If found, they define the body boundary, handling tables where summaries appear without horizontal rule separators. For items AT the footer rule Y, require the first column label token in the bold row (within ±2px) to avoid misclassifying other bold lines. Summary row appears after the footer separator in output.
- **Table discovery Y-position marking**: The discovery algorithm only marks Y positions as "used" (preventing duplicate detection within 20px) when a table is successfully discovered. This prevents false-positive blocking where previously processed non-table rows would incorrectly prevent nearby actual table headers from being discovered (e.g., preventing Taxes table discovery because a summary row 17px away was already processed).
- **Empty numeric cells**: Preserve interior empty fields; only trim leading/trailing delimiters so column alignment remains stable for downstream parsing.

### Troubleshooting discovery

- Mixed rows (header picks up neighboring data, e.g., Taxes + COVID): ensure header labels are taken only at the underline Y with tight tolerance (±0.5px) and within the table’s X bounds from the underline spans.
- Missing Direct Deposits on a row with left-side data: if only the right-side anchor is present, filter underline rules to a window around the anchor’s X instead of all rules in the Y band.
- Wrong summary label (e.g., “Earnings” instead of “Gross Earnings”): prefer the longest bold match containing the table’s first column token and preserve the actual PDF text when rendering.
- Side-by-side merge (Earnings+Deductions combining): split by anchor keywords and avoid using raw gap sizes alone—respect that tables have horizontal space around them which may resemble inter-column gaps.

Thresholds currently in use: underline search window (≤15px below header), segment merge gap (≤3 units), header label Y tolerance (±0.5px at underline Y), row grouping tolerance (±2px), footer summary proximity (5–15px below rule), minimum rule width (~50 units). Adjust cautiously—each affects table isolation and row completeness.

## PII-Safe Test Fixture Workflow

For testing and development without exposing sensitive personal information, you can extract structured PDF data to JSON fixtures and then scrub PII before committing them to version control.

### Extracting Fixtures

Generate a fixture file with structured page data (text items with positions, horizontal rules, font information) but **without the raw PDF binary**:

```bash
npm run dev -- -d data/paystubs \
  --file "20250815 - Pay Statement - 20250727 - 20250809.PDF" \
  --output:raw_pdf \
  --output:raw_pdf_omit_binary \
  --output:file fixtures/paystub_20250815_no_binary.json
```

The `--output:raw_pdf_omit_binary` flag ensures the fixture contains only:
- `numpages`: Page count
- `info`: PDF metadata
- `text`: Full extracted text
- `pagesDetailed`: Array of page objects with:
  - `textItems`: Text content with x/y positions, font names, and bold flags
  - `horizontalRules`: Detected horizontal lines with x1/x2/y coordinates
  - `styles`: Font style information

**Note:** The flag name is `--output:raw_pdf_omit_binary` (with underscore), not `:omit-binary` (with colon), due to commander CLI parsing limitations.

### Scrubbing PII

Edit the generated JSON file to remove personally identifiable information from the `textItems` array. Replace sensitive values in the `str` field:

```json
{
  "pagesDetailed": [
    {
      "textItems": [
        { "x": 29.95, "y": 512.93, "str": "Martin Orona", "fontName": "g_d0_f3", "isBold": true },
        { "x": 115.34, "y": 500.76, "str": "2606316", "fontName": "g_d0_f3", "isBold": true }
      ]
    }
  ]
}
```

Change to generic values:

```json
{ "x": 29.95, "y": 512.93, "str": "Jane Doe", "fontName": "g_d0_f3", "isBold": true }
{ "x": 115.34, "y": 500.76, "str": "1234567", "fontName": "g_d0_f3", "isBold": true }
```

### Processing Fixtures

Process the scrubbed fixture through the same table extraction logic as real PDFs:

```bash
npm run dev -- \
  --input:raw_pdf fixtures/paystub_20250815_no_binary.json \
  --output:unprocessed_table_text \
  --output:console
```

The fixture processing path (`processRawPdfPages()`) uses the same shared table formatting function (`formatPagesWithTables()`) as the live PDF path, ensuring identical output for testing purposes.

### Verification

To verify the fixture produces identical output to the original PDF (ignoring minor whitespace differences):

```bash
# Process real PDF
npm run dev -- -d data/paystubs --file "FILE.PDF" \
  --output:unprocessed_table_text --output:file /tmp/real_output.txt

# Process fixture
npm run dev -- --input:raw_pdf fixtures/fixture.json \
  --output:unprocessed_table_text --output:file /tmp/fixture_output.txt -d data/paystubs

# Compare (ignoring whitespace)
diff -w /tmp/real_output.txt /tmp/fixture_output.txt
```

### Architecture Notes

The PII-safe workflow relies on architectural separation:
- **Data extraction**: PDF binary → structured page data (text items + positions + rules)
- **Data processing**: Structured page data → formatted tables

This separation allows:
1. Binary-free fixtures that don't contain the original PDF
2. PII scrubbing on the structured text items
3. Identical table processing for both live PDFs and fixtures
4. Safe version control of test data

The `binaryBase64` field previously included the entire PDF encoded as base64, which defeated PII scrubbing. Omitting it reduces fixture size by ~98% and prevents accidental PII exposure.

