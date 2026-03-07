import { API, useAPI, useHydrate, type APIStore } from "@lib/hooks/useAPI.solid";
import { loadScript } from "@utilities/scripts";
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import Spinner from "../other/Spinner.solid";

type TotalsTable = {
	total_registrations: number;
};

const firstYear = 2023;
const SCHOOL_YEAR_START_MONTH = 7; // August (0-indexed)
const SCHOOL_YEAR_START_DAY = 25;

const getAcademicYearStart = (date = new Date()) => {
	const month = date.getMonth();
	const day = date.getDate();
	const year = date.getFullYear();
	const hasStartedCurrentSchoolYear =
		month > SCHOOL_YEAR_START_MONTH ||
		(month === SCHOOL_YEAR_START_MONTH && day >= SCHOOL_YEAR_START_DAY);
	return hasStartedCurrentSchoolYear ? year : year - 1;
};

const currentAcademicYear = getAcademicYearStart();
const years = new Array<number>(Math.max(currentAcademicYear - firstYear + 1, 1))
	.fill(1)
	.map((_, i) => firstYear + i);

export default function TotalsTable() {
	const [store, setStore] = createStore<APIStore>({});
	const apiHook = useAPI(setStore);
	let growthCanvas: HTMLCanvasElement | undefined;
	let growthChartInstance: { destroy: () => void } | null = null;
	const [isDarkMode, setIsDarkMode] = createSignal(false);
	let themeObserver: MutationObserver | undefined;

	onMount(() => {
		const root = document.documentElement;
		setIsDarkMode(root.classList.contains("dark"));
		themeObserver = new MutationObserver(() => {
			setIsDarkMode(root.classList.contains("dark"));
		});
		themeObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
	});

	useHydrate(() => {
		apiHook(API.Registrations.getTotalByYear);
		apiHook(API.Registrations.get, { UrlArgs: { year: getAcademicYearStart() } });
	});

	const growthChart = createMemo(() => {
		const totals = store[API.Registrations.getTotalByYear];
		if (!totals) return { labels: [] as string[], values: [] as number[], lastValue: 0 };

		const values = years.map((year) => totals[year] || 0);
		const labels = years.map(
			(year) => `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`,
		);
		return { labels, values, lastValue: values.at(-1) || 0 };
	});

	const recentGrowth = createMemo(() => {
		const { labels, values } = growthChart();
		if (!labels.length) return [] as { label: string; total: number; yoy: number | null }[];

		const start = Math.max(labels.length - 3, 0);
		const items = labels.slice(start).map((label, idx) => {
			const valueIndex = start + idx;
			const total = values[valueIndex] || 0;
			const prev = values[valueIndex - 1];
			const yoy =
				typeof prev === "number" && prev > 0
					? ((total - prev) / prev) * 100
					: typeof prev === "number" && prev === 0
						? total > 0
							? 100
							: 0
						: null;

			return { label, total, yoy };
		});

		return items.reverse();
	});

	createEffect(async () => {
		const chartData = growthChart();
		const darkMode = isDarkMode();
		if (!growthCanvas || !chartData.labels.length) return;

		await loadScript(
			"https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js",
			() => !!(window as any).Chart,
		);

		const Chart = (window as any).Chart;
		const ctx = growthCanvas.getContext("2d");
		if (!Chart || !ctx) return;

		if (growthChartInstance) growthChartInstance.destroy();

		growthChartInstance = new Chart(ctx, {
			type: "line",
			data: {
				labels: chartData.labels,
				datasets: [
					{
						label: "Σύνολο εγγραφών",
						data: chartData.values,
						borderColor: darkMode ? "rgb(248, 113, 113)" : "rgb(127, 29, 29)",
						backgroundColor: darkMode
							? "rgba(248, 113, 113, 0.2)"
							: "rgba(127, 29, 29, 0.15)",
						pointBackgroundColor: darkMode ? "rgb(252, 165, 165)" : "rgb(127, 29, 29)",
						pointBorderColor: darkMode ? "rgb(26,26,26)" : "rgb(255,255,255)",
						pointRadius: 3,
						tension: 0.3,
						fill: true,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						display: false,
					},
					tooltip: {
						displayColors: false,
						backgroundColor: darkMode
							? "rgba(17, 24, 39, 0.95)"
							: "rgba(127, 29, 29, 0.95)",
						titleColor: "rgb(254, 242, 242)",
						bodyColor: "rgb(254, 242, 242)",
						callbacks: {
							title: (items: any[]) => `Σχολικό έτος ${items[0]?.label || ""}`,
							label: (ctx: any) => `${ctx.parsed?.y ?? 0} εγγραφές`,
						},
					},
				},
				scales: {
					x: {
						grid: { display: false },
						ticks: {
							color: darkMode
								? "rgba(248, 250, 252, 0.92)"
								: "rgba(127, 29, 29, 0.8)",
						},
					},
					y: {
						beginAtZero: true,
						grid: {
							color: darkMode
								? "rgba(148, 163, 184, 0.22)"
								: "rgba(127, 29, 29, 0.08)",
						},
						ticks: {
							precision: 0,
							color: darkMode
								? "rgba(248, 250, 252, 0.92)"
								: "rgba(127, 29, 29, 0.8)",
						},
					},
				},
			},
		});
	});

	onCleanup(() => {
		if (themeObserver) themeObserver.disconnect();
		if (growthChartInstance) growthChartInstance.destroy();
	});

	const summary = createMemo(() => {
		const registrations = store[API.Registrations.get] || [];
		const now = new Date();

		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		monthStart.setHours(0, 0, 0, 0);
		const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
		nextMonthStart.setHours(0, 0, 0, 0);

		const mondayOffset = (now.getDay() + 6) % 7;
		const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
		weekStart.setHours(0, 0, 0, 0);
		const nextWeekStart = new Date(weekStart);
		nextWeekStart.setDate(nextWeekStart.getDate() + 7);

		const monthCount = registrations.filter(
			(reg) => reg.date >= monthStart.getTime() && reg.date < nextMonthStart.getTime(),
		).length;
		const weekCount = registrations.filter(
			(reg) => reg.date >= weekStart.getTime() && reg.date < nextWeekStart.getTime(),
		).length;

		const monthLabel = now.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
		return {
			weekCount,
			monthCount,
			monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
		};
	});

	return (
		<Show
			when={store[API.Registrations.getTotalByYear]}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<div class="w-full h-min p-6 max-sm:p-3 grid grid-cols-1 gap-y-8 text-red-950 dark:text-red-50">
				<div class="w-full max-w-5xl justify-self-center grid grid-cols-2 max-md:grid-cols-1 gap-4">
					<div class="rounded-xl border border-red-900/20 dark:border-red-800/50 shadow-md shadow-gray-300 dark:shadow-gray-700 bg-white dark:bg-dark p-4">
						<p class="text-lg font-bold tracking-wide text-red-900/80 dark:text-red-100">
							Αυτή την εβδομάδα
						</p>
						<p class="text-3xl font-bold text-red-900 dark:text-red-50 mt-1">
							{summary().weekCount}
						</p>
						<p class="text-sm text-gray-600 dark:text-gray-300 mt-1">Νέες εγγραφές</p>
					</div>
					<div class="rounded-xl border border-red-900/20 dark:border-red-800/50 shadow-md shadow-gray-300 dark:shadow-gray-700 bg-white dark:bg-dark p-4">
						<p class="text-lg font-bold tracking-wide text-red-900/80 dark:text-red-100">
							Αυτόν τον μήνα
						</p>
						<p class="text-3xl font-bold text-red-900 dark:text-red-50 mt-1">
							{summary().monthCount}
						</p>
						<p class="text-sm text-gray-600 dark:text-gray-300 mt-1">
							{summary().monthLabel}
						</p>
					</div>
				</div>
				<div class="w-full max-w-5xl justify-self-center rounded-xl border border-red-900/20 dark:border-red-800/50 shadow-md shadow-gray-300 dark:shadow-gray-700 bg-white dark:bg-dark p-4">
					<p class="text-xl font-bold tracking-wide text-red-900/80 dark:text-red-100">
						Γρήγορες ενέργειες
					</p>
					<div class="mt-3 grid grid-cols-2 max-sm:grid-cols-1 gap-2 h-max">
						<a
							href="/admin/registrations"
							class="text-center px-3 py-2 text-lg rounded-md bg-red-900 text-red-50 hover:bg-red-950 transition-colors">
							Εγγραφές
						</a>
						<a
							href="/admin/announcements"
							class="text-center px-3 py-2 text-lg rounded-md bg-red-900 text-red-50 hover:bg-red-950 transition-colors">
							Ανακοινώσεις
						</a>
						<a
							href="/admin/payments"
							class="text-center px-3 py-2 text-lg rounded-md border border-red-900 dark:border-red-700 text-red-900 dark:text-red-100 hover:bg-red-50 dark:hover:bg-red-900/35 transition-colors">
							Οφειλές
						</a>
						<a
							href="/admin/teachers"
							class="text-center px-3 py-2 text-lg rounded-md border border-red-900 dark:border-red-700 text-red-900 dark:text-red-100 hover:bg-red-50 dark:hover:bg-red-900/35 transition-colors">
							Καθηγητές
						</a>
					</div>
				</div>
				<div class="w-full max-w-5xl justify-self-center rounded-xl border border-red-900/20 dark:border-red-800/50 shadow-md shadow-gray-300 dark:shadow-gray-700 bg-white dark:bg-dark p-4">
					<div class="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
						<p class="text-lg font-semibold tracking-wide text-red-900/80 dark:text-red-100">
							Εξέλιξη συνολικών εγγραφών
						</p>
						<p class="text-sm text-gray-600 dark:text-gray-300">
							Τελευταίο έτος: {growthChart().lastValue}
						</p>
					</div>
					<div class="mt-3 grid grid-cols-[minmax(320px,440px)_1fr] max-md:grid-cols-1 gap-4 items-start">
						<div class="w-full max-w-[440px] h-[190px] self-center">
							<canvas ref={growthCanvas}></canvas>
						</div>
						<div class="grid grid-cols-1 gap-2">
							<p class="text-sm font-semibold text-red-900/80 dark:text-red-100">
								Τελευταία 3 σχολικά έτη
							</p>
							{recentGrowth().map((item) => (
								<div class="rounded-md border border-red-900/15 dark:border-red-800/40 bg-red-50/40 dark:bg-red-900/20 px-3 py-2 flex items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-red-900 dark:text-red-100">
											{item.label}
										</p>
										<p class="text-xs text-gray-600 dark:text-gray-300">
											{item.total} εγγραφές
										</p>
									</div>
									<p
										class={
											"text-sm font-semibold " +
											(item.yoy === null
												? "text-gray-500 dark:text-gray-300"
												: item.yoy >= 0
													? "text-emerald-700 dark:text-emerald-400"
													: "text-red-800 dark:text-red-300")
										}>
										{item.yoy === null
											? "—"
											: `${item.yoy >= 0 ? "+" : ""}${item.yoy.toFixed(1)}%`}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</Show>
	);
}
