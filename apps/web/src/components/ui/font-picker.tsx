"use client";

import {
	useState,
	useMemo,
	useRef,
	useEffect,
	useCallback,
	type CSSProperties,
} from "react";
import { List, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { cn } from "@/utils/ui";
import { useCompactEditor } from "@/hooks/use-compact-editor";
import { ChevronDown, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { FEATURED_FONTS, useFontPickerStore } from "@/fonts/picker-store";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

const FONT_TABS = [
	{ key: "all", label: "Todas" },
	{ key: "my-fonts", label: "Destaques" },
	{ key: "favorites", label: "Favoritas" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

const ROW_HEIGHT = 44;
const PREVIEW_SCALE = 0.8;
const MAX_LIST_HEIGHT = 288;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const compact = useCompactEditor();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const { favorites, toggleFavorite } = useFontPickerStore();
	const [loadingFont, setLoadingFont] = useState<string | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const requestVersion = useRef(0);
	const {
		atlas,
		status,
		fontNames,
		retry: handleRetry,
	} = useFontAtlas({ open });

	const filteredFonts = useMemo(() => {
		const source =
			activeTab === "favorites"
				? favorites
				: activeTab === "my-fonts"
					? FEATURED_FONTS
					: fontNames;
		if (!search) return source;
		const query = search.toLowerCase();
		return source.filter((name) => name.toLowerCase().includes(query));
	}, [fontNames, search, activeTab, favorites]);

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		filteredFonts.length * ROW_HEIGHT,
	);

	const handleOpenChange = useCallback((next: boolean) => {
		setOpen(next);
		if (!next) {
			requestVersion.current++;
			setLoadingFont(null);
			setSearch("");
			setActiveTab("all");
		}
	}, []);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			const version = ++requestVersion.current;
			setLoadingFont(family);
			if (!SYSTEM_FONTS.has(family)) {
				try {
					await loadFullFont({ family });
				} catch {
					if (version !== requestVersion.current) return;
					toast.error(
						"Não foi possível carregar essa fonte. Verifique sua conexão e tente novamente.",
					);
					setLoadingFont(null);
					return;
				}
			}
			if (version !== requestVersion.current) return;
			onValueChange?.(family);
			setLoadingFont(null);
			handleOpenChange(false);
		},
		[onValueChange, handleOpenChange],
	);

	useEffect(
		() => () => {
			requestVersion.current++;
		},
		[],
	);

	const activeTabLabel =
		FONT_TABS.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "";

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{loadingFont
							? `Carregando ${loadingFont}…`
							: (defaultValue ?? "Escolha uma fonte")}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden flex flex-col"
				align="start"
				side={compact ? "top" : "left"}
				collisionPadding={8}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						aria-label="Buscar fontes"
						placeholder={`Buscar em ${activeTabLabel}…`}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{FONT_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"px-3 py-1.5 text-xs border-b-2 -mb-px",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					))}
				</div>
				{status === "loading" && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Carregando prévias…
					</div>
				)}
				{status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8 px-4">
						<p className="text-sm text-muted-foreground text-center">
							Prévias indisponíveis. Você ainda pode escolher uma fonte abaixo.
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							Tentar novamente
						</Button>
					</div>
				)}
				{fontNames.length > 0 && filteredFonts.length === 0 && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						{activeTab === "favorites"
							? "Clique na estrela ao lado de uma fonte para salvá-la."
							: "Nenhuma fonte encontrada."}
					</div>
				)}
				{filteredFonts.length > 0 && (
					<List
						rowCount={filteredFonts.length}
						rowHeight={ROW_HEIGHT}
						overscanCount={OVERSCAN}
						rowComponent={FontRow}
						rowProps={{
							atlas,
							filteredFonts,
							selectedFont: defaultValue,
							favorites,
							toggleFavorite,
							onFontSelect: handleSelect,
						}}
						style={{ height: listHeight, width: "100%", minHeight: 0 }}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontRowProps = {
	atlas: FontAtlas | null;
	filteredFonts: string[];
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
	favorites: string[];
	toggleFavorite: (family: string) => void;
};

function FontRow({
	index,
	style,
	atlas,
	filteredFonts,
	selectedFont,
	onFontSelect,
	favorites,
	toggleFavorite,
}: RowComponentProps<FontRowProps>) {
	const fontName = filteredFonts[index];
	const entry = atlas?.fonts[fontName];
	const isSelected = fontName === selectedFont;
	const isSystemFont = SYSTEM_FONTS.has(fontName);

	return (
		<div
			style={style as CSSProperties}
			className={cn(
				"flex w-full cursor-pointer items-center gap-2 px-3 outline-hidden hover:bg-popover-hover",
				isSelected && "bg-popover-hover",
			)}
		>
			<button
				type="button"
				className="flex-1 min-w-0 overflow-hidden text-left"
				onClick={() => onFontSelect({ family: fontName })}
				aria-label={fontName}
				aria-pressed={isSelected}
			>
				{isSystemFont || !entry ? (
					<span
						className="text-xl text-foreground/85"
						style={{ fontFamily: fontName }}
					>
						{fontName}
					</span>
				) : (
					<FontSpritePreview entry={entry} />
				)}
			</button>
			<button
				type="button"
				className="p-1 shrink-0"
				onClick={() => toggleFavorite(fontName)}
				aria-label={`${favorites.includes(fontName) ? "Remover" : "Adicionar"} ${fontName} ${favorites.includes(fontName) ? "das" : "às"} favoritas`}
				aria-pressed={favorites.includes(fontName)}
			>
				<Star
					className={cn(
						"size-3.5",
						favorites.includes(fontName) && "fill-yellow-400 text-yellow-400",
					)}
				/>
			</button>
		</div>
	);
}
