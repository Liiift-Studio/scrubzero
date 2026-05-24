"use client"
// Analytics — GA4 Consent Mode v2. Loads gtag, starts denied, upgrades on consent.

import Script from "next/script"

const GA_ID = process.env.NEXT_PUBLIC_GA_ID

declare global {
	interface Window {
		dataLayer: unknown[]
		gtag: (...args: unknown[]) => void
	}
}

export function Analytics() {
	if (!GA_ID) return null

	return (
		<>
			<Script id="gtag-consent-init" strategy="afterInteractive">{`
				window.dataLayer = window.dataLayer || [];
				function gtag(){dataLayer.push(arguments);}
				gtag('consent', 'default', {
					analytics_storage: 'denied',
					ad_storage: 'denied',
					ad_user_data: 'denied',
					ad_personalization: 'denied',
					wait_for_update: 500,
				});
				gtag('js', new Date());
				gtag('config', '${GA_ID}');
				try {
					if (localStorage.getItem('cookie-consent') === 'granted') {
						gtag('consent', 'update', { analytics_storage: 'granted' });
					}
				} catch {}
			`}</Script>
			<Script
				src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
				strategy="afterInteractive"
			/>
		</>
	)
}
