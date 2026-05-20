// Unit tests for verify() function
import { describe, it, expect } from 'vitest';
import { verify } from './verify.js';
import { PDFDocument, rgb } from 'pdf-lib';

/** Build a minimal single-page PDF with no content as an ArrayBuffer */
async function emptyPdf(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const bytes = await doc.save();
	// slice(0) ensures we get an owned copy — the original buffer may be detached by pdfjs
	return bytes.buffer.slice(0) as ArrayBuffer;
}

/** Build a PDF with a filled black rectangle covering part of the page */
async function pdfWithFilledRect(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([612, 792]);
	// Draw a solid black redaction bar in the middle of the page
	page.drawRectangle({
		x: 100,
		y: 350,
		width: 200,
		height: 20,
		color: rgb(0, 0, 0),
		borderWidth: 0,
	});
	const bytes = await doc.save();
	// slice(0) ensures we get an owned copy — the original buffer may be detached by pdfjs
	return bytes.buffer.slice(0) as ArrayBuffer;
}

describe('verify', () => {
	it('returns clean: true for a minimal empty PDF', async () => {
		const pdf = await emptyPdf();
		const result = await verify(pdf);
		expect(result.clean).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it('returns clean: true for a PDF that only has a filled rectangle (no text)', async () => {
		const pdf = await pdfWithFilledRect();
		const result = await verify(pdf);
		expect(result.clean).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it('returns a VerificationResult with the expected shape', async () => {
		const pdf = await emptyPdf();
		const result = await verify(pdf);
		expect(typeof result.clean).toBe('boolean');
		expect(Array.isArray(result.violations)).toBe(true);
	});
});
