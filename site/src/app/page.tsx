// pdf-redact sandbox — live redaction demo.
import RedactDemo from "@/components/RedactDemo"
import CodeBlock from "@/components/CodeBlock"
import CopyInstall from "@/components/CopyInstall"
import { version } from "../../../package.json"

export const maxDuration = 60

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-4 mb-10">
			<span className="text-[10px] uppercase tracking-[0.2em] shrink-0" style={{ color: "var(--ink-dim)" }}>
				{children}
			</span>
			<div className="flex-1 h-px" style={{ background: "var(--rule)" }} />
		</div>
	)
}

export default function Home() {
	return (
		<main className="max-w-2xl mx-auto w-full px-6 py-12 flex flex-col">

			{/* Document masthead */}
			<header className="mb-16">
				<div className="border-b-2 border-black pb-3 flex justify-between items-baseline">
					<span className="text-xs uppercase tracking-[0.18em]">pdf-redact</span>
					<span className="text-xs font-mono" style={{ color: "var(--ink-dim)" }}>v{version}</span>
				</div>
			</header>

			{/* Hero */}
			<section className="mb-20">
				<h1
					className="leading-[1.0] mb-6"
					style={{
						fontFamily: "var(--font-display)",
						fontSize: "clamp(3rem, 10vw, 5.5rem)",
						letterSpacing: "-0.01em",
					}}
				>
					True PDF<br />
					<span style={{ fontStyle: "italic" }}>redaction.</span>
				</h1>

				{/* The redaction bar — what pdf-redact creates */}
				<div className="h-6 bg-black w-full mb-6" aria-hidden="true" />

				<p className="text-base leading-relaxed mb-8" style={{ color: "var(--ink-dim)" }}>
					pdf-redact removes text operators from the page content stream before drawing the visual bar.
					No hidden layers. No recoverable text. Designed for server-side use in Node.js and AWS Lambda.
				</p>

				<div className="flex flex-wrap items-center gap-4">
					<CopyInstall pkg="pdf-redact" />
					<a href="https://github.com/Liiift-Studio/pdf-redact" className="text-sm transition-opacity hover:opacity-60" style={{ color: "var(--ink-dim)" }}>
						GitHub →
					</a>
					<a href="https://npmjs.com/package/pdf-redact" className="text-sm transition-opacity hover:opacity-60" style={{ color: "var(--ink-dim)" }}>
						npm →
					</a>
				</div>
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* Sandbox */}
			<section className="mb-20">
				<SectionLabel>Sandbox</SectionLabel>
				<p className="text-sm mb-6" style={{ color: "var(--ink-dim)" }}>
					Upload a PDF, enter a search pattern (plain text or <code className="font-mono text-xs bg-black/6 px-1 rounded">/regex/flags</code>), download the redacted result.
				</p>
				<RedactDemo />
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* How it works */}
			<section className="mb-20">
				<SectionLabel>How it works</SectionLabel>
				<div className="flex flex-col divide-y" style={{ borderColor: "var(--rule)" }}>
					{[
						{
							n: "01",
							label: "Content stream scrubbing",
							body: "pdfjs-dist extracts text items with positions. For each match, pdf-redact locates the BT/ET block in the raw content stream bytes, finds the text-drawing operators, and blanks their string arguments. The glyph data is gone before the bar is drawn.",
						},
						{
							n: "02",
							label: "Visual bar overlay",
							body: "After scrubbing, pdf-lib draws a filled rectangle over the region using the specified color (default black). The bar is a genuine visual layer on top of now-empty space — there is no text underneath to recover.",
						},
						{
							n: "03",
							label: "Metadata sanitization",
							body: "DocInfo fields (Title, Author, Subject, Keywords, Producer, Creator) are wiped and timestamps reset. The XMP metadata stream is removed from the document catalog. Enabled by default, disable with sanitizeMetadata: false.",
						},
						{
							n: "04",
							label: "Audit manifest",
							body: "When generateManifest: true, each redaction entry is recorded with page number, bounding box, timestamp, optional redactor ID, basis code, and SHA-256 hashes of both the input and output PDF for chain-of-custody compliance.",
						},
					].map(({ n, label, body }) => (
						<div key={n} className="py-6 flex flex-col gap-2">
							<div className="flex items-baseline gap-4">
								<span className="text-xs font-mono" style={{ color: "var(--ink-dim)" }}>{n}</span>
								<span className="text-sm font-medium">{label}</span>
							</div>
							<p className="text-sm leading-relaxed pl-8" style={{ color: "var(--ink-dim)" }}>{body}</p>
						</div>
					))}
				</div>
			</section>

			<div className="h-px mb-20" style={{ background: "var(--rule)" }} />

			{/* Usage */}
			<section className="mb-20">
				<SectionLabel>Usage</SectionLabel>
				<div className="flex flex-col gap-10">
					<div className="flex flex-col gap-3">
						<p className="text-xs" style={{ color: "var(--ink-dim)" }}>Search and redact by text pattern</p>
						<CodeBlock code={`import { searchAndRedact } from 'pdf-redact'
import { readFile, writeFile } from 'node:fs/promises'

const pdf = await readFile('document.pdf')
const result = await searchAndRedact(pdf.buffer, [
  { pattern: /John Smith/g, label: 'REDACTED' },
  { pattern: /\\d{3}-\\d{2}-\\d{4}/g, label: 'SSN' },
])

await writeFile('redacted.pdf', result.pdf)
console.log(\`\${result.redactedCount} regions redacted\`)`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs" style={{ color: "var(--ink-dim)" }}>Redact specific regions by coordinate</p>
						<CodeBlock code={`import { redact } from 'pdf-redact'

const result = await redact(pdf.buffer, [
  { page: 1, x: 72, y: 140, width: 200, height: 18 },
  { page: 2, x: 72, y: 200, width: 150, height: 18 },
])`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs" style={{ color: "var(--ink-dim)" }}>Entity patterns — SSN, phone, email, credit card, and more</p>
						<CodeBlock code={`import { redactEntities } from 'pdf-redact'

const result = await redactEntities(pdf.buffer, [
  'ssn', 'phone', 'email', 'credit-card',
])`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs" style={{ color: "var(--ink-dim)" }}>Audit manifest with FOIA exemption codes</p>
						<CodeBlock code={`const result = await redact(pdf.buffer, regions, {
  generateManifest: true,
  redactorId: 'agent-smith',
  basisCode: 'b6',           // FOIA Exemption 6
  addRedactionMarkers: true, // print exemption code in bar
})`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-xs" style={{ color: "var(--ink-dim)" }}>CLI</p>
						<CodeBlock code={`npx pdf-redact search document.pdf "John Smith" --output redacted.pdf
npx pdf-redact search document.pdf "/\\d{3}-\\d{2}-\\d{4}/g" --color #1a1a1a
npx pdf-redact entities document.pdf --types ssn,phone,email
npx pdf-redact verify redacted.pdf`} />
					</div>
				</div>

				{/* Options table */}
				<div className="mt-10 flex flex-col gap-3">
					<p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--ink-dim)" }}>RedactOptions</p>
					<table className="w-full text-xs border-collapse">
						<thead>
							<tr className="border-b" style={{ borderColor: "var(--rule)" }}>
								<th className="pb-2 pr-6 font-normal text-left" style={{ color: "var(--ink-dim)" }}>Option</th>
								<th className="pb-2 pr-6 font-normal text-left" style={{ color: "var(--ink-dim)" }}>Default</th>
								<th className="pb-2 font-normal text-left" style={{ color: "var(--ink-dim)" }}>Description</th>
							</tr>
						</thead>
						<tbody>
							{[
								["sanitizeMetadata", "true", "Wipe DocInfo fields and remove XMP metadata stream"],
								["flattenAnnotations", "true", "Flatten annotation layers before redacting"],
								["addRedactionMarkers", "false", "Render label or exemption code inside the bar"],
								["generateManifest", "false", "Attach a JSON audit manifest with SHA-256 hashes"],
								["redactorId", "undefined", "Operator ID recorded in the manifest"],
								["basisCode", "undefined", "FOIA basis code (e.g. 'b6') rendered in the bar when markers are on"],
							].map(([opt, def, desc]) => (
								<tr key={opt} className="border-b" style={{ borderColor: "var(--rule)" }}>
									<td className="py-2.5 pr-6 font-mono">{opt}</td>
									<td className="py-2.5 pr-6 font-mono" style={{ color: "var(--ink-dim)" }}>{def}</td>
									<td className="py-2.5" style={{ color: "var(--ink-dim)" }}>{desc}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* Footer */}
			<footer className="pt-10 border-t-2 border-black flex flex-col gap-6 text-xs">
				<div className="flex flex-col gap-1">
					<p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--ink-dim)" }}>Also from Liiift Studio</p>
					<a href="https://unseal.dev" className="text-sm hover:opacity-60 transition-opacity">
						unseal — Detect and remove fake PDF redactions →
					</a>
				</div>
				<div className="flex flex-wrap gap-x-6 gap-y-1" style={{ color: "var(--ink-dim)" }}>
					<a href="https://liiift.studio" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">liiift.studio</a>
					<a href="https://github.com/Liiift-Studio/pdf-redact" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">GitHub</a>
					<a href="https://npmjs.com/package/pdf-redact" target="_blank" rel="noopener noreferrer" className="hover:opacity-60 transition-opacity">npm</a>
					<span className="ml-auto font-mono">v{version}</span>
				</div>
			</footer>

		</main>
	)
}
