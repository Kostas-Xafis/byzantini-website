import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { API } from "@routes/index.client";
import { loadScript } from "@utilities/scripts";
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import Spinner from "../other/Spinner.solid";
import { cardClass } from "./Panel.solid";

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
	const hasStartedCurrentSchoolYear = month > SCHOOL_YEAR_START_MONTH || (month === SCHOOL_YEAR_START_MONTH && day >= SCHOOL_YEAR_START_DAY);
	return hasStartedCurrentSchoolYear ? year : year - 1;
};

/*
 * «Από την τελευταία σας επίσκεψη»: the dashboard remembers, per device, when it was last opened.
 * A visit is a burst of opens; only a gap of VISIT_GAP_MS starts a new one, so reloading or coming
 * back from another admin page keeps counting from the same previous visit.
 */
const VISIT_KEY = "admin-dashboard-visits";
const VISIT_GAP_MS = 30 * 60 * 1000;
const FALLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The previous visit's time (epoch ms), or null on the first visit from this device. */
function trackVisit(now = Date.now()): number | null {
	let stored: { previous: number | null; last: number } | null = null;
	try {
		const raw = JSON.parse(localStorage.getItem(VISIT_KEY) || "null");
		if (raw && typeof raw.last === "number") stored = { previous: typeof raw.previous === "number" ? raw.previous : null, last: raw.last };
	} catch {}
	const previous = stored ? (now - stored.last > VISIT_GAP_MS ? stored.last : stored.previous) : null;
	try {
		localStorage.setItem(VISIT_KEY, JSON.stringify({ previous, last: now }));
	} catch {}
	return previous;
}

const formatEuro = (amount: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
const formatVisit = (time: number) => new Date(time).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** A dashboard tile that opens the list behind its number. */
function AttentionTile(props: { href: string; icon: string; title: string; value: JSX.Element; detail: JSX.Element; calm: boolean }) {
	return (
		<a
			href={props.href}
			class={`${cardClass} group p-4 grid gap-1 content-start hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 transition-colors`}>
			<div class="flex items-center gap-2">
				<span
					class={
						"grid h-8 w-8 shrink-0 place-items-center rounded-lg " +
						(props.calm ? "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-100" : "bg-accent-soft text-brand dark:text-red-200")
					}
					aria-hidden="true">
					<i class={props.icon}></i>
				</span>
				<p class="flex-1 text-base font-bold leading-tight">{props.title}</p>
				<i class="fa-solid fa-arrow-right text-sm text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true"></i>
			</div>
			<p class="text-3xl font-bold mt-1">{props.value}</p>
			<p class="text-sm text-ink-muted">{props.detail}</p>
		</a>
	);
}

const currentAcademicYear = getAcademicYearStart();
const years = new Array<number>(Math.max(currentAcademicYear - firstYear + 1, 1)).fill(1).map((_, i) => firstYear + i);

export default function TotalsTable() {
	const [store, setStore] = createStore<APIResourceStore>({});
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

	// The listing route takes the school year as a string token (see lib/pupils/years.ts).
	const initialRegistrationsArgs = { UrlArgs: { year: String(getAcademicYearStart()) } };
	createAPIResource(API.Pupils.getTotalByYear, undefined, { cache: setStore });
	createAPIResource(API.Pupils.getEnrollmentsByYear, () => initialRegistrationsArgs, { cache: setStore });
	// Re-fetched on every mount, so edits made elsewhere show up when the admin comes back here.
	const previousVisit = trackVisit();
	const since = previousVisit ?? Date.now() - FALLBACK_WINDOW_MS;
	const [attention] = createAPIResource(API.Pupils.dashboardSummary, () => ({ UrlArgs: { since } }));

	const growthChart = createMemo(() => {
		const totals = store[API.Pupils.getTotalByYear];
		if (!totals) return { labels: [] as string[], values: [] as number[], lastValue: 0 };

		const values = years.map((year) => totals[year] || 0);
		const labels = years.map((year) => `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`);
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
				typeof prev === "number" && prev > 0 ? ((total - prev) / prev) * 100 : typeof prev === "number" && prev === 0 ? (total > 0 ? 100 : 0) : null;

			return { label, total, yoy };
		});

		return items.reverse();
	});

	createEffect(async () => {
		const chartData = growthChart();
		const darkMode = isDarkMode();
		if (!growthCanvas || !chartData.labels.length) return;

		await loadScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js", () => !!(window as any).Chart);

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
						backgroundColor: darkMode ? "rgba(248, 113, 113, 0.2)" : "rgba(127, 29, 29, 0.15)",
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
						backgroundColor: darkMode ? "rgba(17, 24, 39, 0.95)" : "rgba(127, 29, 29, 0.95)",
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
							color: darkMode ? "rgba(248, 250, 252, 0.92)" : "rgba(127, 29, 29, 0.8)",
						},
					},
					y: {
						beginAtZero: true,
						grid: {
							color: darkMode ? "rgba(148, 163, 184, 0.22)" : "rgba(127, 29, 29, 0.08)",
						},
						ticks: {
							precision: 0,
							color: darkMode ? "rgba(248, 250, 252, 0.92)" : "rgba(127, 29, 29, 0.8)",
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
		const registrations = store[API.Pupils.getEnrollmentsByYear] || [];
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

		const monthCount = registrations.filter((reg) => reg.date >= monthStart.getTime() && reg.date < nextMonthStart.getTime()).length;
		const weekCount = registrations.filter((reg) => reg.date >= weekStart.getTime() && reg.date < nextWeekStart.getTime()).length;

		const monthLabel = now.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
		return {
			weekCount,
			monthCount,
			monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
		};
	});

	return (
		<Show when={store[API.Pupils.getTotalByYear]} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<div class="w-full h-min p-6 max-sm:p-3 grid grid-cols-1 gap-y-8 text-red-950 dark:text-red-50">
				<Show when={!attention.error && attention()}>
					{(data) => {
						const yearStart = data().school_year.slice(0, 4);
						const shortYear = `${yearStart}-${data().school_year.slice(-2)}`;
						return (
							<section class="w-full max-w-5xl justify-self-center grid gap-3" aria-label="Χρειάζονται προσοχή">
								<h2 class="font-anaktoria text-2xl text-ink">Χρειάζονται προσοχή</h2>
								<div class="grid grid-cols-3 max-lg:grid-cols-1 gap-4">
									<AttentionTile
										href="/admin/pupils?review=1"
										icon="fa-solid fa-clipboard-check"
										title="Προς έλεγχο"
										value={data().needs_review}
										detail={data().needs_review === 1 ? "μαθητής στο Μαθητολόγιο" : "μαθητές στο Μαθητολόγιο"}
										calm={data().needs_review === 0}
									/>
									<AttentionTile
										href={`/admin/registrations?year=${yearStart}`}
										icon="fa-solid fa-euro-sign"
										title={`Οφειλές ${shortYear}`}
										value={formatEuro(data().owing.amount)}
										detail={
											data().owing.enrollments === 0
												? "Δεν υπάρχουν ανεξόφλητες εγγραφές"
												: `${data().owing.enrollments} ${data().owing.enrollments === 1 ? "εγγραφή" : "εγγραφές"} · ${data().owing.pupils} ${data().owing.pupils === 1 ? "μαθητής" : "μαθητές"}`
										}
										calm={data().owing.enrollments === 0}
									/>
									<AttentionTile
										href={`/admin/registrations?year=${yearStart}`}
										icon="fa-solid fa-globe"
										title="Νέες online εγγραφές"
										value={data().new_online}
										detail={
											previousVisit === null
												? "τις τελευταίες 7 ημέρες"
												: `από την τελευταία σας επίσκεψη (${formatVisit(previousVisit)})`
										}
										calm={data().new_online === 0}
									/>
								</div>
							</section>
						);
					}}
				</Show>
				<div class="w-full max-w-5xl justify-self-center grid grid-cols-2 max-md:grid-cols-1 gap-4">
					<div class={`${cardClass} p-4`}>
						<p class="text-lg font-bold tracking-wide text-red-900/80 dark:text-red-100">Αυτή την εβδομάδα</p>
						<p class="text-3xl font-bold text-red-900 dark:text-red-50 mt-1">{summary().weekCount}</p>
						<p class="text-sm text-gray-600 dark:text-gray-300 mt-1">Νέες εγγραφές</p>
					</div>
					<div class={`${cardClass} p-4`}>
						<p class="text-lg font-bold tracking-wide text-red-900/80 dark:text-red-100">Αυτόν τον μήνα</p>
						<p class="text-3xl font-bold text-red-900 dark:text-red-50 mt-1">{summary().monthCount}</p>
						<p class="text-sm text-gray-600 dark:text-gray-300 mt-1">{summary().monthLabel}</p>
					</div>
				</div>
				<div class={`w-full max-w-5xl justify-self-center ${cardClass} p-4`}>
					<p class="text-xl font-bold tracking-wide text-red-900/80 dark:text-red-100">Γρήγορες ενέργειες</p>
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
				<div class={`w-full max-w-5xl justify-self-center ${cardClass} p-4`}>
					<div class="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
						<p class="text-lg font-semibold tracking-wide text-red-900/80 dark:text-red-100">Εξέλιξη συνολικών εγγραφών</p>
						<p class="text-sm text-gray-600 dark:text-gray-300">Τελευταίο έτος: {growthChart().lastValue}</p>
					</div>
					<div class="mt-3 grid grid-cols-[minmax(320px,440px)_1fr] max-md:grid-cols-1 gap-4 items-start">
						<div class="w-full max-w-[440px] h-[190px] self-center">
							<canvas ref={growthCanvas}></canvas>
						</div>
						<div class="grid grid-cols-1 gap-2">
							<p class="text-sm font-semibold text-red-900/80 dark:text-red-100">Τελευταία 3 σχολικά έτη</p>
							{recentGrowth().map((item) => (
								<div class="rounded-md border border-red-900/15 dark:border-red-800/40 bg-red-50/40 dark:bg-red-900/20 px-3 py-2 flex items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-red-900 dark:text-red-100">{item.label}</p>
										<p class="text-xs text-gray-600 dark:text-gray-300">{item.total} εγγραφές</p>
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
										{item.yoy === null ? "—" : `${item.yoy >= 0 ? "+" : ""}${item.yoy.toFixed(1)}%`}
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
