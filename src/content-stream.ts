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

/** Margin (in PDF units) used when comparing text positions to region bounds */
const POSITION_MARGIN = 10;

/**
 * Parse a decimal number from ASCII bytes starting at position `pos`.
 * Returns [value, endIndex] or null if no number starts at pos.
 */
function parseDecimal(bytes: Uint8Array, pos: number): [number, number] | null {
	const len = bytes.length;
	let i = pos;
	// Skip leading whitespace
	while (i < len && (bytes[i] === SPACE || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) {
		i++;
	}
	if (i >= len) return null;

	let negative = false;
	if (bytes[i] === 0x2d) { // '-'
		negative = true;
		i++;
	} else if (bytes[i] === 0x2b) { // '+'
		i++;
	}

	let intPart = 0;
	let hasDigits = false;
	while (i < len && bytes[i] !== undefined && bytes[i]! >= 0x30 && bytes[i]! <= 0x39) {
		intPart = intPart * 10 + (bytes[i]! - 0x30);
		hasDigits = true;
		i++;
	}

	let fracPart = 0;
	let fracScale = 1;
	if (i < len && bytes[i] === 0x2e) { // '.'
		i++;
		while (i < len && bytes[i] !== undefined && bytes[i]! >= 0x30 && bytes[i]! <= 0x39) {
			fracPart = fracPart * 10 + (bytes[i]! - 0x30);
			fracScale *= 10;
			i++;
		}
	}

	if (!hasDigits) return null;

	const value = (intPart + fracPart / fracScale) * (negative ? -1 : 1);
	return [value, i];
}

/**
 * Try to read N numbers before a given operator keyword at `opEnd`.
 * Returns the numbers array or null if not enough numbers were found.
 * Scans backward from opEnd within the current BT block starting at `blockStart`.
 */
function readNumbersBefore(
	bytes: Uint8Array,
	opEnd: number,
	count: number,
	blockStart: number,
): number[] | null {
	// Collect tokens (whitespace-separated) scanning backward from opEnd
	// This is complex to do backwards, so instead we scan forward from blockStart
	// and collect all number sequences before opEnd

	const numbers: number[] = [];
	let i = blockStart;

	while (i < opEnd) {
		// Skip whitespace
		while (i < opEnd && (bytes[i] === SPACE || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) {
			i++;
		}
		if (i >= opEnd) break;

		// Try to parse a number
		const parsed = parseDecimal(bytes, i);
		if (parsed !== null) {
			const [val, end] = parsed;
			if (end > i && end <= opEnd) {
				numbers.push(val);
				i = end;
				continue;
			}
		}

		// Skip non-numeric token (operator or string)
		// If it's a string literal, skip the whole string
		if (bytes[i] === LPAREN) {
			numbers.length = 0; // strings reset the number accumulator
			let depth = 1;
			i++;
			while (i < opEnd && depth > 0) {
				if (bytes[i] === BACKSLASH) { i += 2; continue; }
				if (bytes[i] === LPAREN) depth++;
				else if (bytes[i] === RPAREN) depth--;
				i++;
			}
			continue;
		}
		if (bytes[i] === LANGLE && bytes[i + 1] !== LANGLE) {
			numbers.length = 0;
			while (i < opEnd && bytes[i] !== RANGLE) i++;
			if (i < opEnd) i++;
			continue;
		}

		// Skip any other token (operators, names, etc.) — they reset number accumulator
		numbers.length = 0;
		while (i < opEnd && bytes[i] !== SPACE && bytes[i] !== 0x09 && bytes[i] !== 0x0a && bytes[i] !== 0x0d) {
			i++;
		}
	}

	if (numbers.length < count) return null;
	// Return the last `count` numbers
	return numbers.slice(numbers.length - count);
}

/**
 * Check if two ASCII bytes at position `i` in `bytes` match characters `a` and `b`,
 * and that the preceding byte is whitespace or start-of-block and the following byte is whitespace or end.
 */
function matchOp2(bytes: Uint8Array, i: number, a: number, b: number): boolean {
	if (i + 1 >= bytes.length) return false;
	if (bytes[i] !== a || bytes[i + 1] !== b) return false;
	// Check delimiter after
	const after = bytes[i + 2];
	return (
		after === undefined ||
		after === SPACE ||
		after === 0x09 ||
		after === 0x0a ||
		after === 0x0d
	);
}

/**
 * Parse a content stream and blank only those string arguments (Tj/TJ operators)
 * whose estimated text position falls within the given region.
 * Position is estimated from Tm and Td/TD operators within each BT/ET block.
 *
 * This is more precise than replaceTextInStream() which blanks all strings.
 */
export function replaceTextInRegion(
	streamBytes: Uint8Array,
	region: NormalizedRegion,
): Uint8Array {
	const out = new Uint8Array(streamBytes);
	const len = out.length;

	// State tracking across the stream
	let inTextBlock = false;
	let blockStart = 0;
	// Current text position within the BT/ET block
	let txPos = 0;
	let tyPos = 0;

	let i = 0;

	while (i < len) {
		const b = out[i];

		// Skip whitespace
		if (b === SPACE || b === 0x09 || b === 0x0a || b === 0x0d) {
			i++;
			continue;
		}

		// Detect BT (begin text block)
		if (!inTextBlock && b === 0x42 && out[i + 1] === 0x54) { // 'B', 'T'
			const after = out[i + 2];
			if (after === undefined || after === SPACE || after === 0x09 || after === 0x0a || after === 0x0d) {
				inTextBlock = true;
				blockStart = i + 2;
				txPos = 0;
				tyPos = 0;
				i += 2;
				continue;
			}
		}

		// Detect ET (end text block)
		if (inTextBlock && b === 0x45 && out[i + 1] === 0x54) { // 'E', 'T'
			const after = out[i + 2];
			if (after === undefined || after === SPACE || after === 0x09 || after === 0x0a || after === 0x0d) {
				inTextBlock = false;
				i += 2;
				continue;
			}
		}

		if (inTextBlock) {
			// Check for Tm operator (6 numbers): a b c d e f Tm
			// e = txPos, f = tyPos
			if (b === 0x54 && out[i + 1] === 0x6d) { // 'T', 'm'
				const after = out[i + 2];
				if (after === undefined || after === SPACE || after === 0x09 || after === 0x0a || after === 0x0d) {
					const nums = readNumbersBefore(out, i, 6, blockStart);
					if (nums !== null && nums.length >= 6) {
						txPos = nums[4] ?? txPos;
						tyPos = nums[5] ?? tyPos;
					}
					blockStart = i + 2;
					i += 2;
					continue;
				}
			}

			// Check for Td or TD operator (2 numbers): tx ty Td
			if (b === 0x54 && (out[i + 1] === 0x64 || out[i + 1] === 0x44)) { // 'T','d' or 'T','D'
				const after = out[i + 2];
				if (after === undefined || after === SPACE || after === 0x09 || after === 0x0a || after === 0x0d) {
					const nums = readNumbersBefore(out, i, 2, blockStart);
					if (nums !== null && nums.length >= 2) {
						txPos += nums[0] ?? 0;
						tyPos += nums[1] ?? 0;
					}
					blockStart = i + 2;
					i += 2;
					continue;
				}
			}

			// Check for T* operator (moves to next line) — equivalent to (0, -leading) Td
			// We don't know leading without parsing TL, so just leave position unchanged
			if (matchOp2(out, i, 0x54, 0x2a)) { // 'T', '*'
				blockStart = i + 2;
				i += 2;
				continue;
			}

			// Check for literal string (…) — Tj or similar operator follows
			if (b === LPAREN) {
				// Check if current position is within region
				const inRegion =
					txPos >= region.xMin - POSITION_MARGIN &&
					txPos <= region.xMax + POSITION_MARGIN &&
					tyPos >= region.yMin - POSITION_MARGIN &&
					tyPos <= region.yMax + POSITION_MARGIN;

				// Find the end of this string
				let depth = 1;
				let j = i + 1;
				while (j < len && depth > 0) {
					if (out[j] === BACKSLASH) { j += 2; continue; }
					if (out[j] === LPAREN) depth++;
					else if (out[j] === RPAREN) depth--;
					j++;
				}

				if (inRegion) {
					// Blank the string content
					for (let k = i + 1; k < j - 1; k++) {
						out[k] = SPACE;
					}
				}

				i = j;
				continue;
			}

			// Check for hex string <…> — TJ or Tj operator follows
			if (b === LANGLE && out[i + 1] !== LANGLE) {
				// Check if current position is within region
				const inRegion =
					txPos >= region.xMin - POSITION_MARGIN &&
					txPos <= region.xMax + POSITION_MARGIN &&
					tyPos >= region.yMin - POSITION_MARGIN &&
					tyPos <= region.yMax + POSITION_MARGIN;

				let j = i + 1;
				while (j < len && out[j] !== RANGLE) j++;

				if (inRegion) {
					for (let k = i + 1; k < j; k++) {
						out[k] = 0x30; // '0'
					}
				}

				i = j + 1;
				continue;
			}
		}

		i++;
	}

	return out;
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
