# pdf-redact

True PDF content-stream redaction for Node.js and Lambda. No native binaries required.

Unlike overlay-only tools that paint a black rectangle on top of text (which can be removed with a PDF editor), `pdf-redact` removes text drawing operators directly from the PDF content stream **and** draws a visual bar over the region. The combination means the text is genuinely gone — not just hidden.

## Install

```bash
npm install pdf-redact
```

## Quick start

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { redact, searchAndRedact } from 'pdf-redact';

// --- Redact a known region ---
const pdfBytes = await readFile('input.pdf');
const result = await redact(pdfBytes.buffer, [
  {
    page: 1,
    x: 100,
    y: 200,
    width: 300,
    height: 20,
    color: [0, 0, 0],   // black bar
    label: 'REDACTED',
  },
]);
await writeFile('output.pdf', result.pdf);
console.log(`Redacted ${result.redactedCount} region(s) on pages ${result.pagesAffected}`);

// --- Search and redact by pattern ---
const result2 = await searchAndRedact(pdfBytes.buffer, [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g },           // Social Security Numbers
  { pattern: /\b[\w.]+@[\w.]+\.\w{2,}\b/g },        // Email addresses
  { pattern: 'John Smith', color: [0.8, 0, 0] },    // Literal string, red bar
]);
await writeFile('output-search.pdf', result2.pdf);
```

## Why not overlays?

Most "redaction" tools work by drawing a black rectangle **on top** of the original text layer. The text is still encoded in the file and trivially extractable — copy-paste it, run `pdftotext`, or open the file in a PDF editor and delete the rectangle. This is not redaction.

`pdf-redact` removes text drawing operators from the content stream bytes before writing the output, making the redacted content unrecoverable without specialised forensic tooling.

## API reference

### `redact(pdf, regions, options?)`

Redact specific rectangular regions from a PDF.

```typescript
async function redact(
  pdf: ArrayBuffer,
  regions: RedactionRegion[],
  options?: RedactOptions,
): Promise<RedactResult>
```

#### `RedactionRegion`

| Field | Type | Description |
|-------|------|-------------|
| `page` | `number` | 1-indexed page number |
| `x` | `number` | Left edge of the region in PDF units (points), from the left of the page |
| `y` | `number` | Top edge of the region in PDF units, from the top of the page |
| `width` | `number` | Width of the region in PDF units |
| `height` | `number` | Height of the region in PDF units |
| `color` | `[number, number, number]` | RGB fill color, each channel 0–1. Default: `[0, 0, 0]` (black) |
| `label` | `string` | Optional label rendered inside the bar when `addRedactionMarkers` is true |

---

### `searchAndRedact(pdf, patterns, options?)`

Find text patterns in a PDF and redact all matching locations.

```typescript
async function searchAndRedact(
  pdf: ArrayBuffer,
  patterns: SearchPattern[],
  options?: RedactOptions,
): Promise<RedactResult>
```

#### `SearchPattern`

| Field | Type | Description |
|-------|------|-------------|
| `pattern` | `RegExp \| string` | Regular expression or literal string to search for |
| `pages` | `number[]` | Limit to specific 1-indexed page numbers. Default: all pages |
| `color` | `[number, number, number]` | RGB fill color for matched bars. Default: `[0, 0, 0]` |
| `label` | `string` | Optional label for redaction markers |

---

### `RedactOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `flattenAnnotations` | `boolean` | `true` | Flatten existing annotations before redacting |
| `sanitizeMetadata` | `boolean` | `true` | Wipe DocInfo dictionary fields and XMP metadata stream |
| `addRedactionMarkers` | `boolean` | `false` | Render a visible label (e.g. `REDACTED`) inside each bar |

---

### `RedactResult`

| Field | Type | Description |
|-------|------|-------------|
| `pdf` | `Uint8Array` | The redacted PDF bytes, ready to write to disk or stream |
| `redactedCount` | `number` | Total number of regions redacted |
| `pagesAffected` | `number[]` | Sorted 1-indexed list of pages that had at least one redaction |

---

## Node.js and Lambda compatibility

`pdf-redact` targets Node.js >=18 and has no native binary dependencies. It ships as dual ESM + CJS so it works in both `"type": "module"` packages and CommonJS environments.

On AWS Lambda, deploy as-is — no additional configuration needed. The package uses Node.js built-in `zlib` for PDF stream decompression rather than native addons.

## Verifying redactions

To confirm that redacted text is genuinely absent from the output file:

```bash
# Extract text from the redacted PDF
pdftotext output.pdf - | grep "sensitive term"

# Or with Node.js
node -e "
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: fs.readFileSync('output.pdf') }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    console.log(content.items.map(i => i.str).join(' '));
  }
"
```

## License

MIT — Copyright Liiift Studio
