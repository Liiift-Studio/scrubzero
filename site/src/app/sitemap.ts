// Sitemap for pdf-redact
import type { MetadataRoute } from "next"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pdf-redact.vercel.app"

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{
			url: BASE,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 1,
		},
	]
}
