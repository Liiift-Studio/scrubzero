// OG image for pdf-redact — 1200×630 with Merriweather heading.
import { ImageResponse } from "next/og"
import { readFileSync } from "fs"
import { join } from "path"

export const alt = "pdf-redact — True PDF content-stream redaction"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
	const font = readFileSync(join(process.cwd(), "public/fonts/Merriweather.woff2"))

	return new ImageResponse(
		(
			<div
				style={{
					background: "hsl(150, 18%, 8%)",
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					padding: "80px",
					justifyContent: "space-between",
					color: "#f0ece3",
				}}
			>
				<div style={{ display: "flex", alignItems: "center" }}>
					<span style={{ fontSize: "13px", letterSpacing: "0.2em", opacity: 0.4, textTransform: "uppercase", fontFamily: "sans-serif" }}>
						pdf-redact
					</span>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
					<div
						style={{
							fontSize: "88px",
							fontFamily: "Merriweather",
							fontWeight: 300,
							lineHeight: "1.05",
						}}
					>
						True PDF
						<br />
						<span style={{ opacity: 0.42, fontStyle: "italic" }}>redaction.</span>
					</div>
					<p style={{ fontSize: "22px", opacity: 0.5, margin: 0, lineHeight: "1.5", fontFamily: "sans-serif" }}>
						Removes text from content streams before drawing the bar.
						<br />
						No hidden layers. No recoverable text. Node.js and Lambda.
					</p>
				</div>

				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
					<span style={{ fontSize: "14px", opacity: 0.35, fontFamily: "sans-serif" }}>liiift.studio</span>
					<span style={{ fontSize: "14px", opacity: 0.25, fontFamily: "monospace" }}>npm install pdf-redact</span>
				</div>
			</div>
		),
		{
			...size,
			fonts: [{ name: "Merriweather", data: font, weight: 300, style: "normal" }],
		},
	)
}
