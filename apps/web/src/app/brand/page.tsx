import Image from "next/image";
import { BasePage } from "@/app/base-page";
import { DEFAULT_LOGO_URL } from "@/site/brand";

export default function BrandPage() {
	return (
		<BasePage
			title="Identidade do Maestro"
			description="Nome e símbolo usados nesta versão do editor."
		>
			<div className="flex flex-col items-start gap-6 rounded-xl border p-8">
				<div className="flex items-center gap-4">
					<Image
						src={DEFAULT_LOGO_URL}
						alt="Símbolo do Maestro"
						width={64}
						height={64}
						className="invert dark:invert-0"
					/>
					<span className="text-4xl font-semibold tracking-tight">Maestro</span>
				</div>
				<p className="text-muted-foreground">
					Edição de vídeo com um assistente de IA que trabalha na timeline.
				</p>
				<a
					href={DEFAULT_LOGO_URL}
					download="maestro-logo.svg"
					className="underline underline-offset-4"
				>
					Baixar símbolo SVG
				</a>
			</div>
		</BasePage>
	);
}
