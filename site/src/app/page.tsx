// pdf-redact sandbox — live redaction demo for the pdf-redact npm package.
import RedactDemo from "@/components/RedactDemo"
import CodeBlock from "@/components/CodeBlock"
import CopyInstall from "@/components/CopyInstall"
import { version } from "../../../package.json"
import { version as siteVersion } from "../../package.json"

export const maxDuration = 60

export default function Home() {
	return (
		<main className="flex flex-col items-center px-6 py-20 gap-24">

			{/* Hero */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex flex-col gap-2">
					<p className="text-xs uppercase tracking-widest opacity-50">pdf-redact</p>
					<h1 className="text-4xl lg:text-8xl xl:text-9xl" style={{ fontFamily: "var(--font-merriweather), serif", fontVariationSettings: '"wght" 300, "opsz" 144', lineHeight: "1.05em" }}>
						True PDF<br />
						<span style={{ opacity: 0.45, fontStyle: "italic" }}>redaction.</span>
					</h1>
				</div>
				<div className="flex items-center gap-4">
					<CopyInstall pkg="pdf-redact" />
					<a href="https://github.com/Liiift-Studio/pdf-redact" className="text-sm opacity-50 hover:opacity-100 transition-opacity">GitHub</a>
					<a href="https://npmjs.com/package/pdf-redact" className="text-sm opacity-50 hover:opacity-100 transition-opacity">npm</a>
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-50 tracking-wide">
					<span>TypeScript</span><span>·</span><span>Node.js + Lambda</span><span>·</span><span>Content-stream scrubbing</span><span>·</span><span>v{version}</span>
				</div>
				<p className="text-base opacity-60 leading-relaxed max-w-xl">
					pdf-redact removes text operators from the page content stream before drawing the visual bar — no hidden layers, no recoverable text. Designed for server-side use in Node.js and AWS Lambda.
				</p>
			</section>

			{/* Sandbox demo */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-xs uppercase tracking-widest opacity-50">Sandbox</p>
					<p className="text-sm opacity-40">Upload a PDF, enter a search pattern, download the redacted result.</p>
				</div>
				<div className="rounded-xl -mx-8 px-8 py-8" style={{ background: "rgba(0,0,0,0.25)" }}>
					<RedactDemo />
				</div>
			</section>

			{/* How it works */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<p className="text-xs uppercase tracking-widest opacity-50">How it works</p>
				<div className="prose-grid grid grid-cols-1 sm:grid-cols-2 gap-12 text-sm leading-relaxed opacity-70">
					<div className="flex flex-col gap-3">
						<p className="font-semibold opacity-100 text-base">Content stream scrubbing</p>
						<p>pdfjs-dist extracts text items with their positions. For each match, pdf-redact locates the corresponding BT/ET block in the raw content stream bytes, finds the text-drawing operators, and blanks their string arguments. The glyph data is gone before the bar is drawn.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold opacity-100 text-base">Visual bar overlay</p>
						<p>After scrubbing, pdf-lib draws a filled rectangle over the region using the specified color (default black). The bar is a genuine visual layer on top of now-empty space — there is no text underneath to recover.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold opacity-100 text-base">Metadata sanitization</p>
						<p>DocInfo fields (Title, Author, Subject, Keywords, Producer, Creator) are wiped and timestamps reset to the epoch. The XMP metadata stream is removed from the document catalog. Enabled by default, disable with <code className="text-xs font-mono">sanitizeMetadata: false</code>.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold opacity-100 text-base">Audit manifest</p>
						<p>When <code className="text-xs font-mono">generateManifest: true</code>, each redaction entry is recorded with page number, bounding box, timestamp, optional redactor ID, basis code, and SHA-256 hashes of both the input and output PDF for chain-of-custody compliance.</p>
					</div>
				</div>
			</section>

			{/* Usage */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<p className="text-xs uppercase tracking-widest opacity-50">Usage</p>
				<div className="flex flex-col gap-8 text-sm">
					<div className="flex flex-col gap-3">
						<p className="opacity-50">Search and redact by text pattern</p>
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
						<p className="opacity-50">Redact specific regions by coordinate</p>
						<CodeBlock code={`import { redact } from 'pdf-redact'

const result = await redact(pdf.buffer, [
  { page: 1, x: 72, y: 140, width: 200, height: 18 },
  { page: 2, x: 72, y: 200, width: 150, height: 18, color: [0, 0, 0.5] },
])`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="opacity-50">Entity patterns — SSN, phone, email, credit card, and more</p>
						<CodeBlock code={`import { redactEntities, EntityPatterns } from 'pdf-redact'

const result = await redactEntities(pdf.buffer, [
  EntityPatterns.SSN,
  EntityPatterns.PHONE,
  EntityPatterns.EMAIL,
  EntityPatterns.CREDIT_CARD,
])`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="opacity-50">Audit manifest with FOIA exemption codes</p>
						<CodeBlock code={`const result = await redact(pdf.buffer, regions, {
  generateManifest: true,
  redactorId: 'agent-smith',
  basisCode: 'b6',               // FOIA Exemption 6
  addRedactionMarkers: true,     // print exemption code in bar
})`} />
					</div>
				</div>

				{/* Options table */}
				<div className="flex flex-col gap-3">
					<p className="text-xs opacity-50">RedactOptions</p>
					<table className="w-full text-xs">
						<thead>
							<tr className="opacity-50 text-left">
								<th className="pb-2 pr-6 font-normal">Option</th>
								<th className="pb-2 pr-6 font-normal">Default</th>
								<th className="pb-2 font-normal">Description</th>
							</tr>
						</thead>
						<tbody className="opacity-70">
							{[
								["sanitizeMetadata", "true", "Wipe DocInfo fields and remove XMP metadata stream"],
								["flattenAnnotations", "true", "Flatten annotation layers before redacting"],
								["addRedactionMarkers", "false", "Render label or exemption code inside the bar"],
								["generateManifest", "false", "Attach a JSON audit manifest with SHA-256 hashes"],
								["redactorId", "undefined", "Operator ID recorded in the manifest"],
								["basisCode", "undefined", "FOIA basis code (e.g. 'b6') rendered in the bar when markers are on"],
							].map(([opt, def, desc]) => (
								<tr key={opt} className="border-t border-white/10 hover:bg-white/5 transition-colors">
									<td className="py-2 pr-6 font-mono">{opt}</td>
									<td className="py-2 pr-6">{def}</td>
									<td className="py-2">{desc}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* Footer */}
			<footer className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6 pt-8 border-t border-white/10 text-xs">
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 opacity-50">
					<a href="https://liiift.studio" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity">
						liiift.studio
					</a>
					<a href="https://github.com/Liiift-Studio/pdf-redact" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity">
						GitHub
					</a>
					<a href="https://npmjs.com/package/pdf-redact" target="_blank" rel="noopener noreferrer" className="hover:opacity-100 transition-opacity">
						npm
					</a>
					<span className="sm:col-start-4 tabular-nums">npm v{version} · site v{siteVersion}</span>
				</div>
			</footer>

		</main>
	)
}

