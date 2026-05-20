// Public API surface for pdf-redact

export { redact } from './redact.js';
export { searchAndRedact } from './search-and-redact.js';

export type {
	RedactionRegion,
	SearchPattern,
	RedactOptions,
	RedactResult,
} from './types.js';
