// Unit tests for entity-patterns module
import { describe, it, expect } from 'vitest';
import { EntityPatterns, redactEntities } from './entity-patterns.js';
import { PDFDocument } from 'pdf-lib';

/** Build a minimal single-page PDF with no content as an ArrayBuffer */
async function minimalPdf(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const bytes = await doc.save();
	// slice(0) ensures we get an owned copy — the original buffer may be detached by pdfjs
	return bytes.buffer.slice(0) as ArrayBuffer;
}

describe('EntityPatterns', () => {
	it('SSN pattern matches 123-45-6789', () => {
		const pattern = EntityPatterns.ssn.pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('My SSN is 123-45-6789.')).toBe(true);
	});

	it('SSN pattern does not match partial sequences', () => {
		const pattern = EntityPatterns.ssn.pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('12-345-6789')).toBe(false);
	});

	it('email pattern matches a valid address', () => {
		const pattern = EntityPatterns.email.pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('hello@example.com')).toBe(true);
	});

	it('email pattern matches address with plus sign', () => {
		const pattern = EntityPatterns.email.pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('user+tag@sub.domain.org')).toBe(true);
	});

	it('phone pattern matches US format', () => {
		const pattern = EntityPatterns.phone.pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('Call us at 555-867-5309')).toBe(true);
	});

	it('credit-card pattern matches Visa number', () => {
		const pattern = EntityPatterns['credit-card'].pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('4111-1111-1111-1111')).toBe(true);
	});

	it('ip-address pattern matches valid IPv4', () => {
		const pattern = EntityPatterns['ip-address'].pattern;
		const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags) : new RegExp(String(pattern), 'g');
		re.lastIndex = 0;
		expect(re.test('192.168.1.1')).toBe(true);
	});
});

describe('redactEntities', () => {
	it('runs without crashing on a minimal PDF with empty entity list', async () => {
		const pdf = await minimalPdf();
		const result = await redactEntities(pdf, []);
		expect(result.pdf).toBeInstanceOf(Uint8Array);
		expect(result.redactedCount).toBe(0);
	});

	it('runs without crashing on a minimal PDF with SSN entity type', async () => {
		const pdf = await minimalPdf();
		const result = await redactEntities(pdf, ['ssn']);
		expect(result.pdf).toBeInstanceOf(Uint8Array);
		expect(result.redactedCount).toBe(0); // No SSNs in the minimal PDF
	});

	it('runs without crashing on a minimal PDF with multiple entity types', async () => {
		const pdf = await minimalPdf();
		const result = await redactEntities(pdf, ['ssn', 'email', 'phone']);
		expect(result.pdf).toBeInstanceOf(Uint8Array);
	});
});
