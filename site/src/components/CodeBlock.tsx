// Lightweight syntax-highlighted code block — light/document theme.
import type { ReactNode } from "react"

const KEYWORDS = new Set([
	"import", "export", "from", "const", "let", "var",
	"function", "return", "new", "default", "async", "await",
])

const TOKEN = /(\/\/[^\n]*)|(`[^`]*`|'[^']*'|"[^"]*")|\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b|([\[\]{}()<>=,;./])/g

function tokenize(code: string): ReactNode[] {
	const nodes: ReactNode[] = []
	let last = 0
	let key = 0
	TOKEN.lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = TOKEN.exec(code)) !== null) {
		if (match.index > last) {
			nodes.push(<span key={key++} style={{ opacity: 0.5 }}>{code.slice(last, match.index)}</span>)
		}

		const [full, comment, str, word, punct] = match

		if (comment) {
			nodes.push(<span key={key++} style={{ opacity: 0.4 }}>{comment}</span>)
		} else if (str) {
			nodes.push(<em key={key++} style={{ fontStyle: "normal", opacity: 0.65 }}>{str}</em>)
		} else if (word) {
			if (KEYWORDS.has(word)) {
				nodes.push(<strong key={key++} style={{ fontWeight: 600, opacity: 0.9 }}>{word}</strong>)
			} else {
				nodes.push(<span key={key++}>{word}</span>)
			}
		} else if (punct) {
			nodes.push(<span key={key++} style={{ opacity: 0.4 }}>{punct}</span>)
		}

		last = match.index + full.length
	}

	if (last < code.length) {
		nodes.push(<span key={key++} style={{ opacity: 0.5 }}>{code.slice(last)}</span>)
	}

	return nodes
}

export default function CodeBlock({ code }: { code: string }) {
	return (
		<pre
			className="rounded px-4 py-4 overflow-x-auto text-xs leading-relaxed font-mono"
			style={{ background: "var(--code-bg)" }}
		>
			<code>{tokenize(code)}</code>
		</pre>
	)
}
