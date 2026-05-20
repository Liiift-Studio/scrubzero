// Unit tests for content-stream text replacement utilities
import { describe, it, expect } from 'vitest';
import { replaceTextInStream } from './content-stream.js';

/** Helper to convert a string to Uint8Array */
function enc(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

/** Helper to convert Uint8Array back to string */
function dec(b: Uint8Array): string {
	return new TextDecoder().decode(b);
}

describe('replaceTextInStream', () => {
	it('replaces content inside literal string arguments with spaces', () => {
		const stream = enc('BT (Hello World) Tj ET');
		const result = dec(replaceTextInStream(stream, 'Hello World'));
		// The content between parens should be all spaces
		expect(result).toBe('BT (           ) Tj ET');
	});

	it('preserves total byte length of the stream', () => {
		const stream = enc('BT (Sensitive) Tj ET');
		const result = replaceTextInStream(stream, 'Sensitive');
		expect(result.length).toBe(stream.length);
	});

	it('handles nested balanced parentheses', () => {
		const stream = enc('(outer (inner) text) Tj');
		const result = dec(replaceTextInStream(stream, ''));
		// All content between outer parens replaced with spaces
		expect(result).toBe('(                  ) Tj');
	});

	it('handles backslash-escaped characters inside strings', () => {
		const stream = enc('(escaped \\) paren) Tj');
		const result = replaceTextInStream(stream, '');
		// Length must be preserved
		expect(result.length).toBe(stream.length);
	});

	it('replaces hex string arguments with zeros', () => {
		// <48656c6c6f> is "Hello" in hex
		const stream = enc('BT <48656c6c6f> Tj ET');
		const result = dec(replaceTextInStream(stream, ''));
		expect(result).toBe('BT <0000000000> Tj ET');
	});

	it('does not treat PDF dictionary delimiters << >> as hex strings', () => {
		const stream = enc('<</Type /Page>>');
		const result = dec(replaceTextInStream(stream, ''));
		// Dictionary should remain unchanged — << is not a hex string
		expect(result).toBe('<</Type /Page>>');
	});

	it('handles multiple string arguments in one stream', () => {
		const stream = enc('(First) Tj (Second) Tj');
		const result = dec(replaceTextInStream(stream, ''));
		expect(result).toBe('(     ) Tj (      ) Tj');
	});

	it('handles empty string arguments', () => {
		const stream = enc('() Tj');
		const result = dec(replaceTextInStream(stream, ''));
		expect(result).toBe('() Tj');
		expect(result.length).toBe(stream.length);
	});

	it('returns an identical buffer when there are no string arguments', () => {
		const stream = enc('q 1 0 0 1 100 700 cm Q');
		const result = replaceTextInStream(stream, '');
		expect(result).toEqual(stream);
	});
});
