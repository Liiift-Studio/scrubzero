import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
	// Prevent Next.js from bundling heavy native deps — resolve them at runtime.
	serverExternalPackages: ["pdfjs-dist", "pdf-lib", "pdf-redact"],
	turbopack: {
		root: path.resolve(__dirname, ".."),
	},
	experimental: {
		serverActions: {
			bodySizeLimit: "8mb",
		},
	},
}

export default nextConfig
