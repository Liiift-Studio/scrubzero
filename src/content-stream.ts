// Core PDF content-stream text removal utilities — length-preserving byte replacement

import type { NormalizedRegion } from './types.js';

/** ASCII codes used during stream parsing */
const LPAREN = 0x28; // (
const RPAREN = 0x29; // )
const BACKSLASH = 0x5c; // \
const LANGLE = 0x3c; // <
const RANGLE = 0x3e; // >
const SPACE = 0x20; // space

/**
 * Replace all literal PDF string arguments `(text)` in a content stream with
 * space characters of equal byte length.  This preserves the total byte count
 * of the stream so the xref table remains valid.
 *
 * Handles balanced parentheses and backslash escape sequences correctly.
 */
function replaceLiteralStrings(bytes: Uint8Array): Uint8Array {
	const out = new Uint8Array(bytes);
	const len = out.length;
	let i = 0;

	while (i < len) {
		if (out[i] === LPAREN) {
			// Walk forward to find the matching closing paren, respecting escapes
			// and nested balanced parens.
			let depth = 1;
			let j = i + 1;
			while (j < len && depth > 0) {
				if (out[j] === BACKSLASH) {
					// Skip the escaped character — don't treat it as a paren
					j += 2;
					continue;
				}
				if (out[j] === LPAREN) depth++;
				else if (out[j] === RPAREN) depth--;
				j++;
			}
			// Replace bytes i+1 … j-2 (the content between the parens) with spaces
			for (let k = i + 1; k < j - 1; k++) {
				out[k] = SPACE;
			}
			i = j;
		} else {
			i++;
		}
	}

	return out;
}

/**
 * Replace all hex string arguments `<hexdata>` in a content stream with
 * the same number of '0' bytes.  Hex strings encode each byte as two hex
 * digits so replacing with '00' pairs is length-preserving.
 */
function replaceHexStrings(bytes: Uint8Array): Uint8Array {
	const out = new Uint8Array(bytes);
	const len = out.length;
	let i = 0;

	while (i < len) {
		if (out[i] === LANGLE) {
			if (out[i + 1] === LANGLE) {
				// PDF dictionary delimiter `<<…>>` — skip past the matching `>>`
				i += 2; // move past <<
				let depth = 1;
				while (i < len && depth > 0) {
					if (out[i] === LANGLE && out[i + 1] === LANGLE) {
						depth++;
						i += 2;
					} else if (out[i] === RANGLE && out[i + 1] === RANGLE) {
						depth--;
						i += 2;
					} else {
						i++;
					}
				}
			} else {
				// Hex string `<hexdata>` — replace content with '0' characters
				let j = i + 1;
				while (j < len && out[j] !== RANGLE) j++;
				for (let k = i + 1; k < j; k++) {
					out[k] = 0x30; // '0'
				}
				i = j + 1;
			}
		} else {
			i++;
		}
	}

	return out;
}

/**
 * Replace all text-drawing string arguments in a raw PDF content stream with
 * whitespace, effectively erasing the text while preserving stream length.
 *
 * Both literal strings `(…)` and hex strings `<…>` are handled.
 * This is a conservative blanket replacement — all strings in the stream are
 * cleared.  Callers that want to selectively target specific strings should
 * use `removeTextOperatorsInRegion` instead, passing a pre-filtered stream.
 */
export function replaceTextInStream(streamBytes: Uint8Array, _textToReplace: string): Uint8Array {
	let result = replaceLiteralStrings(streamBytes);
	result = replaceHexStrings(result);
	return result;
}

/**
 * Attempt to identify and blank only those text-drawing operators whose
 * position falls within a given normalised region.
 *
 * Because tracking the current text matrix through a full content-stream
 * parser is complex, this implementation uses a heuristic: it scans for
 * text blocks (BT … ET) and blanks all string arguments within them.
 * For selective redaction callers should pre-extract only the streams that
 * contain text in the target region (guided by pdfjs-dist position data).
 *
 * The `fontMetrics` map is reserved for future use and is currently ignored.
 */
export function removeTextOperatorsInRegion(
	streamBytes: Uint8Array,
	_region: NormalizedRegion,
	_fontMetrics?: Map<string, number>,
): Uint8Array {
	// For v0.1.0 we replace all string arguments in the stream.
	// A future version can parse the text matrix to do position-gated replacement.
	let result = replaceLiteralStrings(streamBytes);
	result = replaceHexStrings(result);
	return result;
}

/**
 * Decompress a Uint8Array using the Node.js built-in zlib inflate.
 * Returns the decompressed bytes or throws on failure.
 */
export async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
	// Use Node.js native zlib via the built-in module
	const { promisify } = await import('node:util');
	const { inflateRaw, inflate: zlibInflate } = await import('node:zlib');
	const inflateRawAsync = promisify(inflateRaw);
	const zlibInflateAsync = promisify(zlibInflate);

	try {
		// Try zlib inflate first (with header)
		const result = await zlibInflateAsync(Buffer.from(compressed));
		return new Uint8Array(result);
	} catch {
		// Fall back to raw deflate
		const result = await inflateRawAsync(Buffer.from(compressed));
		return new Uint8Array(result);
	}
}

/**
 * Re-compress a Uint8Array using zlib deflate (FlateDecode compatible).
 */
export async function deflate(raw: Uint8Array): Promise<Uint8Array> {
	const { promisify } = await import('node:util');
	const { deflate: zlibDeflate } = await import('node:zlib');
	const deflateAsync = promisify(zlibDeflate);
	const result = await deflateAsync(Buffer.from(raw));
	return new Uint8Array(result);
}
