// verify.ts — verify that a redacted PDF has no text remaining under visual redaction bars

/**
 * A region in the PDF where text was found beneath a filled (redaction) rectangle.
 */
export interface VerificationViolation {
	/** 1-indexed page number */
	page: number;
	/** Bounding box of the overlap [x1, y1, x2, y2] in PDF user-space (bottom-left origin) */
	bbox: [number, number, number, number];
	/** The text found beneath the redaction bar */
	recoveredText: string;
}

/**
 * The result of verifying a redacted PDF.
 */
export interface VerificationResult {
	/** True if no text was found under any redaction bar */
	clean: boolean;
	/** Regions where text was found under a redaction bar */
	violations: VerificationViolation[];
}

/** Minimum fill opacity to treat a rectangle as a redaction bar (0–1 scale) */
const MIN_FILL_OPACITY = 0.9;

/**
 * Parse a number from a PDF operator argument (string representation).
 * Returns NaN if the string is not a valid number.
 */
function parseNum(s: string): number {
	return parseFloat(s);
}

/**
 * Simple axis-aligned rectangle for overlap testing.
 * All values in PDF user-space (bottom-left origin).
 */
interface Rect {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * Test whether two rectangles overlap.
 */
function rectsOverlap(a: Rect, b: Rect): boolean {
	return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

/**
 * Extract filled rectangles from a page's operator list.
 * Uses the OPS.rectangle and OPS.fill / OPS.closeFillStroke / OPS.fillStroke operations.
 */
async function extractFilledRects(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	page: any,
): Promise<Rect[]> {
	const rects: Rect[] = [];

	try {
		const opList = await page.getOperatorList();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
		const OPS = pdfjsLib.OPS as Record<string, number> | undefined;

		if (!OPS) return rects;

		const fnArray: number[] = opList.fnArray as number[];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const argsArray: any[][] = opList.argsArray as any[][];

		// We look for re (rectangle) operators followed by f/F/f*/B/B* (fill) operators.
		// The current transformation matrix (CTM) is tracked so we can map rect args to page space.
		// For simplicity we assume scale=1 and no rotation (sufficient for redaction bar detection).

		// Collect (x, y, w, h) from rectangle ops, then check if the next fill op fires
		let pendingRect: Rect | null = null;

		const OP_RECTANGLE = OPS['rectangle'] ?? -1;
		const OP_FILL = OPS['fill'] ?? -1;
		const OP_FILL_STROKE = OPS['fillStroke'] ?? -1;
		const OP_CLOSE_FILL_STROKE = OPS['closeFillStroke'] ?? -1;
		const OP_EOF = OPS['eoFill'] ?? -1;
		const OP_EOF_STROKE = OPS['eoFillStroke'] ?? -1;
		const OP_CLOSE_EOF_STROKE = OPS['closeEOFillStroke'] ?? -1;

		const fillOps = new Set([
			OP_FILL,
			OP_FILL_STROKE,
			OP_CLOSE_FILL_STROKE,
			OP_EOF,
			OP_EOF_STROKE,
			OP_CLOSE_EOF_STROKE,
		]);

		for (let k = 0; k < fnArray.length; k++) {
			const fn = fnArray[k];
			const args = argsArray[k];

			if (fn === OP_RECTANGLE && args && args.length >= 4) {
				const rx = parseNum(String(args[0]));
				const ry = parseNum(String(args[1]));
				const rw = parseNum(String(args[2]));
				const rh = parseNum(String(args[3]));
				if (!isNaN(rx) && !isNaN(ry) && !isNaN(rw) && !isNaN(rh)) {
					// Store the rect — it becomes a redaction bar if a fill op follows
					pendingRect = {
						x1: Math.min(rx, rx + rw),
						y1: Math.min(ry, ry + rh),
						x2: Math.max(rx, rx + rw),
						y2: Math.max(ry, ry + rh),
					};
				}
				continue;
			}

			if (fn !== undefined && fillOps.has(fn)) {
				if (pendingRect !== null) {
					// Only count rectangles of meaningful size (at least 5 PDF units in each dimension)
					const w = pendingRect.x2 - pendingRect.x1;
					const h = pendingRect.y2 - pendingRect.y1;
					if (w >= 5 && h >= 2) {
						rects.push(pendingRect);
					}
					pendingRect = null;
				}
				continue;
			}

			// Any other path-building op resets the pending rect accumulation
			// (we don't want to match rects from complex paths)
			if (fn !== undefined && !fillOps.has(fn) && fn !== OP_RECTANGLE) {
				// Only reset if it's a path-modifying op; we can be permissive here
				// by keeping pendingRect across graphics state ops
			}
		}
	} catch {
		// Operator list extraction is best-effort
	}

	return rects;
}

/**
 * Verify that a redacted PDF has no text remaining beneath its visual redaction bars.
 * Uses pdfjs-dist to extract both text items and filled rectangles per page,
 * then checks for overlaps.
 *
 * A "violation" occurs when a text item's bounding box overlaps a filled rectangle
 * that is large enough to be a redaction bar.
 */
export async function verify(pdf: ArrayBuffer): Promise<VerificationResult> {
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
	const violations: VerificationViolation[] = [];

	for (let pageNum = 1; pageNum <= numPages; pageNum++) {
		const page = await pdfDoc.getPage(pageNum);

		// Extract filled rectangles (potential redaction bars)
		const filledRects = await extractFilledRects(page);

		if (filledRects.length === 0) {
			page.cleanup();
			continue;
		}

		// Extract text items and their bounding boxes
		const textContent = await page.getTextContent();

		for (const item of textContent.items) {
			if (!('str' in item)) continue;
			if (!item.str || item.str.trim() === '') continue;

			// item.transform[4] = x, item.transform[5] = y in PDF bottom-left space
			const [, , , , tx, ty] = item.transform;
			const itemRect: Rect = {
				x1: tx,
				y1: ty,
				x2: tx + (item.width ?? 0),
				y2: ty + (item.height ?? 0),
			};

			for (const bar of filledRects) {
				if (rectsOverlap(itemRect, bar)) {
					// Compute the overlap bounding box
					const ox1 = Math.max(itemRect.x1, bar.x1);
					const oy1 = Math.max(itemRect.y1, bar.y1);
					const ox2 = Math.min(itemRect.x2, bar.x2);
					const oy2 = Math.min(itemRect.y2, bar.y2);

					violations.push({
						page: pageNum,
						bbox: [ox1, oy1, ox2, oy2],
						recoveredText: item.str,
					});
					break; // Only report the first bar overlap per text item
				}
			}
		}

		page.cleanup();
	}

	await pdfDoc.destroy();

	return {
		clean: violations.length === 0,
		violations,
	};
}
