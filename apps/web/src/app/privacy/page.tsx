import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import { SOCIAL_LINKS } from "@/site/social";

export const metadata: Metadata = {
	title: "Privacidade — Maestro",
	description: "Como o Maestro usa dados e integrações de IA.",
};

export default function PrivacyPage() {
	return (
		<BasePage
			title="Privacidade"
			description="Como os projetos, as chaves e o assistente funcionam no Maestro."
		>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Projetos no navegador</h2>
				<p>
					Os arquivos de mídia e os projetos de edição ficam no seu dispositivo.
					O editor usa IndexedDB e armazenamento local do navegador para manter
					projetos e preferências. Limpar esses dados pode apagar seus projetos.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Assistente Gemini</h2>
				<p>
					Ao enviar uma mensagem ao assistente, o Maestro envia ao Google
					Gemini, por meio do servidor do app, seu pedido e o contexto
					necessário da timeline. Esse contexto pode incluir nomes dos arquivos,
					textos, legendas e transcrições usados para executar a edição. Os
					arquivos brutos de vídeo e áudio não são enviados por esse chat.
				</p>
				<p>
					A chave configurada no botão Gemini fica na sessão desta aba. Ela
					passa pelo servidor do Maestro para autenticar a chamada ao Google,
					mas não é gravada no histórico da conversa nem no repositório. Remova
					a chave no mesmo botão quando quiser.
				</p>
				<p>
					Os recursos de transcrição e remoção de silêncios executam no
					navegador. Modelos de transcrição podem ser baixados na primeira
					utilização.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Serviços opcionais</h2>
				<p>
					O app é hospedado na Vercel. Gemini, busca de sons, blog, login e
					feedback dependem das integrações configuradas nesta instalação. Os
					provedores envolvidos recebem as requisições necessárias aos recursos
					que você usar.
				</p>
				<p>
					Esta versão removeu o script de analytics vinculado à instalação
					anterior.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">Contato e código</h2>
				<p>
					O código e o canal de contato desta versão estão no{" "}
					<a
						href={SOCIAL_LINKS.github}
						className="underline"
						target="_blank"
						rel="noopener noreferrer"
					>
						repositório do Maestro
					</a>
					.
				</p>
			</section>
		</BasePage>
	);
}
