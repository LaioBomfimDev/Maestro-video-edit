import type { Metadata } from "next";
import { SITE_INFO, SITE_URL } from "@/site/brand";

export const baseMetaData: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: SITE_INFO.title,
	description: SITE_INFO.description,
	openGraph: {
		title: SITE_INFO.title,
		description: SITE_INFO.description,
		url: SITE_URL,
		siteName: SITE_INFO.title,
		locale: "pt_BR",
		type: "website",
		images: [
			{
				url: SITE_INFO.openGraphImage,
				width: 1200,
				height: 630,
				alt: "Maestro",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: SITE_INFO.title,
		description: SITE_INFO.description,
		images: [SITE_INFO.twitterImage],
	},
	robots: { index: true, follow: true },
	icons: {
		icon: [{ url: SITE_INFO.favicon, type: "image/svg+xml" }],
		shortcut: [SITE_INFO.favicon],
		apple: [SITE_INFO.favicon],
	},
	appleWebApp: { capable: true, title: SITE_INFO.title },
	manifest: "/manifest.json",
};
