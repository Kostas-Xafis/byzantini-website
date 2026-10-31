import { createAPIResource } from "@hooks/createAPIResource.solid";
import { API, type APIResponse } from "@routes/index.client";
import { useNavigate } from "@solidjs/router";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import Spinner from "../other/Spinner.solid";
import { cardClass, primaryButtonClass } from "./Panel.solid";
import Icon from "@components/other/Icon.solid";
import type { IconName } from "@lib/icons";

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
const formatCount = (n: number) => new Intl.NumberFormat("el-GR").format(n);
const formatChange = (percent: number) => new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(percent) + "%";
/** "2026-2027" → "26-27" */
const shortYear = (schoolYear: string) => `${schoolYear.slice(2, 4)}-${schoolYear.slice(-2)}`;
/** Percentage change, or null when there is nothing to compare with. */
const change = (now: number, before: number | undefined) => (before ? ((now - before) / before) * 100 : null);

/**
 * Music types in `class_id` order. The bar colours are a categorical palette checked for colour-blind
 * separation on both card surfaces (white / #242424); the chart's labels never wear them.
 */
const MUSIC_TYPES = [
	{ label: "Βυζαντινή", bar: "bg-red-700 dark:bg-red-500" },
	{ label: "Παραδοσιακή", bar: "bg-emerald-600" },
	{ label: "Ευρωπαϊκή", bar: "bg-sky-600" },
] as const;

/** A dashboard tile that opens the list behind its number. */
function AttentionTile(props: { href: string; icon: IconName; title: string; value: JSX.Element; detail: JSX.Element; calm: boolean }) {
	return (
		<a
			href={props.href}
			class={`${cardClass} group p-4 grid gap-1 content-start hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink transition-colors`}>
			<div class="flex items-center gap-2">
				<span
					class={
						"grid h-8 w-8 shrink-0 place-items-center rounded-lg " +
						(props.calm ? "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-100" : "bg-accent-soft text-accent-ink")
					}
					aria-hidden="true">
					<Icon name={props.icon} />
				</span>
				<p class="flex-1 text-base font-bold leading-tight">{props.title}</p>
				<Icon name="arrow-right" class="text-sm text-ink-muted transition-transform group-hover:translate-x-0.5" />
			</div>
			<p class="text-3xl font-bold mt-1">{props.value}</p>
			<p class="text-sm text-ink-muted">{props.detail}</p>
		</a>
	);
}

/** A signed percentage with its direction spelled out by the arrow and the sign, not only the colour. */
function Change(props: { percent: number; class?: string }) {
	return (
		<span
			class={
				"inline-flex items-center gap-0.5 font-semibold tabular-nums " +
				(props.percent > 0 ? "text-emerald-700 dark:text-emerald-400" : props.percent < 0 ? "text-danger" : "text-ink-muted") +
				(props.class ? ` ${props.class}` : "")
			}>
			<Show when={props.percent !== 0}>
				<Icon name={props.percent > 0 ? "chevron-up" : "chevron-down"} class="text-[0.85em]" />
			</Show>
			{formatChange(props.percent)}
		</span>
	);
}

type DashboardYears = APIResponse["Pupils.dashboardYears"];

/** The running school year: its total so far against the previous year on the same date. */
function CurrentYearCard(props: { data: DashboardYears }) {
	const current = () => props.data.years.at(-1);
	const previous = () => props.data.years.at(-2);
	const monthLabel = new Date().toLocaleDateString("el-GR", { month: "long" });
	return (
		<section class={`${cardClass} p-4 grid content-start gap-1`} aria-labelledby="dashboard-current-year">
			<h2 id="dashboard-current-year" class="text-lg font-bold">
				Σχολικό έτος {props.data.school_year.slice(0, 5)}
				{props.data.school_year.slice(-2)}
			</h2>
			<p class="mt-1 flex items-baseline gap-2">
				<span class="text-5xl font-bold tabular-nums">{formatCount(current()?.total ?? 0)}</span>
				<span class="text-ink-muted">{current()?.total === 1 ? "εγγραφή" : "εγγραφές"} μέχρι σήμερα</span>
			</p>
			<Show when={previous()} fallback={<p class="text-sm text-ink-muted">Δεν υπάρχει προηγούμενο έτος για σύγκριση</p>}>
				{(prev) => (
					<p class="text-sm text-ink-muted">
						<Show when={prev().to_date > 0} fallback="Πέρυσι δεν υπήρχαν εγγραφές αυτή την ημερομηνία">
							<Change percent={change(current()?.total ?? 0, prev().to_date) ?? 0} /> σε σχέση με πέρυσι τέτοια μέρα (
							{formatCount(prev().to_date)})
						</Show>
					</p>
				)}
			</Show>
			<dl class="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-4">
				<div>
					<dt class="text-sm text-ink-muted">Αυτή την εβδομάδα</dt>
					<dd class="text-2xl font-bold tabular-nums">{formatCount(props.data.week)}</dd>
				</div>
				<div>
					<dt class="text-sm text-ink-muted">Τον {monthLabel}</dt>
					<dd class="text-2xl font-bold tabular-nums">{formatCount(props.data.month)}</dd>
				</div>
			</dl>
		</section>
	);
}

/**
 * Opens the Μαθητολόγιο with the query already searched (`/admin/pupils?q=`) — digits by ΑΜ (its default field),
 * anything else by Ονοματεπώνυμο (`&by=name`) — plus the pages used daily.
 */
function PupilSearchCard(props: { schoolYear: string }) {
	const navigate = useNavigate();
	const [query, setQuery] = createSignal("");
	const links: { href: string; icon: IconName; label: string }[] = [
		{ href: `/admin/registrations?year=${props.schoolYear.slice(0, 4)}`, icon: "clipboard-list", label: `Εγγραφές ${shortYear(props.schoolYear)}` },
		{ href: "/admin/pupils", icon: "address-book", label: "Μαθητολόγιο" },
		{ href: "/admin/announcements", icon: "megaphone", label: "Ανακοινώσεις" },
		{ href: "/admin/teachers", icon: "teacher", label: "Καθηγητές" },
	];
	return (
		<section class={`${cardClass} p-4 grid content-start gap-3`} aria-labelledby="dashboard-pupil-search">
			<h2 id="dashboard-pupil-search" class="text-lg font-bold">
				Βρείτε μαθητή
			</h2>
			<form
				role="search"
				class="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const text = query().trim();
					const by = /^\d+$/.test(text) ? "" : "&by=name";
					navigate(text ? `/admin/pupils?q=${encodeURIComponent(text)}${by}` : "/admin/pupils");
				}}>
				<label class="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 focus-within:ring-2 focus-within:ring-accent-ink/40">
					<Icon name="search" class="text-ink-muted" />
					<input
						type="search"
						name="q"
						autocomplete="off"
						spellcheck={false}
						aria-label="Αναζήτηση μαθητή με ΑΜ ή ονοματεπώνυμο"
						placeholder="ΑΜ ή ονοματεπώνυμο…"
						class="min-w-0 flex-1 bg-transparent py-2 text-ink placeholder:text-ink-muted focus-visible:outline-hidden"
						value={query()}
						onInput={(e) => setQuery(e.currentTarget.value)}
					/>
				</label>
				<button type="submit" class={`${primaryButtonClass} shrink-0 max-sm:px-3`} aria-label="Αναζήτηση">
					<Icon name="arrow-right" class="sm:hidden" />
					<span class="max-sm:hidden">Αναζήτηση</span>
				</button>
			</form>
			<nav aria-label="Συντομεύσεις" class="mt-1 pt-3 border-t border-line grid grid-cols-2 gap-2">
				<For each={links}>
					{(link) => (
						<a
							href={link.href}
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent-ink transition-colors">
							<Icon name={link.icon} class="text-accent-ink" />
							{link.label}
						</a>
					)}
				</For>
			</nav>
		</section>
	);
}

/**
 * Enrollments per school year as horizontal bars stacked by music type, newest first. The running year
 * carries a marker at the previous year's count on the same date — its fair comparison — and only
 * completed years show a full-year change.
 */
function YearsChart(props: { data: DashboardYears }) {
	const rows = createMemo(() => {
		const years = props.data.years;
		return years
			.map((year, i) => {
				const previous = years[i - 1];
				const running = i === years.length - 1;
				return { ...year, running, previous, yoy: running ? null : change(year.total, previous?.total) };
			})
			.reverse();
	});
	const scale = createMemo(() => Math.max(1, ...props.data.years.map((year) => year.total)));
	const percentOf = (n: number) => `${(n / scale()) * 100}%`;
	const comparison = () => rows()[0]?.previous;
	const [hovered, setHovered] = createSignal<{ year: string; classId: number } | null>(null);

	return (
		<section class={`${cardClass} p-4`} aria-labelledby="dashboard-years">
			<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
				<h2 id="dashboard-years" class="text-lg font-bold">
					Εγγραφές ανά σχολικό έτος
				</h2>
				<ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted" aria-label="Υπόμνημα">
					<For each={MUSIC_TYPES}>
						{(type) => (
							<li class="flex items-center gap-1.5">
								<span class={`size-2.5 rounded-full ${type.bar}`} aria-hidden="true" />
								{type.label}
							</li>
						)}
					</For>
					<Show when={comparison()}>
						<li class="flex items-center gap-1.5">
							<span class="h-3.5 w-0.5 rounded-full bg-ink" aria-hidden="true" />
							Πέρυσι τέτοια μέρα
						</li>
					</Show>
				</ul>
			</div>
			<div class="mt-5 grid gap-4">
				<For each={rows()}>
					{(row) => {
						const segments = MUSIC_TYPES.map((type, classId) => ({ ...type, classId, count: row.by_class[classId] ?? 0 })).filter(
							(s) => s.count > 0,
						);
						const offsetOf = (index: number) => segments.slice(0, index).reduce((sum, s) => sum + s.count, 0);
						const description =
							`${shortYear(row.school_year)}: ${formatCount(row.total)} εγγραφές — ` +
							segments.map((s) => `${s.label} ${formatCount(s.count)}`).join(", ");
						return (
							<div class="min-h-9 grid grid-cols-[3.75rem_1fr_6.5rem] max-sm:grid-cols-[4rem_1fr_4.5rem] items-center gap-x-3">
								<div class="leading-tight">
									<p class="font-semibold tabular-nums">{shortYear(row.school_year)}</p>
									<Show when={row.running}>
										<p class="text-xs text-ink-muted whitespace-nowrap">σε εξέλιξη</p>
									</Show>
								</div>
								<div class="relative h-5" role="img" aria-label={description}>
									<div class="flex h-full gap-0.5" style={{ width: percentOf(row.total) }}>
										<For each={segments}>
											{(segment) => (
												<div
													class={`h-full min-w-0.5 last:rounded-e transition-opacity ${segment.bar}`}
													classList={{
														"opacity-40":
															!!hovered() && !(hovered()?.year === row.school_year && hovered()?.classId === segment.classId),
													}}
													style={{ "flex-grow": segment.count, "flex-basis": 0 }}
													onPointerEnter={() => setHovered({ year: row.school_year, classId: segment.classId })}
													onPointerLeave={() => setHovered(null)}
												/>
											)}
										</For>
									</div>
									<Show when={row.running && row.previous}>
										{(prev) => (
											<span
												class="pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface"
												style={{ left: percentOf(prev().to_date) }}
												aria-hidden="true"
											/>
										)}
									</Show>
									<For each={segments}>
										{(segment, index) => (
											<Show when={hovered()?.year === row.school_year && hovered()?.classId === segment.classId}>
												<div
													class="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink shadow-md shadow-shade"
													style={{ left: percentOf(offsetOf(index()) + segment.count / 2) }}
													aria-hidden="true">
													<span class="font-semibold">{segment.label}</span> · {formatCount(segment.count)} (
													{Math.round((segment.count / row.total) * 100)}%)
												</div>
											</Show>
										)}
									</For>
								</div>
								<p class="text-end leading-tight">
									<span class="font-semibold tabular-nums">{formatCount(row.total)}</span>
									<Show when={row.yoy !== null}>
										<span class="block text-xs" title="Σε σχέση με το προηγούμενο σχολικό έτος">
											<Change percent={row.yoy!} />
										</span>
									</Show>
								</p>
							</div>
						);
					}}
				</For>
			</div>
			<details class="mt-5 text-sm">
				<summary class="cursor-pointer w-fit text-ink-muted hover:text-ink">Προβολή ως πίνακας</summary>
				<div class="mt-3 overflow-x-auto">
					<table class="w-full text-end tabular-nums">
						<thead class="text-ink-muted">
							<tr class="border-b border-line">
								<th scope="col" class="py-1.5 pe-3 text-start font-semibold">
									Σχολικό έτος
								</th>
								<For each={MUSIC_TYPES}>
									{(type) => (
										<th scope="col" class="py-1.5 px-3 font-semibold">
											{type.label}
										</th>
									)}
								</For>
								<th scope="col" class="py-1.5 px-3 font-semibold">
									Σύνολο
								</th>
								<th scope="col" class="py-1.5 ps-3 font-semibold">
									Μέχρι τέτοια μέρα
								</th>
							</tr>
						</thead>
						<tbody>
							<For each={rows()}>
								{(row) => (
									<tr class="border-b border-line last:border-0">
										<th scope="row" class="py-1.5 pe-3 text-start font-semibold">
											{shortYear(row.school_year)}
										</th>
										<For each={MUSIC_TYPES}>{(_, classId) => <td class="py-1.5 px-3">{formatCount(row.by_class[classId()] ?? 0)}</td>}</For>
										<td class="py-1.5 px-3 font-semibold">{formatCount(row.total)}</td>
										<td class="py-1.5 ps-3">{formatCount(row.to_date)}</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
			</details>
		</section>
	);
}

export default function TotalsTable() {
	const [yearStats] = createAPIResource(API.Pupils.dashboardYears);
	// Re-fetched on every mount, so edits made elsewhere show up when the admin comes back here.
	const previousVisit = trackVisit();
	const since = previousVisit ?? Date.now() - FALLBACK_WINDOW_MS;
	const [attention] = createAPIResource(API.Pupils.dashboardSummary, () => ({ UrlArgs: { since } }));

	return (
		<Show when={!yearStats.error && yearStats()} fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			{(stats) => (
				<div class="w-full h-min p-6 max-sm:p-3 grid grid-cols-1 gap-y-8 text-ink">
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
											icon="clipboard-check"
											title="Προς έλεγχο"
											value={data().needs_review}
											detail={data().needs_review === 1 ? "μαθητής στο Μαθητολόγιο" : "μαθητές στο Μαθητολόγιο"}
											calm={data().needs_review === 0}
										/>
										<AttentionTile
											href={`/admin/registrations?year=${yearStart}`}
											icon="euro"
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
											icon="globe"
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
					<section class="w-full max-w-5xl justify-self-center grid gap-3" aria-label="Εγγραφές">
						<h2 class="font-anaktoria text-2xl text-ink">Εγγραφές</h2>
						<div class="grid grid-cols-2 max-md:grid-cols-1 gap-4">
							<CurrentYearCard data={stats()} />
							<PupilSearchCard schoolYear={stats().school_year} />
						</div>
						<YearsChart data={stats()} />
					</section>
				</div>
			)}
		</Show>
	);
}
