"use client"
// RedactDemo — upload a PDF and a search pattern; download the redacted result.

import { useState, useRef, useCallback, type DragEvent, type FormEvent } from "react"

type State =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "done"; redactedCount: number; pagesAffected: number[]; blob: Blob; filename: string }
	| { status: "error"; message: string }

export default function RedactDemo() {
	const [state, setState] = useState<State>({ status: "idle" })
	const [isDragging, setIsDragging] = useState(false)
	const [file, setFile] = useState<File | null>(null)
	const [color, setColor] = useState("#000000")
	const inputRef = useRef<HTMLInputElement>(null)

	const handleFiles = useCallback((files: FileList | null) => {
		const f = files?.[0]
		if (!f) return
		if (!f.name.endsWith(".pdf") && f.type !== "application/pdf") {
			setState({ status: "error", message: "Please upload a PDF file" })
			return
		}
		if (f.size > 4 * 1024 * 1024) {
			setState({ status: "error", message: "File too large — maximum is 4 MB" })
			return
		}
		setFile(f)
		setState({ status: "idle" })
	}, [])

	const onDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
	const onDragLeave = useCallback(() => setIsDragging(false), [])
	const onDrop = useCallback((e: DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		handleFiles(e.dataTransfer.files)
	}, [handleFiles])

	const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!file) return
		const form = new FormData(e.currentTarget)
		form.set("pdf", file)
		form.set("color", color)

		setState({ status: "loading" })
		try {
			const res = await fetch("/api/redact", { method: "POST", body: form })
			const data = await res.json() as { pdf?: string; redactedCount?: number; pagesAffected?: number[]; error?: string }
			if (!res.ok || data.error) {
				setState({ status: "error", message: data.error ?? "Redaction failed" })
			} else {
				// Convert base64 back to a Blob for download.
				const bytes = Uint8Array.from(atob(data.pdf!), c => c.charCodeAt(0))
				const blob = new Blob([bytes], { type: "application/pdf" })
				setState({
					status: "done",
					redactedCount: data.redactedCount ?? 0,
					pagesAffected: data.pagesAffected ?? [],
					blob,
					filename: file.name.replace(/\.pdf$/i, "-redacted.pdf"),
				})
			}
		} catch {
			setState({ status: "error", message: "Network error — please try again" })
		}
	}, [file, color])

	const downloadResult = useCallback(() => {
		if (state.status !== "done") return
		const url = URL.createObjectURL(state.blob)
		const a = document.createElement("a")
		a.href = url
		a.download = state.filename
		a.click()
		URL.revokeObjectURL(url)
	}, [state])

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			{/* Step 1 — drop zone */}
			<div className="flex flex-col gap-2">
				<p className="text-xs uppercase tracking-widest opacity-40">1. Upload PDF</p>
				<label
					className={`
						flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-10
						cursor-pointer transition-colors
						${isDragging ? "border-white/50 bg-white/8" : "border-white/15 hover:border-white/30 hover:bg-white/4"}
					`}
					onDragOver={onDragOver}
					onDragLeave={onDragLeave}
					onDrop={onDrop}
				>
					<input
						ref={inputRef}
						type="file"
						accept=".pdf,application/pdf"
						className="sr-only"
						onChange={e => handleFiles(e.target.files)}
					/>
					{file ? (
						<>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
								<path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
								<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
							</svg>
							<p className="text-sm font-medium">{file.name}</p>
							<p className="text-xs opacity-30">{(file.size / 1024).toFixed(0)} KB · click to replace</p>
						</>
					) : (
						<>
							<svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="opacity-40">
								<path d="M14 5v12M14 5l-4 4M14 5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
								<path d="M5 19v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
							</svg>
							<p className="text-sm opacity-60">Drop a PDF here, or <span className="opacity-100 underline underline-offset-2">browse</span></p>
							<p className="text-xs opacity-30">Max 4 MB</p>
						</>
					)}
				</label>
			</div>

			{/* Step 2 — pattern */}
			<div className="flex flex-col gap-2">
				<p className="text-xs uppercase tracking-widest opacity-40">2. Search pattern</p>
				<input
					type="text"
					name="pattern"
					required
					placeholder="e.g.  John Smith  or  /\d{3}-\d{2}-\d{4}/  for SSNs"
					className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-sm placeholder:opacity-30 focus:outline-none focus:border-white/30 transition-colors"
				/>
				<p className="text-xs opacity-30">Plain text or <code className="font-mono">/regex/flags</code> — all matches on every page will be redacted</p>
			</div>

			{/* Step 3 — color */}
			<div className="flex flex-col gap-2">
				<p className="text-xs uppercase tracking-widest opacity-40">3. Bar color (optional)</p>
				<div className="flex items-center gap-3">
					<input
						type="color"
						value={color}
						onChange={e => setColor(e.target.value)}
						className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
					/>
					<span className="text-sm font-mono opacity-50">{color}</span>
				</div>
			</div>

			{/* Submit */}
			<button
				type="submit"
				disabled={!file || state.status === "loading"}
				className="rounded-lg px-5 py-3 text-sm font-medium transition-opacity bg-white/10 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed"
			>
				{state.status === "loading" ? (
					<span className="flex items-center justify-center gap-2">
						<span className="w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
						Redacting…
					</span>
				) : "Redact PDF"}
			</button>

			{/* Error */}
			{state.status === "error" && (
				<div className="rounded-lg bg-red-950/50 border border-red-800/40 px-4 py-3 text-sm text-red-300">
					{state.message}
				</div>
			)}

			{/* Result */}
			{state.status === "done" && (
				<div className="flex flex-col gap-3 rounded-xl bg-emerald-950/40 border border-emerald-800/30 px-5 py-4">
					<div className="flex items-center gap-2">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-emerald-400 shrink-0">
							<circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
							<path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
						</svg>
						<p className="text-sm text-emerald-300 font-medium">
							{state.redactedCount} region{state.redactedCount !== 1 ? "s" : ""} redacted
							{state.pagesAffected.length > 0 && ` on page${state.pagesAffected.length !== 1 ? "s" : ""} ${state.pagesAffected.join(", ")}`}
						</p>
					</div>
					<button
						type="button"
						onClick={downloadResult}
						className="self-start rounded-lg bg-emerald-800/40 hover:bg-emerald-800/60 border border-emerald-700/40 px-4 py-2 text-sm text-emerald-300 transition-colors"
					>
						Download redacted PDF
					</button>
				</div>
			)}
		</form>
	)
}
