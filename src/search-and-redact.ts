// searchAndRedact() — find text patterns in a PDF and redact all matches

import type {
	SearchPattern,
	RedactOptions,
	RedactResult,
	RedactionRegion,
	TextItem,
} from './types.js';
import { redact } from './redact.js';

/**
 * Extract all text items from every page of a PDF using pdfjs-dist.
 * Returns a flat array of TextItem objects with page numbers.
 * Text item transforms from pdfjs are in PDF bottom-left coordinate space.
 */
async function extractAllTextItems(pdf: ArrayBuffer): Promise<TextItem[]> {
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

	// Copy the buffer before passing to pdfjs — pdfjs may transfer (neuter) the source buffer
	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdf.slice(0)),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: true,
		disableFontFace: true,
	});

	const pdfDoc = await loadingTask.promise;
	const numPages = pdfDoc.numPages;
	const allItems: TextItem[] = [];

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDoc.getPage(pageNum);

		const textContent = await page.getTextContent();

		for (const item of textContent.items) {
			if (!('str' in item)) continue;
			if (!item.str || item.str.trim() === '') continue;

			// item.transform is [a, b, c, d, e, f]; e=x, f=y in PDF bottom-left space
			const [, , , , tx, ty] = item.transform;
			const x = tx;
			// pdfjs text transforms are in PDF bottom-left coordinate space — use directly
			const y = ty;

			allItems.push({
				str: item.str,
				page: pageNum,
				x,
				y,
				width: item.width ?? 0,
				height: item.height ?? 0,
			});
		}

		page.cleanup();
	}

	await pdfDoc.destroy();
	return allItems;
}

/**
 * Build a RegExp from a SearchPattern, normalising string patterns and
 * ensuring the global flag is set so matchAll works correctly.
 */
function buildRegExp(pattern: SearchPattern['pattern']): RegExp {
	if (pattern instanceof RegExp) {
		// Re-create with the global flag added if not present
		const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
		return new RegExp(pattern.source, flags);
	}
	// Escape special regex characters in literal strings
	const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(escaped, 'g');
}

/**
 * Merge adjacent or overlapping text items on the same page into a single
 * string, keeping track of each item's character positions for back-mapping.
 *
 * Returns an array of line groups, one per page. Each group contains:
 * - `text`: the concatenated string for matching
 * - `items`: the source TextItem objects in order
 * - `offsets`: the start character offset of each item within `text`
 */
interface PageTextGroup {
	page: number;
	text: string;
	items: TextItem[];
	offsets: number[];
}

function buildPageTextGroups(allItems: TextItem[]): PageTextGroup[] {
	// Group by page
	const byPage = new Map<number, TextItem[]>();
	for (const item of allItems) {
		const existing = byPage.get(item.page) ?? [];
		existing.push(item);
		byPage.set(item.page, existing);
	}

	const groups: PageTextGroup[] = [];

	for (const [page, items] of byPage.entries()) {
		// Sort by reading order: top-to-bottom, left-to-right
		// y is in bottom-left space so higher y = higher on page
		const sorted = [...items].sort((a, b) => {
			const yDiff = b.y - a.y;
			if (Math.abs(yDiff) > 2) return yDiff; // different lines
			return a.x - b.x; // same line, left to right
		});

		let text = '';
		const offsets: number[] = [];

		for (let i = 0; i < sorted.length; i++) {
			const item = sorted[i]!;
			offsets.push(text.length);
			text += item.str;
			// Add a space between items that are not adjacent
			const next = sorted[i + 1];
			if (next && Math.abs(next.y - item.y) > 2) {
				text += '\n';
			} else if (next) {
				text += ' ';
			}
		}

		groups.push({ page, text, items: sorted, offsets });
	}

	return groups;
}

/**
 * Given a character range within the concatenated page text, find all
 * TextItem objects whose text overlaps that range and return them.
 */
function findItemsForRange(
	group: PageTextGroup,
	matchStart: number,
	matchEnd: number,
): TextItem[] {
	const matched: TextItem[] = [];

	for (let i = 0; i < group.items.length; i++) {
		const item = group.items[i]!;
		const itemStart = group.offsets[i]!;
		const itemEnd = itemStart + item.str.length;

		// Overlap check
		if (itemEnd > matchStart && itemStart < matchEnd) {
			matched.push(item);
		}
	}

	return matched;
}

/**
 * Convert a set of matched TextItem objects into a RedactionRegion that
 * covers their bounding box on the page.
 * pageHeight is needed to convert from bottom-left PDF space back to
 * the top-left space that RedactionRegion uses.
 * Items have y = bottom of glyph in bottom-left space; y + height = top.
 */
function itemsToRegion(
	items: TextItem[],
	pageHeight: number,
	pattern: SearchPattern,
): RedactionRegion {
	let xMin = Infinity;
	let yMin = Infinity; // bottom of text group in bottom-left space
	let xMax = -Infinity;
	let yMax = -Infinity; // top of text group in bottom-left space

	for (const item of items) {
		xMin = Math.min(xMin, item.x);
		yMin = Math.min(yMin, item.y);
		xMax = Math.max(xMax, item.x + item.width);
		yMax = Math.max(yMax, item.y + item.height);
	}

	// Add a small padding around the bounding box (2 PDF units)
	const PADDING = 2;
	xMin -= PADDING;
	yMin -= PADDING;
	xMax += PADDING;
	yMax += PADDING;

	const page = items[0]!.page;

	// Convert from bottom-left space to top-left space for RedactionRegion.
	// yMax is the top of the text in bottom-left space, so pageHeight - yMax
	// gives the distance from the top of the page.
	const topLeftY = pageHeight - yMax;

	const region: RedactionRegion = {
		page,
		x: xMin,
		y: topLeftY,
		width: xMax - xMin,
		height: yMax - yMin,
	};
	if (pattern.color !== undefined) region.color = pattern.color;
	if (pattern.label !== undefined) region.label = pattern.label;
	return region;
}

/**
 * Search for text patterns in a PDF and redact all matching regions.
 *
 * For each SearchPattern:
 * 1. Extract text items and their positions from the PDF
 * 2. Build a concatenated text string per page for efficient regex matching
 * 3. Map every match back to the source TextItem bounding boxes
 * 4. Convert bounding boxes to RedactionRegions
 * 5. Call redact() with all discovered regions
 */
export async function searchAndRedact(
	pdf: ArrayBuffer,
	patterns: SearchPattern[],
	options?: RedactOptions,
): Promise<RedactResult> {
	if (patterns.length === 0) {
		const { PDFDocument } = await import('pdf-lib');
		const pdfLibDoc = await PDFDocument.load(pdf);
		const outBytes = await pdfLibDoc.save();
		return { pdf: outBytes, redactedCount: 0, pagesAffected: [] };
	}

	// Extract all text items from the PDF
	const allItems = await extractAllTextItems(pdf);

	// Get page heights for coordinate conversion
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdf.slice(0)),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: true,
		disableFontFace: true,
	});
	const pdfDocForHeights = await loadingTask.promise;
	const pageHeights = new Map<number, number>();
	for (let p = 1; p <= pdfDocForHeights.numPages; p++) {
		const pg = await pdfDocForHeights.getPage(p);
		const vp = pg.getViewport({ scale: 1 });
		pageHeights.set(p, vp.height);
		pg.cleanup();
	}
	await pdfDocForHeights.destroy();

	const pageGroups = buildPageTextGroups(allItems);
	const allRegions: RedactionRegion[] = [];

	for (const pattern of patterns) {
		// PHI detector mode — skip regex matching, use detector function
		if (pattern.phiDetector !== undefined) {
			continue; // PHI detectors are handled separately by redactWithPHIDetector
		}

		const re = buildRegExp(pattern.pattern);

		for (const group of pageGroups) {
			// Skip pages not in the pattern's page filter
			if (pattern.pages && pattern.pages.length > 0 && !pattern.pages.includes(group.page)) {
				continue;
			}

			// Reset lastIndex before each search
			re.lastIndex = 0;

			let match: RegExpExecArray | null;
			while ((match = re.exec(group.text)) !== null) {
				const matchStart = match.index;
				const matchEnd = matchStart + match[0].length;

				const matchedItems = findItemsForRange(group, matchStart, matchEnd);
				if (matchedItems.length === 0) continue;

				const pageHeight = pageHeights.get(group.page) ?? 0;
				const region = itemsToRegion(matchedItems, pageHeight, pattern);
				allRegions.push(region);

				// Guard against zero-length matches causing infinite loops
				if (match[0].length === 0) {
					re.lastIndex++;
				}
			}
		}
	}

	// Pass the discovered regions to the core redact function
	return redact(pdf, allRegions, options);
}

/**
 * Redact PHI using a custom detector function.
 * The detector receives page text and returns bounding boxes of PHI regions.
 * Bounding box coordinates should be in PDF user-space units (top-left origin).
 */
export async function redactWithPHIDetector(
	pdf: ArrayBuffer,
	detector: (
		text: string,
		pageNum: number,
	) => Promise<
		Array<{ text: string; x: number; y: number; width: number; height: number }>
	>,
	options?: RedactOptions,
): Promise<RedactResult> {
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

	const loadingTask = pdfjsLib.getDocument({
		data: new Uint8Array(pdf.slice(0)),
		useWorkerFetch: false,
		isEvalSupported: false,
		useSystemFonts: true,
		disableFontFace: true,
	});

	const pdfDoc = await loadingTask.promise;
	const numPages = pdfDoc.numPages;
	const allRegions: RedactionRegion[] = [];

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDoc.getPage(pageNum);
		const textContent = await page.getTextContent();

		// Build plain page text for the detector
		const pageText = textContent.items
			.filter((item) => 'str' in item)
			.map((item) => ('str' in item ? item.str : ''))
			.join(' ');

		page.cleanup();

		// Call the detector with page text
		const detections = await detector(pageText, pageNum);

		for (const det of detections) {
			allRegions.push({
				page: pageNum,
				x: det.x,
				y: det.y,
				width: det.width,
				height: det.height,
			});
		}
	}

	await pdfDoc.destroy();

	return redact(pdf, allRegions, options);
}
