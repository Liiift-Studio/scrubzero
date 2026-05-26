# pdf-redact

True PDF content-stream redaction for Node.js and Lambda. No native binaries required.

Unlike overlay-only tools that paint a black rectangle on top of text (which can be removed with a PDF editor), `pdf-redact` removes text drawing operators directly from the PDF content stream **and** draws a visual bar over the region. The combination means the text is genuinely gone — not just hidden.

## Install

```bash
npm install @liiift-studio/pdf-redact
```

## Quick start

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { redact, searchAndRedact } from '@liiift-studio/pdf-redact';

// --- Redact a known region ---
const pdfBytes = await readFile('input.pdf');
const result = await redact(pdfBytes.buffer, [
  {
    page: 1,
    x: 100,
    y: 200,
    width: 300,
    height: 20,
    color: [0, 0, 0],
  },
]);
await writeFile('output.pdf', result.pdf);
console.log(`Redacted ${result.redactedCount} region(s) on pages ${result.pagesAffected}`);

// --- Search and redact by pattern ---
const result2 = await searchAndRedact(pdfBytes.buffer, [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g },            // Social Security Numbers
  { pattern: /\b[\w.]+@[\w.]+\.\w{2,}\b/g },         // Email addresses
  { pattern: 'John Smith', color: [0.8, 0, 0] },     // Literal string, red bar
]);
await writeFile('output-search.pdf', result2.pdf);
```

## CLI

```bash
# Search and redact by pattern (plain text or /regex/)
npx @liiift-studio/pdf-redact search input.pdf "John Smith" --output redacted.pdf
npx @liiift-studio/pdf-redact search input.pdf "/\d{3}-\d{2}-\d{4}/" --output redacted.pdf

# Redact built-in entity types
npx @liiift-studio/pdf-redact entities input.pdf --types ssn,email,phone --output redacted.pdf

# Verify a redacted PDF has no text under visual bars
npx @liiift-studio/pdf-redact verify redacted.pdf

# Redact a specific region by coordinates
npx @liiift-studio/pdf-redact redact input.pdf '[{"page":1,"x":100,"y":200,"width":300,"height":20}]' --output out.pdf
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
| `x` | `number` | Left edge of the region in PDF points, from the left of the page |
| `y` | `number` | Top edge of the region in PDF points, from the top of the page |
| `width` | `number` | Width of the region in PDF points |
| `height` | `number` | Height of the region in PDF points |
| `color` | `[number, number, number]` | RGB fill color, each channel 0–1. Default: `[0, 0, 0]` (black) |
| `label` | `string` | Optional label rendered inside the bar when `addRedactionMarkers` is true |
| `exemptionCode` | `string` | FOIA exemption code (e.g. `"6"`, `"7(C)"`) |

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
| `phiDetector` | `function` | Custom PHI detection hook — see below |

#### PHI detector hook

Integrate with AWS Comprehend Medical, Azure Text Analytics, or a custom NER model:

```typescript
const result = await searchAndRedact(pdfBytes.buffer, [
  {
    pattern: '', // unused when phiDetector is set
    phiDetector: async (items, pageNum) => {
      // items: Array<{ str, x, y, width, height }> — text items with PDF coordinates
      // Return bounding boxes of detected PHI in the same coordinate space
      const detections = await myNERModel(items.map(i => i.str).join(' '));
      return detections.map(d => ({
        x: d.boundingBox.x,
        y: d.boundingBox.y,
        width: d.boundingBox.width,
        height: d.boundingBox.height,
      }));
    },
  },
]);
```

---

### `redactEntities(pdf, types?, options?)`

Redact built-in entity types using pre-built regex patterns.

```typescript
import { redactEntities, EntityPatterns } from '@liiift-studio/pdf-redact';

const result = await redactEntities(pdfBytes.buffer, ['ssn', 'email', 'phone']);
```

Available entity types: `ssn`, `phone`, `email`, `credit-card`, `ip-address`, `date`, `name`, `attorney-client-marker`

---

### `redactBatch(items, concurrency?)`

Process multiple PDFs concurrently with per-item error isolation.

```typescript
import { redactBatch } from '@liiift-studio/pdf-redact';

const results = await redactBatch([
  { pdf: pdf1.buffer, patterns: [{ pattern: /SSN:\s*\d{3}-\d{2}-\d{4}/g }] },
  { pdf: pdf2.buffer, regions: [{ page: 1, x: 50, y: 100, width: 200, height: 20 }] },
], 4); // concurrency limit

for (const r of results) {
  if (r.error) console.error(`Item ${r.index} failed:`, r.error.message);
  else await writeFile(`output-${r.index}.pdf`, r.result!.pdf);
}
```

---

### `redactWithPHIDetector(pdf, detector, options?)`

Redact PHI using a standalone detector function. The detector receives text items with their PDF coordinates (bottom-left origin) and returns bounding boxes to redact.

```typescript
import { redactWithPHIDetector } from '@liiift-studio/pdf-redact';

const result = await redactWithPHIDetector(
  pdfBytes.buffer,
  async (items, pageNum) => {
    // items: Array<{ str, x, y, width, height }>
    // Return regions to redact in the same coordinate space
    return items
      .filter(item => looksLikePHI(item.str))
      .map(item => ({ x: item.x, y: item.y, width: item.width, height: item.height }));
  },
);
```

---

### `verify(pdf)`

Verify that a redacted PDF has no text remaining beneath its visual redaction bars.

```typescript
import { verify } from '@liiift-studio/pdf-redact';

const result = await verify(redactedPdf.buffer);
console.log(result.clean);       // true if no text found under any bar
console.log(result.violations);  // VerificationViolation[]
```

```typescript
interface VerificationViolation {
  page: number;
  bbox: [number, number, number, number];
  recoveredText: string;
}
```

---

### `RedactOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `flattenAnnotations` | `boolean` | `true` | Flatten existing annotations before redacting |
| `sanitizeMetadata` | `boolean` | `true` | Wipe DocInfo dictionary fields and XMP metadata stream |
| `addRedactionMarkers` | `boolean` | `false` | Render a visible label (e.g. `REDACTED`) inside each bar |
| `generateManifest` | `boolean` | `false` | Attach a structured audit manifest to the result |
| `redactorId` | `string` | — | Operator identifier recorded in the manifest |
| `basisCode` | `string` | — | FOIA or other exemption code recorded in the manifest |

---

### `RedactResult`

| Field | Type | Description |
|-------|------|-------------|
| `pdf` | `Uint8Array` | The redacted PDF bytes, ready to write to disk or stream |
| `redactedCount` | `number` | Total number of regions redacted |
| `pagesAffected` | `number[]` | Sorted 1-indexed list of pages that had at least one redaction |
| `manifest` | `RedactionManifest` | Audit manifest — present when `generateManifest: true` |

---

## Node.js and Lambda compatibility

`pdf-redact` targets Node.js >=18 and has no native binary dependencies. It ships as dual ESM + CJS so it works in both `"type": "module"` packages and CommonJS environments.

On AWS Lambda, deploy as-is — no additional configuration needed. The package uses Node.js built-in `zlib` for PDF stream decompression rather than native addons.

## License

MIT — Copyright Liiift Studio
