"use client"
// CookieBanner — shows once on first visit, stores choice in localStorage, signals gtag consent.

import { useState, useEffect } from "react"

const STORAGE_KEY = "analytics-consent"

export function CookieBanner() {
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		try {
			if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
		} catch {}
	}, [])

	if (!visible) return null

	const respond = (decision: "granted" | "denied") => {
		try {
			localStorage.setItem(STORAGE_KEY, decision)
		} catch {}
		setVisible(false)
		if (typeof window.gtag === "function") {
			window.gtag("consent", "update", { analytics_storage: decision })
		}
	}

	return (
		<div className="fixed bottom-0 left-0 right-0 z-50 border-t border-black/10" style={{ background: "var(--background)" }}>
			<div className="max-w-2xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm">
				<p className="text-xs leading-relaxed" style={{ color: "var(--ink-dim)" }}>
					We use anonymous analytics to understand usage. No personal data is collected or sold.
				</p>
				<div className="flex gap-3 shrink-0">
					<button
						onClick={() => respond("denied")}
						className="text-xs transition-opacity hover:opacity-60 px-2"
						style={{ color: "var(--ink-dim)" }}
					>
						Decline
					</button>
					<button
						onClick={() => respond("granted")}
						className="text-xs px-4 py-1.5 rounded transition-opacity hover:opacity-80"
						style={{ background: "var(--btn-bg)", color: "var(--btn-fg)" }}
					>
						Accept
					</button>
				</div>
			</div>
		</div>
	)
}
