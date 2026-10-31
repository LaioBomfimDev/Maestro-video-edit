const deploymentHost =
	process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ??
	(deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");

export const SITE_INFO = {
	title: "Maestro",
	description:
		"Edite seus vídeos com um assistente de IA que executa as edições na sua timeline.",
	url: SITE_URL,
	openGraphImage: "/opengraph-image",
	twitterImage: "/opengraph-image",
	favicon: "/logos/maestro/favicon.svg",
};

export const DEFAULT_LOGO_URL = "/logos/maestro/icon.svg";
