// Unit tests for redactBatch() function
import { describe, it, expect } from 'vitest';
import { redactBatch } from './batch.js';
import type { BatchItem } from './batch.js';
import { PDFDocument } from 'pdf-lib';

/** Build a minimal single-page PDF as an ArrayBuffer */
async function minimalPdf(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const bytes = await doc.save();
	// slice(0) ensures we get an owned copy — the original buffer may be detached by pdfjs
	return bytes.buffer.slice(0) as ArrayBuffer;
}

describe('redactBatch', () => {
	it('returns results for each item in the batch', async () => {
		const pdf1 = await minimalPdf();
		const pdf2 = await minimalPdf();

		const items: BatchItem[] = [
			{
				pdf: pdf1,
				patterns: [{ pattern: /SSN:\s*\d{3}-\d{2}-\d{4}/g, label: 'SSN' }],
			},
			{
				pdf: pdf2,
				patterns: [{ pattern: /email@example\.com/g, label: 'Email' }],
			},
		];

		const results = await redactBatch(items, 2);

		expect(results).toHaveLength(2);
		expect(results[0]).toBeDefined();
		expect(results[1]).toBeDefined();
		expect(results[0]!.index).toBe(0);
		expect(results[1]!.index).toBe(1);
		expect(results[0]!.result).toBeDefined();
		expect(results[1]!.result).toBeDefined();
	});

	it('isolates errors so one failing item does not abort the batch', async () => {
		const validPdf = await minimalPdf();

		// Create an intentionally invalid PDF buffer
		const invalidPdf = new ArrayBuffer(10);
		const view = new Uint8Array(invalidPdf);
		view.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

		const items: BatchItem[] = [
			{
				pdf: validPdf,
				patterns: [{ pattern: /test/g }],
			},
			{
				pdf: invalidPdf,
				patterns: [{ pattern: /test/g }],
			},
			{
				pdf: validPdf,
				regions: [{ page: 1, x: 10, y: 10, width: 100, height: 20 }],
			},
		];

		const results = await redactBatch(items, 2);

		expect(results).toHaveLength(3);
		// The valid PDFs should succeed
		expect(results[0]!.result).toBeDefined();
		expect(results[0]!.error).toBeUndefined();
		// The invalid PDF should produce an error, not crash the batch
		expect(results[1]!.error).toBeDefined();
		expect(results[1]!.result).toBeUndefined();
		// The third item should also succeed
		expect(results[2]!.result).toBeDefined();
		expect(results[2]!.error).toBeUndefined();
	});

	it('handles an empty batch without crashing', async () => {
		const results = await redactBatch([]);
		expect(results).toHaveLength(0);
	});

	it('handles items with no regions and no patterns (passthrough)', async () => {
		const pdf = await minimalPdf();
		const items: BatchItem[] = [{ pdf }];
		const results = await redactBatch(items);
		expect(results[0]!.result).toBeDefined();
		expect(results[0]!.result?.redactedCount).toBe(0);
	});

	it('respects the concurrency limit by processing items correctly', async () => {
		const pdfs = await Promise.all(Array.from({ length: 6 }, () => minimalPdf()));
		const items: BatchItem[] = pdfs.map((pdf) => ({ pdf }));
		const results = await redactBatch(items, 3);
		expect(results).toHaveLength(6);
		expect(results.every((r) => r.result !== undefined)).toBe(true);
	});
});
