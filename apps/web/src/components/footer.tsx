import Link from "next/link";
import Image from "next/image";
import { DEFAULT_LOGO_URL } from "@/site/brand";
import { SOCIAL_LINKS } from "@/site/social";

export function Footer() {
	return (
		<footer className="bg-background border-t">
			<div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 py-10 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<Link href="/" className="mb-3 flex items-center gap-2">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="Maestro"
							width={28}
							height={28}
							className="invert dark:invert-0"
						/>
						<span className="text-lg font-semibold">Maestro</span>
					</Link>
					<p className="text-muted-foreground text-sm">
						Sua timeline. Seu assistente de IA.
					</p>
				</div>
				<nav
					aria-label="Links do Maestro"
					className="text-muted-foreground flex flex-wrap gap-4 text-sm"
				>
					<Link href="/privacy">Privacidade</Link>
					<Link href="/terms">Termos de uso</Link>
					<Link href="/brand">Identidade</Link>
					<a
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a
						href={`${SOCIAL_LINKS.github}/issues`}
						target="_blank"
						rel="noopener noreferrer"
					>
						Contato
					</a>
				</nav>
			</div>
		</footer>
	);
}
