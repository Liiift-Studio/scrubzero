// API route — receives a PDF and a search pattern, returns a redacted PDF as base64.
import { type NextRequest } from "next/server"

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

export async function POST(req: NextRequest) {
	let formData: FormData
	try {
		formData = await req.formData()
	} catch {
		return Response.json({ error: "Invalid request" }, { status: 400 })
	}

	const file = formData.get("pdf")
	const pattern = formData.get("pattern")
	const color = formData.get("color") // optional hex color like "#000000"

	if (!(file instanceof File)) {
		return Response.json({ error: "No PDF file provided" }, { status: 400 })
	}
	if (typeof pattern !== "string" || pattern.trim() === "") {
		return Response.json({ error: "No search pattern provided" }, { status: 400 })
	}
	if (file.size > MAX_BYTES) {
		return Response.json({ error: "File too large — maximum is 4 MB" }, { status: 413 })
	}

	// Parse the hex color into an rgb triple [0–1] if provided.
	let redactionColor: [number, number, number] | undefined
	if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
		const r = parseInt(color.slice(1, 3), 16) / 255
		const g = parseInt(color.slice(3, 5), 16) / 255
		const b = parseInt(color.slice(5, 7), 16) / 255
		redactionColor = [r, g, b]
	}

	try {
		const { searchAndRedact } = await import("pdf-redact")
		const buffer = await file.arrayBuffer()

		let searchPattern: RegExp | string = pattern.trim()
		// Wrap in regex if the user enclosed the pattern in forward slashes.
		const rxMatch = searchPattern.match(/^\/(.+)\/([gimsuy]*)$/)
		if (rxMatch) {
			try {
				searchPattern = new RegExp(rxMatch[1]!, rxMatch[2])
			} catch {
				return Response.json({ error: "Invalid regular expression" }, { status: 400 })
			}
		}

		const result = await searchAndRedact(buffer, [
			{ pattern: searchPattern, color: redactionColor, label: "REDACTED" },
		])

		// Encode the resulting PDF as base64 for transfer.
		const base64 = Buffer.from(result.pdf).toString("base64")
		return Response.json({
			pdf: base64,
			redactedCount: result.redactedCount,
			pagesAffected: result.pagesAffected,
		})
	} catch (err) {
		console.error("pdf-redact error:", err)
		return Response.json({ error: "Redaction failed — the PDF may be malformed or encrypted" }, { status: 500 })
	}
}
