"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import {
	TAB_KEYS,
	tabs,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";

export function TabBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const [showTopFade, setShowTopFade] = useState(false);
	const [showBottomFade, setShowBottomFade] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const checkScrollPosition = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;

		const { scrollTop, scrollHeight, clientHeight } = element;
		setShowTopFade(scrollTop > 0);
		setShowBottomFade(scrollTop < scrollHeight - clientHeight - 1);
	}, []);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		checkScrollPosition();
		element.addEventListener("scroll", checkScrollPosition);

		const resizeObserver = new ResizeObserver(checkScrollPosition);
		resizeObserver.observe(element);

		return () => {
			element.removeEventListener("scroll", checkScrollPosition);
			resizeObserver.disconnect();
		};
	}, [checkScrollPosition]);

	useEffect(() => {
		scrollRef.current
			?.querySelector('[aria-pressed="true"]')
			?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [activeTab]);

	return (
		<div className="relative flex min-w-0 shrink-0 border-b lg:border-b-0">
			<div
				ref={scrollRef}
				className="asset-categories scrollbar-thin relative flex max-w-full p-1 items-center justify-start gap-1 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto lg:flex-col lg:gap-0.5"
			>
				{TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					return (
						<Tooltip key={tabKey} delayDuration={10}>
							<TooltipTrigger asChild>
								<Button
									variant={activeTab === tabKey ? "secondary" : "ghost"}
									size="icon"
									aria-label={tab.label}
									aria-pressed={activeTab === tabKey}
									className={cn(
										"shrink-0",
										"h-12 w-auto px-3 flex-col gap-1 text-[10px] lg:h-8 lg:w-8 lg:px-0",
										activeTab !== tabKey && "text-muted-foreground",
									)}
									onClick={() => setActiveTab(tabKey)}
								>
									<tab.icon />
									<span className="lg:hidden">{tab.label}</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent
								side="right"
								align="center"
								variant="sidebar"
								sideOffset={8}
							>
								<div className="text-foreground text-sm leading-none font-medium">
									{tab.label}
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>

			<FadeOverlay direction="top" show={showTopFade} />
			<FadeOverlay direction="bottom" show={showBottomFade} />
		</div>
	);
}

function FadeOverlay({
	direction,
	show,
}: {
	direction: "top" | "bottom";
	show: boolean;
}) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-0 left-0 h-6 hidden lg:block",
				!show && "lg:hidden",
				direction === "top" && show
					? "from-background top-0 bg-linear-to-b to-transparent"
					: "from-background bottom-0 bg-linear-to-t to-transparent",
			)}
		/>
	);
}
