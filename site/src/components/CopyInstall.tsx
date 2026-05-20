"use client"
// CopyInstall — copies the npm install command to clipboard on click.

import { useState } from "react"

export default function CopyInstall({ pkg }: { pkg: string }) {
	const [copied, setCopied] = useState(false)

	const handleClick = () => {
		void navigator.clipboard.writeText(`npm install ${pkg}`).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1800)
		})
	}

	return (
		<button
			onClick={handleClick}
			className="group flex items-center gap-2 rounded px-4 py-2 text-sm font-mono transition-opacity hover:opacity-80"
			style={{ background: "var(--btn-bg)", color: "var(--btn-fg)" }}
		>
			<span style={{ opacity: 0.45 }}>$</span>
			<span>npm install {pkg}</span>
			{copied ? (
				<svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0" style={{ opacity: 0.7 }}>
					<path d="M1.5 6.5l3.5 3.5 6.5-6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
			) : (
				<svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0 opacity-40 group-hover:opacity-70 transition-opacity">
					<rect x="1" y="4" width="8" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
					<path d="M4 4V2.2A1.2 1.2 0 015.2 1h6.6A1.2 1.2 0 0113 2.2v6.6A1.2 1.2 0 0111.8 10H10" stroke="currentColor" strokeWidth="1.2"/>
				</svg>
			)}
		</button>
	)
}
