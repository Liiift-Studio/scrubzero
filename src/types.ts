// All public TypeScript types and interfaces for pdf-redact

/**
 * A rectangular region on a PDF page to be redacted.
 * Coordinates are in PDF user-space units (points), measured from the top-left of the page.
 */
export interface RedactionRegion {
	/** 1-indexed page number */
	page: number;
	/** X coordinate of the left edge of the region (PDF units from page left) */
	x: number;
	/** Y coordinate of the top edge of the region (PDF units from page top) */
	y: number;
	/** Width of the region in PDF units */
	width: number;
	/** Height of the region in PDF units */
	height: number;
	/** RGB fill color for the redaction bar, each channel 0–1. Default: [0, 0, 0] (black) */
	color?: [number, number, number];
	/** Optional label rendered inside the redaction bar when addRedactionMarkers is true */
	label?: string;
}

/**
 * A text search pattern used to locate and redact matching content across a PDF.
 */
export interface SearchPattern {
	/** RegExp or literal string to match against extracted text */
	pattern: RegExp | string;
	/** Limit the search to specific 1-indexed page numbers. Default: all pages */
	pages?: number[];
	/** RGB fill color for matched redaction bars, each channel 0–1. Default: [0, 0, 0] */
	color?: [number, number, number];
	/** Optional label for redaction markers */
	label?: string;
}

/**
 * Options that control redaction behavior.
 */
export interface RedactOptions {
	/** Flatten existing annotations before redacting. Default: true */
	flattenAnnotations?: boolean;
	/** Wipe DocInfo dictionary and XMP metadata stream. Default: true */
	sanitizeMetadata?: boolean;
	/** Render a visible "REDACTED" label inside each redaction bar. Default: false */
	addRedactionMarkers?: boolean;
}

/**
 * The result returned by redact() and searchAndRedact().
 */
export interface RedactResult {
	/** The redacted PDF as a Uint8Array ready to write to disk or stream */
	pdf: Uint8Array;
	/** Total number of regions that were redacted */
	redactedCount: number;
	/** Sorted list of 1-indexed page numbers that had at least one redaction */
	pagesAffected: number[];
}

/**
 * Internal representation of a region after coordinate normalisation.
 * All values are in PDF user-space points with origin at the bottom-left (PDF convention).
 */
export interface NormalizedRegion {
	page: number;
	/** Left edge of the region (PDF origin bottom-left) */
	xMin: number;
	/** Bottom edge of the region (PDF origin bottom-left) */
	yMin: number;
	/** Right edge of the region */
	xMax: number;
	/** Top edge of the region */
	yMax: number;
	color: [number, number, number];
	label: string | undefined;
}

/**
 * A single extracted text item from pdfjs-dist, normalised for internal use.
 */
export interface TextItem {
	/** The text string */
	str: string;
	/** 1-indexed page number */
	page: number;
	/** Left edge in PDF user-space (bottom-left origin) */
	x: number;
	/** Bottom edge in PDF user-space (bottom-left origin) */
	y: number;
	/** Width in PDF user-space units */
	width: number;
	/** Height in PDF user-space units */
	height: number;
}
