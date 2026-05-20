import type { Metadata } from "next"
import "./globals.css"
import { Inter, Instrument_Serif } from "next/font/google"
import { Analytics } from "@/components/Analytics"
import { CookieBanner } from "@/components/CookieBanner"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const instrumentSerif = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	style: ["normal", "italic"],
	variable: "--font-display",
})

export const metadata: Metadata = {
	title: "pdf-redact — True PDF content-stream redaction",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description: "pdf-redact removes text from PDF content streams before drawing the visual bar — no hidden layers, no recoverable text. Designed for Node.js and AWS Lambda.",
	keywords: ["pdf redaction", "pdf-lib", "pdfjs", "content stream", "Node.js pdf", "FOIA redaction", "npm"],
	openGraph: {
		title: "pdf-redact — True PDF content-stream redaction",
		description: "Removes text from content streams before drawing the bar. No hidden layers. Works in Node.js and Lambda.",
		url: "https://pdf-redact.vercel.app",
		siteName: "pdf-redact",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "pdf-redact — True PDF content-stream redaction",
		description: "Removes text from content streams before drawing the bar. No hidden layers.",
	},
	metadataBase: new URL("https://pdf-redact.vercel.app"),
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`h-full ${inter.variable} ${instrumentSerif.variable}`}>
			<body className="min-h-full flex flex-col">
				{children}
				<Analytics />
				<CookieBanner />
			</body>
		</html>
	)
}
