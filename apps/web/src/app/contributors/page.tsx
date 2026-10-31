import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = { title: "Desenvolvimento — Maestro" };
export default function ContributorsPage() {
	return (
		<BasePage
			title="Desenvolvimento do Maestro"
			description="Acompanhe esta adaptação do editor."
		>
			<p>
				O trabalho desta versão inclui o assistente Gemini, ações de edição na
				timeline e a configuração do Maestro para publicação na Vercel.
			</p>
			<a
				href={SOCIAL_LINKS.github}
				target="_blank"
				rel="noopener noreferrer"
				className="underline"
			>
				Ver código e histórico no GitHub
			</a>
		</BasePage>
	);
}
