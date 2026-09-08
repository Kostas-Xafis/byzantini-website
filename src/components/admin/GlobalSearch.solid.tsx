import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { useNavigate } from "@solidjs/router";
import { API } from "@routes/index.client";
import { apiCall, type APICallResult } from "@hooks/apiCall";
import { looseStringIncludes } from "@utilities/string";
import type { Announcements, Books, Locations, Payoffs, Payments, Registrations, Teachers } from "@_types/entities";

type PaletteEntry =
	| { kind: "group"; key: string; label: string; icon: string }
	| { kind: "result"; key: string; group: string; icon: string; title: string; subtitle?: string; href: string };

type PaletteSources = {
	year: number;
	registrations: Registrations[];
	teachers: Teachers[];
	books: Books[];
	payments: Payments[];
	payoffs: Payoffs[];
	locations: Locations[];
	announcements: Announcements[];
	sysusers: { id: number; email: string }[];
	wholesalers: { id: number; name: string }[];
};

const MAX_PER_GROUP = 5;

const getData = <T,>(res: APICallResult<T>): T | undefined => ("data" in res ? res.data : undefined);

const formatDate = (ms: number) => new Date(ms).toLocaleDateString("el-GR");

export default function GlobalSearch() {
	const [state, setState] = createStore<{
		open: boolean;
		loading: boolean;
		ready: boolean;
		error?: string;
		sources?: PaletteSources;
	}>({ open: false, loading: false, ready: false });
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal(0);
	const navigate = useNavigate();

	let inputRef: HTMLInputElement | undefined;
	let loaded = false;

	const close = () => {
		setState("open", false);
		setQuery("");
		setActive(0);
	};

	const open = () => {
		setState("open", true);
		setTimeout(() => inputRef?.focus(), 0);
		if (loaded) return;
		loaded = true;
		void (async () => {
			setState("loading", true);
			try {
				const [teachers, books, payments, payoffs, locations, announcements, sysusers, wholesalers, years] = await Promise.all([
					apiCall(API.Teachers.get),
					apiCall(API.Books.get),
					apiCall(API.Payments.get),
					apiCall(API.Payoffs.get),
					apiCall(API.Locations.get),
					apiCall(API.Announcements.get),
					apiCall(API.SysUsers.get),
					apiCall(API.Wholesalers.get),
					apiCall(API.Registrations.getYears),
				]);
				// Registrations are per school year; index the most recent one.
				const yearList = getData(years) ?? [];
				const year = yearList.length ? Number(yearList[yearList.length - 1].split("-")[0]) : new Date().getFullYear();
				const registrations = await apiCall(API.Registrations.get, { UrlArgs: { year } });
				setState({
					loading: false,
					ready: true,
					sources: {
						year,
						registrations: getData(registrations) ?? [],
						teachers: getData(teachers) ?? [],
						books: getData(books) ?? [],
						payments: getData(payments) ?? [],
						payoffs: getData(payoffs) ?? [],
						locations: getData(locations) ?? [],
						announcements: getData(announcements) ?? [],
						sysusers: getData(sysusers) ?? [],
						wholesalers: getData(wholesalers) ?? [],
					},
				});
			} catch (e) {
				loaded = false;
				setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
			}
		})();
	};

	const goto = (entry: PaletteEntry) => {
		if (entry.kind !== "result") return;
		close();
		navigate(entry.href);
	};

	const results = createMemo<PaletteEntry[]>(() => {
		const needle = query().trim();
		const sources = state.sources;
		if (!sources || !state.ready) return [];
		const matches = (haystack: string) => !needle || looseStringIncludes(haystack, needle);
		const out: PaletteEntry[] = [];

		const addGroup = (key: string, label: string, icon: string, items: PaletteEntry[]) => {
			const filtered = items.filter((i) => i.kind === "result");
			if (!filtered.length) return;
			out.push({ kind: "group", key, label, icon });
			out.push(...filtered.slice(0, MAX_PER_GROUP));
		};

		const regIcon = "fa-solid fa-clipboard-list";
		addGroup(
			"registrations",
			"Εγγραφές",
			regIcon,
			sources.registrations
				.filter((r) =>
					matches(
						`${r.last_name} ${r.first_name} ${r.fathers_name} ${r.am} ${r.amka} ${r.email} ${r.telephone} ${r.cellphone} ${r.road} ${r.region} ${r.class_year} ${String(r.id)}`,
					),
				)
				.map((r) => ({
					kind: "result" as const,
					key: `reg-${r.id}`,
					group: "registrations",
					icon: regIcon,
					title: `${r.last_name} ${r.first_name}`,
					subtitle: `ΑΜ ${r.am} · ${r.email || r.telephone || `Εγγραφή #${r.id}`}`,
					href: `/admin/registrations?year=${sources.year}&search=${encodeURIComponent(String(r.id))}`,
				})),
		);

		const teacherIcon = "fa-solid fa-chalkboard-user";
		addGroup(
			"teachers",
			"Καθηγητές",
			teacherIcon,
			sources.teachers
				.filter((t) => matches(`${t.fullname} ${t.email ?? ""} ${t.telephone ?? ""} ${t.amka ?? ""} ${t.linktree ?? ""}`))
				.map((t) => ({
					kind: "result" as const,
					key: `teacher-${t.id}`,
					group: "teachers",
					icon: teacherIcon,
					title: t.fullname,
					subtitle: t.email || t.telephone,
					href: `/admin/teachers?search=${encodeURIComponent(t.fullname)}`,
				})),
		);

		const bookIcon = "fa-solid fa-book";
		addGroup(
			"books",
			"Βιβλία",
			bookIcon,
			sources.books
				.filter((b) => matches(`${b.title} ${String(b.id)}`))
				.map((b) => ({
					kind: "result" as const,
					key: `book-${b.id}`,
					group: "books",
					icon: bookIcon,
					title: b.title,
					subtitle: `Λιανική ${b.price}€ · Απόθεμα ${b.quantity - b.sold}`,
					href: `/admin/books?search=${encodeURIComponent(b.title)}`,
				})),
		);

		const announcementIcon = "fa-solid fa-bullhorn";
		addGroup(
			"announcements",
			"Ανακοινώσεις",
			announcementIcon,
			sources.announcements
				.filter((a) => matches(`${a.title} ${String(a.id)}`))
				.map((a) => ({
					kind: "result" as const,
					key: `announcement-${a.id}`,
					group: "announcements",
					icon: announcementIcon,
					title: a.title,
					subtitle: `${formatDate(a.date)} · ${a.views} προβολές`,
					href: `/admin/announcements?search=${encodeURIComponent(a.title)}`,
				})),
		);

		const paymentIcon = "fa-solid fa-hand-holding-dollar";
		addGroup(
			"payments",
			"Πληρωμές",
			paymentIcon,
			sources.payments
				.filter((p) => matches(`${p.student_name} ${String(p.id)}`))
				.map((p) => ({
					kind: "result" as const,
					key: `payment-${p.id}`,
					group: "payments",
					icon: paymentIcon,
					title: p.student_name,
					subtitle: `Οφειλή ${p.amount}€ · ${formatDate(p.date)}`,
					href: `/admin/payments?search=${encodeURIComponent(p.student_name)}`,
				})),
		);

		const payoffIcon = "fa-solid fa-file-invoice-dollar";
		addGroup(
			"payoffs",
			"Οφειλές Σχολής",
			payoffIcon,
			sources.payoffs
				.map((p) => {
					const wholesaler = sources.wholesalers.find((w) => w.id === p.wholesaler_id)?.name ?? `Χονδρέμπορος #${p.wholesaler_id}`;
					return {
						kind: "result" as const,
						key: `payoff-${p.id}`,
						group: "payoffs",
						icon: payoffIcon,
						title: wholesaler,
						subtitle: `Οφειλή ${p.amount}€`,
						href: `/admin/payoffs`,
					};
				})
				.filter((p) => matches(`${p.title} ${p.subtitle}`)),
		);

		const locationIcon = "fa-solid fa-location-dot";
		addGroup(
			"locations",
			"Παραρτήματα",
			locationIcon,
			sources.locations
				.filter((l) => matches(`${l.name} ${l.address} ${l.municipality} ${l.manager} ${l.email ?? ""} ${l.telephones}`))
				.map((l) => ({
					kind: "result" as const,
					key: `location-${l.id}`,
					group: "locations",
					icon: locationIcon,
					title: l.name,
					subtitle: l.municipality,
					href: `/admin/locations?search=${encodeURIComponent(l.name)}`,
				})),
		);

		const sysuserIcon = "fa-solid fa-users-gear";
		addGroup(
			"sysusers",
			"Διαχειριστές",
			sysuserIcon,
			sources.sysusers
				.filter((u) => matches(u.email))
				.map((u) => ({
					kind: "result" as const,
					key: `sysuser-${u.id}`,
					group: "sysusers",
					icon: sysuserIcon,
					title: u.email,
					href: `/admin/sysusers`,
				})),
		);

		return out;
	});

	const step = (dir: 1 | -1) => {
		const list = results();
		if (!list.length) return;
		let i = active();
		for (let guard = 0; guard < list.length; guard++) {
			i = (i + dir + list.length) % list.length;
			if (list[i].kind === "result") break;
		}
		setActive(i);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			step(1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			step(-1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const entry = results()[active()];
			if (entry?.kind === "result") goto(entry);
		} else if (e.key === "Escape") {
			close();
		}
	};

	onMount(() => {
		const onWindowKeyDown = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				if (state.open) close();
				else open();
			}
		};
		window.addEventListener("keydown", onWindowKeyDown);
		onCleanup(() => window.removeEventListener("keydown", onWindowKeyDown));
	});

	return (
		<Show when={state.open}>
			<div class="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm" onClick={close}>
				<div
					class="w-full max-w-[640px] overflow-hidden rounded-xl border-2 border-red-900 bg-white shadow-2xl dark:border-red-800 dark:bg-dark"
					onClick={(e) => e.stopPropagation()}>
					<div class="flex items-center gap-x-3 border-b border-red-900/20 px-4 dark:border-red-800/40">
						<i class="fa-solid fa-magnifying-glass text-red-900 dark:text-red-200" aria-hidden="true"></i>
						<input
							ref={inputRef}
							class="w-full bg-transparent py-3 font-didact text-lg text-red-950 placeholder:text-red-900/40 focus-visible:outline-hidden dark:text-red-50 dark:placeholder:text-red-200/40"
							type="text"
							autocomplete="off"
							spellcheck="false"
							placeholder="Αναζήτηση σε όλη τη διαχείριση…"
							aria-label="Αναζήτηση σε όλη τη διαχείριση"
							value={query()}
							onInput={(e) => {
								setQuery(e.currentTarget.value);
								const first = results().findIndex((r) => r.kind === "result");
								setActive(Math.max(first, 0));
							}}
							onKeyDown={handleKeyDown}
						/>
						<kbd class="rounded border border-red-900/30 px-1.5 py-0.5 text-xs text-red-900/60 dark:border-red-700/50 dark:text-red-200/60">
							Esc
						</kbd>
					</div>
					<div class="max-h-[55vh] overflow-y-auto pb-2">
						<Show
							when={state.loading}
							fallback={
								<Show when={state.ready}>
									<For each={results()}>
										{(entry, i) =>
											entry.kind === "group" ? (
												<p class="flex items-center gap-x-2 px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.14em] text-red-900/70 dark:text-red-200/70">
													<i class={`${entry.icon} text-sm`} aria-hidden="true"></i>
													{entry.label}
												</p>
											) : (
												<button
													type="button"
													class={
														"flex w-full items-center gap-x-3 px-4 py-2 text-left transition-colors " +
														(i() === active()
															? "bg-red-900 text-white dark:bg-red-800"
															: "hover:bg-red-100 dark:hover:bg-red-900/40")
													}
													onmouseenter={() => setActive(i())}
													onClick={() => goto(entry)}>
													<i
														class={`${entry.icon} w-5 text-center ${i() === active() ? "text-white dark:text-red-50" : "text-red-900 dark:text-red-200"}`}
														aria-hidden="true"></i>
													<span class="min-w-0 flex-1">
														<span class="block truncate font-bold font-didact">{entry.title}</span>
														<Show when={entry.subtitle}>
															<span class="block truncate text-sm opacity-70">{entry.subtitle}</span>
														</Show>
													</span>
													<i class="fa-solid fa-arrow-right text-sm opacity-60" aria-hidden="true"></i>
												</button>
											)
										}
									</For>
									<Show when={!results().length}>
										<p class="px-4 py-6 text-center font-didact text-red-900/60 dark:text-red-200/60">
											Δεν βρέθηκαν αποτελέσματα για «{query()}»
										</p>
									</Show>
								</Show>
							}>
							<div class="flex items-center justify-center gap-3 py-6">
								<span class="spinner h-6 w-6"></span>
								<p class="font-didact text-red-900/70 dark:text-red-200/70">Φόρτωση δεδομένων…</p>
							</div>
						</Show>
						<Show when={state.error}>
							<p class="px-4 py-4 text-center font-didact text-red-900 dark:text-red-200">Αποτυχία φόρτωσης δεδομένων: {state.error}</p>
						</Show>
					</div>
				</div>
			</div>
		</Show>
	);
}
