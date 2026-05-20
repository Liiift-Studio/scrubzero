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
			className="group flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-mono transition-colors"
			style={{ background: "var(--btn-bg)" }}
		>
			<span className="opacity-40">$</span>
			<span>npm install {pkg}</span>
			{copied ? (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-70 text-emerald-400 shrink-0">
					<path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
				</svg>
			) : (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-30 group-hover:opacity-70 transition-opacity shrink-0">
					<rect x="1" y="4" width="8" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
					<path d="M4 4V2.2A1.2 1.2 0 015.2 1h6.6A1.2 1.2 0 0113 2.2v6.6A1.2 1.2 0 0111.8 10H10" stroke="currentColor" strokeWidth="1.2"/>
				</svg>
			)}
		</button>
	)
}
