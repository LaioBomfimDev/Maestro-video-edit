"use client";
import { useEffect, useState } from "react";
import { Activity, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadEditingEngine, type EditingEngine } from "@/editing/engine";
import {
	useUsageStore,
	usageScope,
	EMPTY_PROFILE,
	type UsageLimits,
} from "../usage-store";
import { toast } from "sonner";

const pacific = new Intl.DateTimeFormat("en-CA", {
	timeZone: "America/Los_Angeles",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});
const number = new Intl.NumberFormat("pt-BR");
const emptyLimits: UsageLimits = { rpm: 0, tpm: 0, rpd: 0 };

export function GeminiQuota({ apiKey }: { apiKey: string }) {
	const [resolvedScope, setScope] = useState<{
		source: string;
		id: string;
	} | null>(null);
	const scope = resolvedScope?.source === apiKey ? resolvedScope.id : null;
	const [engine, setEngine] = useState<EditingEngine | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [chosen, setChosen] = useState("");
	const profiles = useUsageStore((s) => s.profiles);
	const persistenceFailed = useUsageStore((s) => s.persistenceFailed);
	useEffect(() => {
		let active = true;
		useUsageStore.getState().hydrate();
		void usageScope(apiKey)
			.then((value) => {
				if (active) setScope({ source: apiKey, id: value });
			})
			.catch(() => {
				if (active) setLoadError(true);
			});
		return () => {
			active = false;
		};
	}, [apiKey]);
	useEffect(() => {
		let active = true;
		void loadEditingEngine()
			.then((value) => {
				if (active) setEngine(value);
			})
			.catch(() => {
				if (active) setLoadError(true);
			});
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => {
			active = false;
			clearInterval(timer);
		};
	}, []);
	const profile = scope ? (profiles[scope] ?? EMPTY_PROFILE) : EMPTY_PROFILE;
	const models = [
		...new Set([
			...profile.attempts.map((a) => a.model),
			...Object.keys(profile.limits),
		]),
	];
	const model = models.includes(chosen) ? chosen : (models.at(-1) ?? "");
	const attempts = profile.attempts.filter((a) => a.model === model);
	const limits = profile.limits[model] ?? emptyLimits;
	const today = pacific.format(new Date(now));
	const metrics = Array.from({ length: 7 }, () => 0);
	if (engine)
		for (const a of attempts) {
			const sameDay = pacific.format(new Date(a.at)) === today ? 1 : 0;
			for (let field = 0; field < metrics.length; field++)
				metrics[field] = engine.quota_accumulate(
					field,
					metrics[field],
					a.at,
					now,
					sameDay,
					a.inputTokens ?? -1,
					a.totalTokens ?? -1,
					a.status,
				);
		}

	const latest = attempts.at(-1);
	const seconds =
		latest?.retryAfterSeconds === undefined
			? null
			: Math.max(
					0,
					Math.ceil(
						(latest.receivedAt + latest.retryAfterSeconds * 1000 - now) / 1000,
					),
				);
	const remainder = ({
		limit,
		used,
		incomplete = 0,
	}: {
		limit: number;
		used: number;
		incomplete?: number;
	}) => {
		const value = engine?.quota_remaining(limit, used, incomplete);
		return value !== undefined && Number.isFinite(value)
			? number.format(value)
			: "Não informado";
	};
	const known = (value: number) => (engine ? number.format(value) : "—");
	return (
		<section
			className="rounded-xl border bg-accent/40 p-4 flex flex-col gap-3"
			aria-label="Cota e uso Gemini"
		>
			<div className="flex items-center justify-between gap-2">
				<h3 className="flex items-center gap-2 text-sm font-medium">
					<Activity className="size-4" />
					Cota e uso ao vivo
				</h3>
				<span className="text-[10px] text-muted-foreground">Nesta aba</span>
			</div>
			<div>
				<p className="text-xs text-muted-foreground">Cota oficial restante</p>
				<p className="text-sm font-medium">Não informado pela API de geração</p>
				<a
					className="text-xs underline inline-flex gap-1 items-center"
					href="https://aistudio.google.com/rate-limit?timeRange=last-28-days"
					target="_blank"
					rel="noopener noreferrer"
				>
					Ver cota oficial no AI Studio <ExternalLink className="size-3" />
				</a>
			</div>
			<p className="text-[11px] text-muted-foreground">
				O Google informa consumo por resposta, mas não um saldo global nesta
				integração. Os limites são compartilhados pelo projeto. Uso de outras
				abas, apps e chaves não aparece aqui.
			</p>
			{models.length > 0 && (
				<label htmlFor="quota-model" className="text-xs flex flex-col gap-1">
					Modelo
					<select
						id="quota-model"
						className="w-full rounded-md border bg-background p-2 text-xs"
						value={model}
						onChange={(e) => setChosen(e.target.value)}
					>
						{models.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</label>
			)}
			<div className="grid grid-cols-2 gap-2" role="status" aria-live="polite">
				<Metric label="Chamadas / último minuto" value={known(metrics[0])} />
				<Metric
					label="Tokens de entrada conhecidos / min"
					value={known(metrics[1])}
					note={
						metrics[4] > 0
							? `${metrics[4]} chamada(s) sem tokens informados`
							: undefined
					}
				/>
				<Metric label="Chamadas registradas hoje" value={known(metrics[2])} />
				<Metric
					label="Tokens totais conhecidos hoje"
					value={known(metrics[3])}
					note={
						metrics[5] > 0
							? `${metrics[5]} resposta(s) sem consumo informado`
							: undefined
					}
				/>
			</div>
			{latest && (
				<p
					className={`text-xs ${latest.status === 429 ? "text-amber-600" : latest.status >= 400 || latest.status === 0 ? "text-destructive" : "text-emerald-600"}`}
				>
					{latest.status === 429
						? `Limite detectado pelo Google (429). ${seconds !== null && seconds > 0 ? `Nova tentativa sugerida em ${seconds}s.` : seconds === 0 ? "O prazo sugerido passou; a disponibilidade depende do Google." : "Consulte os limites no AI Studio."}`
						: latest.status === 0
							? "Última chamada sem confirmação do provedor."
							: latest.status < 300
								? "Última resposta do Google recebida com sucesso."
								: `Última resposta do Google: erro ${latest.status}.`}
				</p>
			)}
			{!latest && (
				<p className="text-xs text-muted-foreground">
					Aguardando uma geração com esta chave. Os contadores começam a
					registrar o uso a partir desta versão.
				</p>
			)}
			<p className="text-[10px] text-muted-foreground">
				Atualiza após cada resposta; a janela de 1 minuto se recalcula a cada
				segundo. Sem consultas que geram tokens. O dia segue o fuso do Pacífico
				(Google). Uma mensagem pode gerar várias chamadas.
			</p>
			{scope && model && (
				<details className="border-t pt-2">
					<summary className="text-xs cursor-pointer">
						Estimar restantes com meus limites
					</summary>
					<LimitsEditor
						key={`${scope}:${model}`}
						scope={scope}
						model={model}
						initial={limits}
					/>
				</details>
			)}
			{Object.values(limits).some((v) => v > 0) && (
				<div className="border-t pt-2">
					<h4 className="text-xs font-medium">Estimativa restante local</h4>{" "}
					<div className="grid grid-cols-1 gap-1 mt-2 text-xs">
						<span>
							Requisições restantes / minuto:{" "}
							<strong>
								{remainder({
									limit: limits.rpm,
									used: metrics[0],
									incomplete: profile.truncated ? 1 : 0,
								})}
							</strong>
						</span>
						<span>
							Tokens de entrada restantes / minuto:{" "}
							<strong>
								{remainder({
									limit: limits.tpm,
									used: metrics[1],
									incomplete: metrics[4] > 0 || profile.truncated ? 1 : 0,
								})}
							</strong>
						</span>
						<span>
							Requisições restantes hoje:{" "}
							<strong>
								{remainder({
									limit: limits.rpd,
									used: metrics[2],
									incomplete: profile.truncated ? 1 : 0,
								})}
							</strong>
						</span>
					</div>
					<p className="text-[10px] text-muted-foreground mt-2">
						Estimativa local com limites informados por você. Não representa o
						saldo oficial, crédito financeiro nem consumo fora desta aba.
					</p>
				</div>
			)}
			{latest && (
				<p className="text-[10px] text-muted-foreground">
					Última resposta:{" "}
					{new Date(latest.receivedAt).toLocaleTimeString("pt-BR")}
				</p>
			)}
			{loadError && (
				<p className="text-xs text-destructive">
					Não foi possível carregar os contadores. Reabra o painel para tentar
					novamente.
				</p>
			)}
			{(profile.truncated || persistenceFailed) && (
				<p className="text-xs text-amber-600">
					Registro parcial:{" "}
					{profile.truncated
						? "o histórico local atingiu o limite."
						: "o navegador não permitiu salvar o uso desta sessão."}{" "}
					Consulte a cota oficial.
				</p>
			)}
		</section>
	);
}
function Metric({
	label,
	value,
	note,
}: {
	label: string;
	value: string;
	note?: string;
}) {
	return (
		<div className="rounded-lg border bg-background p-2">
			<p className="text-[10px] text-muted-foreground">{label}</p>
			<p className="text-lg font-semibold tabular-nums">{value}</p>
			{note && <p className="text-[10px] text-amber-600">{note}</p>}
		</div>
	);
}
function LimitsEditor({
	scope,
	model,
	initial,
}: {
	scope: string;
	model: string;
	initial: UsageLimits;
}) {
	const [rpm, setRpm] = useState(initial.rpm ? String(initial.rpm) : "");
	const [tpm, setTpm] = useState(initial.tpm ? String(initial.tpm) : "");
	const [rpd, setRpd] = useState(initial.rpd ? String(initial.rpd) : "");
	const save = () => {
		const values = { rpm: Number(rpm), tpm: Number(tpm), rpd: Number(rpd) };
		if (
			Object.values(values).some(
				(v) => !Number.isSafeInteger(v) || v < 0 || v > 1e12,
			)
		) {
			toast.error(
				"Informe limites inteiros válidos; deixe em branco o que não souber.",
			);
			return;
		}
		useUsageStore.getState().setLimits({ scope, model, limits: values });
		toast.success("Limites locais atualizados.");
	};
	return (
		<div className="flex flex-col gap-2 mt-2">
			<p className="text-[10px] text-muted-foreground">
				Copie os limites deste modelo no AI Studio. Deixe em branco o que não
				souber. Isso não altera a cota no Google.
			</p>
			<div className="grid grid-cols-3 gap-2">
				{[
					{ id: "rpm", label: "Req./min", value: rpm, set: setRpm },
					{ id: "tpm", label: "Tokens entrada/min", value: tpm, set: setTpm },
					{ id: "rpd", label: "Req./dia", value: rpd, set: setRpd },
				].map((f) => (
					<label
						key={f.id}
						className="text-[10px] flex flex-col gap-1"
						htmlFor={`quota-${f.id}`}
					>
						{f.label}
						<Input
							id={`quota-${f.id}`}
							type="number"
							min="0"
							step="1"
							placeholder="Não sei"
							value={f.value}
							onChange={(e) => f.set(e.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									save();
								}
							}}
						/>
					</label>
				))}
			</div>
			<Button size="sm" variant="outline" onClick={save}>
				Salvar limites para estimativa
			</Button>
		</div>
	);
}
