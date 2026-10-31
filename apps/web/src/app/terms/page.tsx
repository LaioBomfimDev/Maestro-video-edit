import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = {
	title: "Uso do Maestro",
	description: "Informações de uso do editor e do assistente de IA.",
};

export default function TermsPage() {
	return (
		<BasePage
			title="Uso do Maestro"
			description="Informações para editar e usar o assistente."
		>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Conteúdo e projetos</h2>
				<p>
					Você é responsável pelos arquivos e conteúdos que utiliza. Os projetos
					ficam no navegador; exporte o que precisar guardar antes de limpar os
					dados do site.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Edições com IA</h2>
				<p>
					O assistente pode alterar a timeline usando seu pedido e o contexto do
					projeto. Revise o resultado antes de exportar. As edições do
					assistente entram no histórico de desfazer do editor.
				</p>
				<p>
					O uso do Gemini depende da chave configurada, da disponibilidade do
					provedor e da cota ou cobrança do projeto Google vinculado à chave.
					Criar outra chave no mesmo projeto não garante uma nova cota.
				</p>
				<p>
					Você pode trocar ou remover a chave em Assistente IA → Gemini.
					Consulte a página de privacidade para entender quais dados são
					enviados ao provedor.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Código e suporte</h2>
				<p>
					O histórico, a licença do código e o canal para reportar problemas
					estão no{" "}
					<a
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noopener noreferrer"
						className="underline"
					>
						repositório do Maestro
					</a>
					.
				</p>
			</section>
		</BasePage>
	);
}
