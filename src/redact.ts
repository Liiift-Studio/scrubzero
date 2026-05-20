// redact() — primary redaction function: removes text from content streams and draws visual bars

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type {
	RedactionRegion,
	RedactOptions,
	RedactResult,
	NormalizedRegion,
	TextItem,
} from './types.js';
import { removeTextOperatorsInRegion, inflate, deflate } from './content-stream.js';

/** Default redaction options */
const DEFAULTS: Required<RedactOptions> = {
	flattenAnnotations: true,
	sanitizeMetadata: true,
	addRedactionMarkers: false,
};

/**
 * Convert a user-supplied RedactionRegion into a NormalizedRegion.
 * The input uses top-left origin; PDF uses bottom-left origin.
 * We need the page height to flip the Y axis.
 */
function normalizeRegion(region: RedactionRegion, pageHeight: number): NormalizedRegion {
	const yMax = pageHeight - region.y;
	const yMin = yMax - region.height;
	return {
		page: region.page,
		xMin: region.x,
		yMin,
		xMax: region.x + region.width,
		yMax,
		color: region.color ?? [0, 0, 0],
		label: region.label,
	};
}

/**
 * Determine whether a text item's bounding box intersects a normalised region.
 * Both are in PDF user-space (bottom-left origin).
 */
function textItemIntersectsRegion(item: TextItem, region: NormalizedRegion): boolean {
	const itemXMax = item.x + item.width;
	const itemYMax = item.y + item.height;
	return (
		itemXMax > region.xMin &&
		item.x < region.xMax &&
		itemYMax > region.yMin &&
		item.y < region.yMax
	);
}

/**
 * Extract all text items with page positions from a PDF using pdfjs-dist.
 * Returns items grouped by 1-indexed page number.
 */
async function extractTextItems(pdfBytes: ArrayBuffer): Promise<Map<number, TextItem[]>> {
	// Use the legacy build which works in Node.js without a bundler
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

	// Silence pdfjs worker warnings in Node.js context
	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdfBytes),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: true,
		disableFontFace: true,
	});

	const pdfDoc = await loadingTask.promise;
	const numPages = pdfDoc.numPages;
	const result = new Map<number, TextItem[]>();

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDoc.getPage(pageNum);
		const viewport = page.getViewport({ scale: 1 });
		const pageHeight = viewport.height;

		const textContent = await page.getTextContent();
		const items: TextItem[] = [];

		for (const item of textContent.items) {
			// pdfjs-dist text items may be TextItem or TextMarkedContent
			if (!('str' in item)) continue;
			if (!item.str || item.str.trim() === '') continue;

			// item.transform is a 6-element matrix [a, b, c, d, e, f]
			// e and f are the x and y translation (bottom-left origin in viewport space)
			const [, , , , tx, ty] = item.transform;
			const x = tx;
			// Flip y: pdfjs reports in viewport coords (top-left origin), we need bottom-left
			const y = pageHeight - ty - (item.height ?? 0);

			items.push({
				str: item.str,
				page: pageNum,
				x,
				y,
				width: item.width ?? 0,
				height: item.height ?? 0,
			});
		}

		result.set(pageNum, items);
		page.cleanup();
	}

	await pdfDoc.destroy();
	return result;
}

/**
 * Attempt to access and scrub the content stream bytes for a page.
 * Uses pdf-lib's internal page dict access to get the raw stream.
 * Replaces text-operator arguments in any intersecting stream sections.
 */
async function scrubContentStream(
	pdfLibDoc: PDFDocument,
	pageIndex: number,
	regions: NormalizedRegion[],
): Promise<void> {
	const page = pdfLibDoc.getPage(pageIndex);

	// Access the raw page dictionary via pdf-lib internals
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pageNode = (page as any).node;
	if (!pageNode) return;

	// Attempt to get the Contents entry
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const contentsRef = pageNode.get((PDFDocument as any).PDFName?.of('Contents') ?? 'Contents');
	if (!contentsRef) return;

	// pdf-lib exposes a context with a lookup method for indirect references
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ctx = (pdfLibDoc as any).context;
	if (!ctx) return;

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const PDFName = (await import('pdf-lib')).PDFName as any;
		const contentsObj = pageNode.get(PDFName.of('Contents'));
		if (!contentsObj) return;

		// Resolve the contents — could be a stream or an array of streams
		const contentsResolved = ctx.lookup(contentsObj);
		const streams = [];

		if (contentsResolved && typeof contentsResolved.getContentsStream === 'function') {
			streams.push(contentsResolved);
		} else if (contentsResolved && typeof contentsResolved.asArray === 'function') {
			const arr = contentsResolved.asArray();
			for (const ref of arr) {
				const stream = ctx.lookup(ref);
				if (stream) streams.push(stream);
			}
		} else if (contentsResolved) {
			streams.push(contentsResolved);
		}

		for (const stream of streams) {
			// Get the raw (possibly compressed) bytes
			if (typeof stream.contents === 'undefined') continue;
			let rawBytes: Uint8Array = stream.contents;

			// Check if the stream is FlateDecode compressed
			const dict = stream.dict;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const filter = dict?.get(PDFName.of('Filter')) as any;
			const isFlate =
				filter &&
				(filter.encodedName === '/FlateDecode' ||
					filter.encodedName === '/Fl' ||
					(Array.isArray(filter.array) &&
						filter.array.some(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(f: any) => f.encodedName === '/FlateDecode' || f.encodedName === '/Fl',
						)));

			let decompressed: Uint8Array;
			if (isFlate) {
				decompressed = await inflate(rawBytes);
			} else {
				decompressed = rawBytes;
			}

			let modified = decompressed;
			for (const region of regions) {
				modified = removeTextOperatorsInRegion(modified, region);
			}

			if (isFlate) {
				rawBytes = await deflate(modified);
				stream.contents = rawBytes;
			} else {
				stream.contents = modified;
			}
		}
	} catch {
		// Content stream scrubbing is best-effort — the visual bar still covers the text
	}
}

/**
 * Wipe PDF metadata: clears the DocInfo dictionary fields and removes any
 * XMP metadata stream from the document catalog.
 */
async function sanitizeMetadata(pdfLibDoc: PDFDocument): Promise<void> {
	try {
		// Clear standard DocInfo fields
		pdfLibDoc.setTitle('');
		pdfLibDoc.setAuthor('');
		pdfLibDoc.setSubject('');
		pdfLibDoc.setKeywords([]);
		pdfLibDoc.setProducer('');
		pdfLibDoc.setCreator('');
		pdfLibDoc.setCreationDate(new Date(0));
		pdfLibDoc.setModificationDate(new Date(0));

		// Remove the XMP metadata stream from the document catalog
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const catalog = (pdfLibDoc as any).catalog;
		if (catalog) {
			const { PDFName } = await import('pdf-lib');
			catalog.delete(PDFName.of('Metadata'));
		}
	} catch {
		// Metadata sanitisation is best-effort
	}
}

/**
 * Redact specific rectangular regions from a PDF.
 *
 * For each region this function:
 * 1. Removes text-drawing operators from the page content stream (content-stream layer)
 * 2. Draws a filled rectangle over the region (visual layer)
 * 3. Optionally renders a "REDACTED" label inside the bar
 *
 * Metadata can be wiped via `options.sanitizeMetadata` (default: true).
 */
export async function redact(
	pdf: ArrayBuffer,
	regions: RedactionRegion[],
	options?: RedactOptions,
): Promise<RedactResult> {
	const opts: Required<RedactOptions> = { ...DEFAULTS, ...options };

	if (regions.length === 0) {
		// Nothing to redact — return original bytes
		const pdfLibDoc = await PDFDocument.load(pdf);
		const outBytes = await pdfLibDoc.save();
		return { pdf: outBytes, redactedCount: 0, pagesAffected: [] };
	}

	// Step 1: Extract text positions from original PDF
	const textItemsByPage = await extractTextItems(pdf);

	// Step 2: Load with pdf-lib for modification
	const pdfLibDoc = await PDFDocument.load(pdf, {
		ignoreEncryption: true,
		updateMetadata: false,
	});

	const numPages = pdfLibDoc.getPageCount();
	const pagesAffected = new Set<number>();
	let redactedCount = 0;

	// Load a font for optional labels
	let labelFont = null;
	if (opts.addRedactionMarkers) {
		labelFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
	}

	// Group regions by page
	const regionsByPage = new Map<number, RedactionRegion[]>();
	for (const region of regions) {
		const existing = regionsByPage.get(region.page) ?? [];
		existing.push(region);
		regionsByPage.set(region.page, existing);
	}

	for (const [pageNum, pageRegions] of regionsByPage.entries()) {
		if (pageNum < 1 || pageNum > numPages) continue;

		const pageIndex = pageNum - 1;
		const page = pdfLibDoc.getPage(pageIndex);
		const { height: pageHeight } = page.getSize();

		const textItems = textItemsByPage.get(pageNum) ?? [];
		const normalizedRegions: NormalizedRegion[] = pageRegions.map((r) =>
			normalizeRegion(r, pageHeight),
		);

		// Step 3: Scrub content streams for regions that have intersecting text
		const regionsWithText = normalizedRegions.filter((nr) =>
			textItems.some((item) => textItemIntersectsRegion(item, nr)),
		);

		if (regionsWithText.length > 0) {
			await scrubContentStream(pdfLibDoc, pageIndex, regionsWithText);
		}

		// Step 4: Draw visual redaction bars for all regions
		for (const nr of normalizedRegions) {
			const [r, g, b] = nr.color;
			page.drawRectangle({
				x: nr.xMin,
				y: nr.yMin,
				width: nr.xMax - nr.xMin,
				height: nr.yMax - nr.yMin,
				color: rgb(r, g, b),
				borderWidth: 0,
			});

			// Optionally render the REDACTED label
			if (opts.addRedactionMarkers && labelFont) {
				const barHeight = nr.yMax - nr.yMin;
				const barWidth = nr.xMax - nr.xMin;
				const label = nr.label ?? 'REDACTED';
				const fontSize = Math.min(barHeight * 0.6, 10);
				const textWidth = labelFont.widthOfTextAtSize(label, fontSize);
				const textX = nr.xMin + (barWidth - textWidth) / 2;
				const textY = nr.yMin + (barHeight - fontSize) / 2;

				// Only draw if the bar is large enough to contain the label
				if (textX > nr.xMin && textY > nr.yMin) {
					page.drawText(label, {
						x: textX,
						y: textY,
						size: fontSize,
						font: labelFont,
						color: rgb(1, 1, 1), // white text on dark bar
					});
				}
			}

			redactedCount++;
			pagesAffected.add(pageNum);
		}
	}

	// Step 5: Optionally sanitize metadata
	if (opts.sanitizeMetadata) {
		await sanitizeMetadata(pdfLibDoc);
	}

	const outBytes = await pdfLibDoc.save();
	const sortedPages = Array.from(pagesAffected).sort((a, b) => a - b);

	return {
		pdf: outBytes,
		redactedCount,
		pagesAffected: sortedPages,
	};
}
