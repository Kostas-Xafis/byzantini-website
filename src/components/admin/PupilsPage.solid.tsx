import type { Instruments, PupilEnrollments, Pupils, PupilSearchResult, Teachers } from "@_types/entities";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { classYearsForClassId, MusicTypeArr } from "@lib/classYears";
import { API, type APIResponse } from "@routes/index.client";
import { ExtendedFormData } from "@utilities/forms";
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack } from "solid-js";
import { InputFields, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import { ActionEnum, ActionIcon } from "./table/TableControlTypes";
import { TableControl, TableControlsGroup, type Action } from "./table/TableControls.solid";

/**
 * Μαθητολόγιο — the pupil register.
 *
 * Search-first: the page opens on a search field; picking a pupil keeps the
 * field pinned at the top (one shared column width, so nothing jumps) and
 * reveals the two-column record:
 *
 *   left  — personal information
 *   right — the pupil's music types as tabs (only the ones they ever enrolled
 *           in), each showing that department's history, with a per-instrument /
 *           per-class breakdown underneath.
 *
 * Typing a new query — or toggling "Μόνο προς έλεγχο" — always returns to the
 * result list, so the field never sits there inertly while a record is open.
 *
 * Actions: edit the pupil's details, or add a (possibly historical) enrollment.
 * The table system is deliberately NOT used here — `Table` is a fixed grid with
 * a single `#table` id; this page is bespoke, following SettingsPage/TotalsTable.
 */

const PREFIX = "pupils";

const MUSIC_TYPES = [
	{ id: 0, label: "Βυζαντινή Μουσική" },
	{ id: 1, label: "Παραδοσιακή Μουσική" },
	{ id: 2, label: "Ευρωπαϊκή Μουσική" },
] as const;

const musicLabel = (classId: number) => MUSIC_TYPES.find((type) => type.id === classId)?.label ?? "Άγνωστο";

const formatDate = (value: number | null | undefined) => (value ? new Date(value).toLocaleDateString("el-GR") : "-");

/** Greek needs the singular for exactly one ('1 μαθητής' / '2 μαθητές'). */
const countLabel = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

/** ΑΜ display: the real number, or the review code for orphans/splits. */
const amLabel = (pupil: Pick<Pupils, "am" | "orphan_code">) => (pupil.am === null ? pupil.orphan_code || "—" : String(pupil.am));

const field = (label: string, name: string, type: InputProps["type"], extra: Partial<InputProps> = {}): InputProps =>
	({ label, name, type, iconClasses: "fa-solid fa-user", ...extra }) as InputProps;

/** Edit form: the pupil's identity and contact details. */
function pupilInputs(pupil: Pupils): Record<string, InputProps> {
	return {
		am: {
			label: "Αριθμός Μητρώου",
			name: "am",
			type: "number",
			iconClasses: "fa-solid fa-id-card",
			tooltip: { message: ["Κενό = χωρίς ΑΜ (εκκρεμεί απονομή)."], position: "top" },
		},
		amka: { label: "ΑΜΚΑ", name: "amka", type: "text", iconClasses: "fa-solid fa-id-card" },
		last_name: field("Επώνυμο", "last_name", "text", { required: true }),
		first_name: field("Όνομα", "first_name", "text", { required: true }),
		fathers_name: field("Πατρώνυμο", "fathers_name", "text"),
		birth_date: { label: "Ημερομηνία Γέννησης", name: "birth_date", type: "date", iconClasses: "fa-regular fa-calendar-days" },
		road: { label: "Οδός", name: "road", type: "text", iconClasses: "fa-solid fa-location-dot" },
		number: { label: "Αριθμός", name: "number", type: "number", iconClasses: "fa-solid fa-hashtag" },
		tk: { label: "Τ.Κ.", name: "tk", type: "number", iconClasses: "fa-solid fa-hashtag" },
		region: { label: "Δήμος/Περιοχή", name: "region", type: "text", iconClasses: "fa-solid fa-tree-city" },
		telephone: { label: "Τηλέφωνο", name: "telephone", type: "tel", iconClasses: "fa-solid fa-phone" },
		cellphone: { label: "Κινητό", name: "cellphone", type: "tel", iconClasses: "fa-solid fa-mobile-screen" },
		email: { label: "Email", name: "email", type: "email", iconClasses: "fa-solid fa-envelope" },
		review_note: { label: "Σημείωση ελέγχου", name: "review_note", type: "text", iconClasses: "fa-solid fa-note-sticky" },
	};
}

/** Enroll form: one history row (a year, a music type, a class/instrument). */
function enrollmentInputs(teachers: Teachers[], instruments: Instruments[], defaults: Partial<PupilEnrollments>): Record<string, InputProps> {
	const byzantine = defaults.class_id === 0;
	const teacherList = teachers.filter((teacher) => teacher.id >= 0).sort((a, b) => a.fullname.localeCompare(b.fullname, "el"));
	const instrumentList = byzantine ? [] : instruments.filter((instrument) => instrument.type === MusicTypeArr[defaults.class_id ?? 0]);

	return {
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			required: true,
			iconClasses: "fa-solid fa-calendar-days",
			placeholder: "2026-2027",
		},
		class_id: {
			label: "Μουσική",
			name: "class_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-music",
			selectList: MUSIC_TYPES.map((type) => type.label),
			valueList: MUSIC_TYPES.map((type) => type.id),
			value: defaults.class_id ?? 0,
			listeners: true,
		},
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: classYearsForClassId(defaults.class_id ?? 0),
			valueLiteral: true,
			listeners: true,
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			iconClasses: "fa-solid fa-chalkboard-user",
			selectList: teacherList.map((teacher) => teacher.fullname),
			valueList: teacherList.map((teacher) => teacher.id),
		},
		instrument_id: byzantine
			? { label: "", name: "", type: null }
			: {
					label: "Όργανο / Μάθημα",
					name: "instrument_id",
					type: "select",
					iconClasses: "fa-solid fa-guitar",
					selectList: instrumentList.map((instrument) => instrument.name),
					valueList: instrumentList.map((instrument) => instrument.id),
				},
		payment_amount: { label: "Ποσό Πληρωμής", name: "payment_amount", type: "number", iconClasses: "fa-solid fa-euro-sign" },
		total_payment: { label: "Σύνολο Πληρωμής", name: "total_payment", type: "number", iconClasses: "fa-solid fa-euro-sign" },
		payment_date: { label: "Ημερομηνία Πληρωμής", name: "payment_date", type: "date", iconClasses: "fa-regular fa-calendar-days" },
		pass: {
			label: "Προάχθει",
			name: "pass",
			type: "multiselect",
			iconClasses: "fa-solid fa-check",
			multiselectOnce: true,
			multiselectList: [
				{ value: 1, label: "Ναί", selected: !!defaults.pass },
				{ value: 0, label: "Όχι", selected: !defaults.pass },
			],
		},
	};
}

export default function PupilsPage() {
	// No shared cache: the Μαθητολόγιο keys its data by pupil id, and the shared
	// store is keyed by endpoint only (last write wins), which would mix records.
	const apiHook = useAPIClient();

	// ---- search state -------------------------------------------------------
	const [query, setQuery] = createSignal("");
	const [page, setPage] = createSignal(0);
	const [needsReviewOnly, setNeedsReviewOnly] = createSignal(false);
	const [results, setResults] = createSignal<APIResponse["Pupils.search"] | null>(null);
	const [searching, setSearching] = createSignal(false);

	// ---- selection state ----------------------------------------------------
	const [selectedId, setSelectedId] = createSignal<number | null>(null);
	const [record, setRecord] = createSignal<APIResponse["Pupils.get"] | null>(null);
	const [loadingRecord, setLoadingRecord] = createSignal(false);
	const [activeMusic, setActiveMusic] = createSignal<number | null>(null);

	// reference data for the enroll form
	const [teachers, setTeachers] = createSignal<Teachers[]>([]);
	const [instruments, setInstruments] = createSignal<Instruments[]>([]);

	const PAGE_SIZE = 20;

	let searchInput!: HTMLInputElement;
	let bodyRef: HTMLDivElement | undefined;

	/**
	 * The page is a 100dvh shell whose middle section scrolls on its own (like
	 * `Table`'s data container), so the document never grows: reset that scroller,
	 * and the window too for the mobile layout where the page flows normally.
	 */
	const scrollToTop = () => {
		bodyRef?.scrollTo({ top: 0, behavior: "smooth" });
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	/** Paging keeps the list start in view (the rows scroll, the page does not). */
	const goToPage = (nextPage: number) => {
		scrollToTop();
		void runSearch(nextPage);
	};

	/**
	 * Mirror the shareable state into the URL: `?pupil=<id>` for the open record,
	 * `?q=<query>` for the search. The typed query is component state, so without
	 * this it is lost the moment the page remounts (reload, or a detour to another
	 * admin page); with it, "Πίσω στην αναζήτηση" — and everything after — keeps it.
	 */
	const syncUrl = (id: number | null) => {
		const text = untrack(() => query()).trim();
		const params = new URLSearchParams(window.location.search);
		if (id === null) params.delete("pupil");
		else params.set("pupil", String(id));
		if (text) params.set("q", text);
		else params.delete("q");
		const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
		if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState({}, "", next);
	};

	const runSearch = async (nextPage = 0) => {
		setSearching(true);
		try {
			const res = await apiHook(API.Pupils.search, {
				RequestObject: { query: query().trim(), needs_review: needsReviewOnly() || undefined, page: nextPage, pageSize: PAGE_SIZE },
			});
			if ("data" in res) {
				setResults(res.data);
				setPage(nextPage);
				// the query is page state; mirror it so it survives a reload or a
				// trip to another admin page (which remounts this component)
				syncUrl(selectedId());
			}
		} catch (error) {
			pushAlert(createAlert("error", error instanceof Error ? error.message : "Σφάλμα κατά την αναζήτηση"));
		} finally {
			setSearching(false);
		}
	};

	const loadPupil = async (id: number) => {
		setLoadingRecord(true);
		setSelectedId(id);
		try {
			const res = await apiHook(API.Pupils.get, { UrlArgs: { id } });
			// A newer selection — or a return to the list — won the race: drop this one.
			if (selectedId() !== id) return;
			if ("data" in res) {
				setRecord(res.data);
				const first = availableMusicTypes(res.data.enrollments)[0] ?? null;
				setActiveMusic(first);
			}
		} catch (error) {
			if (selectedId() !== id) return;
			setLoadingRecord(false);
			pushAlert(createAlert("error", error instanceof Error ? error.message : "Σφάλμα κατά την ανάκτηση του μαθητή"));
			setSelectedId(null);
			return;
		} finally {
			if (selectedId() === id) setLoadingRecord(false);
		}
	};

	/** Open a record from the result list (or a deep link). */
	const openPupil = (id: number) => {
		scrollToTop();
		void loadPupil(id);
	};

	const closeRecord = () => {
		setSelectedId(null);
		setRecord(null);
		setActiveMusic(null);
	};

	/** Back to the result list without touching the query. */
	const backToSearch = () => {
		closeRecord();
		scrollToTop();
		searchInput?.focus();
	};

	/**
	 * Any search the user drives (typing, Enter, the review filter, clearing)
	 * also drops an open record: the list is where results are shown, so the
	 * search field can never look active while doing nothing.
	 */
	const startSearch = (nextPage = 0) => {
		closeRecord();
		void runSearch(nextPage);
	};

	/** Music types the pupil has ever enrolled in, in canonical order. */
	const availableMusicTypes = (enrollments: PupilEnrollments[]): number[] => {
		const ids = new Set(enrollments.map((enrollment) => enrollment.class_id));
		return MUSIC_TYPES.map((type) => type.id).filter((id) => ids.has(id));
	};

	const enrollmentsFor = (classId: number) => (record()?.enrollments ?? []).filter((enrollment) => enrollment.class_id === classId);

	/** Per-instrument/class breakdown inside the active music type. */
	const instrumentGroups = createMemo(() => {
		const classId = activeMusic();
		if (classId === null) return [];
		const groups = new Map<number, PupilEnrollments[]>();
		for (const enrollment of enrollmentsFor(classId)) {
			const bucket = groups.get(enrollment.instrument_id);
			if (bucket) bucket.push(enrollment);
			else groups.set(enrollment.instrument_id, [enrollment]);
		}
		return [...groups.entries()]
			.map(([instrumentId, rows]) => ({
				instrumentId,
				name: instruments().find((instrument) => instrument.id === instrumentId)?.name ?? (instrumentId === 0 ? "Χωρίς όργανο" : `#${instrumentId}`),
				rows: rows.sort((a, b) => b.registration_year.localeCompare(a.registration_year)),
			}))
			.sort((a, b) => a.name.localeCompare(b.name, "el"));
	});

	const teacherName = (id: number) => teachers().find((teacher) => teacher.id === id)?.fullname ?? (id < 0 ? "-" : `#${id}`);

	/** One-line summary of a result row: history size, latest year, departments. */
	const resultMeta = (row: PupilSearchResult) => {
		const parts = [countLabel(row.enrollment_count, "εγγραφή", "εγγραφές")];
		if (row.last_registration_year) parts.push(`τελευταία: ${row.last_registration_year}`);
		const types = row.music_types
			.split(",")
			.filter(Boolean)
			.map((id) => musicLabel(Number(id)));
		if (types.length) parts.push(types.join(", "));
		return parts.join(" · ");
	};

	// ---- lifecycle ----------------------------------------------------------
	onMount(() => {
		// reference data (cached store is not needed here — plain signals)
		void (async () => {
			try {
				const [teachersRes, instrumentsRes] = await Promise.all([apiHook(API.Teachers.getByFullnames), apiHook(API.Instruments.get)]);
				if ("data" in teachersRes) setTeachers(teachersRes.data ?? []);
				if ("data" in instrumentsRes) setInstruments(instrumentsRes.data ?? []);
			} catch {
				/* the forms degrade to free-text ids; search still works */
			}
		})();

		// deep link: /admin/pupils?pupil=<id> (and/or ?q=<query>)
		const params = new URLSearchParams(window.location.search);
		const deepLink = params.get("pupil");
		const deepQuery = params.get("q");
		if (deepQuery) {
			setQuery(deepQuery);
			// the search below already covers the seeded query, so drop the debounce
			clearTimeout(debounceTimer);
		}
		if (deepLink && /^\d+$/.test(deepLink)) void loadPupil(Number(deepLink));
		void runSearch(0);
	});

	// debounce the query (deferred: the mount search above already covers page 0)
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(debounceTimer));
	createEffect(
		on(
			query,
			() => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => untrack(() => startSearch(0)), 250);
			},
			{ defer: true },
		),
	);

	// keep ?pupil= in the URL so a record is shareable; ?q= is written by runSearch
	// (once per search, not per keystroke — Safari rate-limits replaceState)
	createEffect(() => syncUrl(selectedId()));

	// ---- actions ------------------------------------------------------------
	const editAction = createMemo<Action | ReturnType<typeof emptyAction>>(() => {
		const data = record();
		if (!data) return emptyAction(ActionEnum.MODIFY, ActionIcon.MODIFY);
		const inputs = new InputFields(pupilInputs(data.pupil)).fill((input, key) => {
			const value = (data.pupil as unknown as Record<string, unknown>)[key as string];
			input.value = key === "birth_date" ? (value as number) || undefined : ((value as string | number) ?? "");
		});

		return {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
			headerText: "Ενημέρωση Στοιχείων Μαθητή",
			submitText: "Ενημέρωση",
			inputs: inputs.getInputs(),
			onSubmit: async (form: ExtendedFormData<Pupils>) => {
				const amRaw = form.string("am", "").trim();
				const body: Record<string, unknown> = {
					id: data.pupil.id,
					am: amRaw === "" ? null : Number(amRaw),
					amka: form.string("amka", ""),
					last_name: form.string("last_name"),
					first_name: form.string("first_name"),
					fathers_name: form.string("fathers_name"),
					road: form.string("road"),
					number: form.number("number", 0),
					tk: form.number("tk", 0),
					region: form.string("region"),
					telephone: form.string("telephone", "-"),
					cellphone: form.string("cellphone"),
					email: form.string("email"),
					review_note: form.string("review_note", ""),
				};
				const birth = form.string("birth_date", "");
				if (birth) body.birth_date = form.date("birth_date").getTime();
				await apiHook(API.Pupils.update, { RequestObject: body as never });
				pushAlert(createAlert("success", "Επιτυχής ενημέρωση μαθητή"));
				await loadPupil(data.pupil.id);
				void runSearch(page());
			},
		};
	});

	const enrollAction = createMemo<Action | ReturnType<typeof emptyAction>>(() => {
		const data = record();
		if (!data) return emptyAction(ActionEnum.ADD, ActionIcon.ADD);
		const defaultClass = activeMusic() ?? availableMusicTypes(data.enrollments)[0] ?? 0;
		const defaults: Partial<PupilEnrollments> = { class_id: defaultClass, registration_year: "" };
		const inputs = new InputFields(enrollmentInputs(teachers(), instruments(), defaults));
		// keep the class-year list in sync with the selected music type
		inputs.fill((input) => {
			if (input.name === "class_year") input.value = "";
		});

		return {
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
			headerText: "Προσθήκη Εγγραφής",
			submitText: "Προσθήκη",
			inputs: inputs.getInputs(),
			onSubmit: async (form: ExtendedFormData<PupilEnrollments>) => {
				const classId = form.number("class_id", 0);
				const classYear = form.string("class_year", "");
				if (!classYear || classYear === "undefined") throw new Error("Παρακαλώ επιλέξτε έτος φοίτησης");
				const paymentDate = form.string("payment_date", "");
				await apiHook(API.Pupils.enroll, {
					RequestObject: {
						pupil_id: data.pupil.id,
						registration_year: form.string("registration_year"),
						class_id: classId as 0 | 1 | 2,
						class_year: classYear,
						teacher_id: form.number("teacher_id", -1),
						instrument_id: form.number("instrument_id", 0),
						date: Date.now(),
						payment_amount: form.number("payment_amount", 0),
						total_payment: form.number("total_payment", 0),
						payment_date: paymentDate ? form.date("payment_date").getTime() : null,
						pass: form.multiSelect("pass", "boolean", { single: true }),
					},
				});
				pushAlert(createAlert("success", "Επιτυχής προσθήκη εγγραφής"));
				await loadPupil(data.pupil.id);
				void runSearch(page());
			},
		};
	});

	// ---- render -------------------------------------------------------------
	// Shell: the admin content cell is already exactly one viewport tall
	// (#AdminPage: 100dvh grid rows), so the page fills it and scrolls its MIDDLE
	// section instead of growing the document — same shape as `Table`'s
	// top-tools / scrolling data / bottom-tools grid. On small screens the shell
	// releases the height and the page scrolls normally, like the tables do.
	return (
		<div class="flex h-full w-full flex-col overflow-hidden p-6 text-red-950 max-sm:h-auto max-sm:grid max-sm:grid-rows-[20%_75%_5%] max-sm:p-3 dark:text-red-50">
			{/* ---- pinned top: title + search ---- */}
			<div class="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-y-4">
				{/* ---- landing heading ---- */}
				<Show when={selectedId() === null}>
					<div class="grid justify-items-center gap-y-2 pt-[6vh] pb-2 text-center max-sm:pt-2">
						<h1 class="font-anaktoria text-5xl max-sm:text-4xl">Μαθητολόγιο</h1>
						<p class="max-w-2xl text-base text-gray-600 dark:text-gray-300">
							Αναζητήστε μαθητή με ΑΜ, ονοματεπώνυμο, ΑΜΚΑ, τηλέφωνο, email ή περιοχή.
						</p>
					</div>
				</Show>

				{/* ---- search ---- */}
				<div
					role="search"
					class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-red-900 bg-white px-4 py-2 shadow-md shadow-gray-300 dark:border-red-800 dark:bg-dark dark:shadow-gray-700">
					<i class="fa-solid fa-magnifying-glass text-red-900 dark:text-red-200" aria-hidden="true"></i>
					<input
						ref={searchInput}
						type="search"
						name="pupil-search"
						autocomplete="off"
						spellcheck="false"
						aria-label="Αναζήτηση μαθητή"
						placeholder="Αναζήτηση…"
						class="min-w-0 flex-1 bg-transparent font-didact text-lg max-sm:text-base text-red-950 dark:text-red-50 placeholder:text-gray-400 focus-visible:outline-hidden [&::-webkit-search-cancel-button]:appearance-none"
						value={query()}
						onInput={(e) => setQuery(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								clearTimeout(debounceTimer);
								startSearch(0);
							}
							if (e.key === "Escape") {
								setQuery("");
								clearTimeout(debounceTimer);
								startSearch(0);
							}
						}}
					/>
					<Show when={searching()}>
						<i class="fa-solid fa-circle-notch fa-spin text-red-900 dark:text-red-200" aria-hidden="true"></i>
					</Show>
					<Show when={query()}>
						<button
							type="button"
							aria-label="Καθαρισμός αναζήτησης"
							class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-red-900 transition-colors hover:bg-red-200 dark:text-red-200 dark:hover:bg-red-900/70"
							onClick={() => {
								setQuery("");
								clearTimeout(debounceTimer);
								startSearch(0);
								searchInput?.focus();
							}}>
							<i class="fa-solid fa-xmark text-sm leading-none" aria-hidden="true"></i>
						</button>
					</Show>
					<Show when={results()}>
						<span class="whitespace-nowrap font-didact text-sm text-gray-600 dark:text-gray-300" aria-live="polite">
							{countLabel(results()!.total, "μαθητής", "μαθητές")}
						</span>
					</Show>
					<label class="flex cursor-pointer items-center gap-x-2 whitespace-nowrap font-didact text-sm text-gray-700 dark:text-gray-200">
						<input
							type="checkbox"
							class="size-4 cursor-pointer accent-red-900 dark:accent-red-500"
							checked={needsReviewOnly()}
							onChange={(e) => {
								setNeedsReviewOnly(e.currentTarget.checked);
								startSearch(0);
							}}
						/>
						Μόνο προς έλεγχο
					</label>
					<Show when={selectedId() !== null}>
						<button
							type="button"
							onClick={backToSearch}
							class="rounded-md border border-red-900 px-3 py-1 font-didact text-sm transition-colors hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/35">
							Πίσω στην αναζήτηση
						</button>
					</Show>
				</div>
			</div>

			{/* ---- scrolling body: results or the open record ---- */}
			<div id="pupilsScroller" ref={bodyRef} class="mx-auto mt-6 flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-y-4 overflow-y-scroll max-sm:mt-4">
				{/* ---- result list ---- */}
				<Show when={selectedId() === null}>
					<div class="grid gap-y-4">
						<Show
							when={!searching() || results()}
							fallback={
								<div class="py-10">
									<Spinner />
								</div>
							}>
							<div class="grid gap-y-2">
								<Show when={results() && results()!.rows.length === 0}>
									<p class="py-10 text-center text-lg text-gray-600 dark:text-gray-300">
										<Show when={query().trim()} fallback="Δεν βρέθηκαν μαθητές.">
											Δεν βρέθηκε μαθητής για «{query().trim()}».
										</Show>
									</p>
								</Show>
								<For each={results()?.rows ?? []}>
									{(row) => (
										<button
											type="button"
											onClick={() => openPupil(row.id)}
											class="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 rounded-lg border border-red-900/20 bg-white px-4 py-3 text-left shadow-sm shadow-gray-200 transition-colors hover:border-red-900/40 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-900/40 focus-visible:outline-hidden dark:border-red-800/50 dark:bg-dark dark:shadow-gray-800 dark:hover:border-red-700/70 dark:hover:bg-red-900/25">
											<span class="rounded-md bg-red-50 px-2 py-0.5 font-didact text-lg font-bold tabular-nums text-red-900 dark:bg-red-900/40 dark:text-red-100">
												{amLabel(row)}
											</span>
											<span class="grid min-w-0">
												<span class="truncate text-lg font-semibold">
													{row.last_name} {row.first_name}
													<Show when={row.fathers_name}>
														{" "}
														<span class="font-normal text-gray-500 dark:text-gray-400">({row.fathers_name})</span>
													</Show>
												</span>
												<span class="truncate text-sm text-gray-600 dark:text-gray-300">{resultMeta(row)}</span>
											</span>
											<span class="flex items-center gap-x-2">
												<Show when={row.needs_review}>
													<span
														title="Χρειάζεται έλεγχο"
														class="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-700 dark:text-amber-50">
														έλεγχος
													</span>
												</Show>
												<i
													class="fa-solid fa-chevron-right text-red-900/60 transition-transform group-hover:translate-x-0.5 dark:text-red-200/60"
													aria-hidden="true"></i>
											</span>
										</button>
									)}
								</For>
							</div>
						</Show>
					</div>
				</Show>

				{/* ---- record ---- */}
				<Show when={selectedId() !== null}>
					<Show
						when={record()}
						fallback={
							<Show when={loadingRecord()}>
								<div class="py-16">
									<Spinner />
								</div>
							</Show>
						}>
						{(data) => (
							<div class="grid w-full gap-y-4">
								{/* header + actions */}
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div class="grid gap-y-1">
										<h1 class="font-anaktoria text-4xl leading-tight max-sm:text-3xl">
											{data().pupil.last_name} {data().pupil.first_name}
										</h1>
										<p class="flex flex-wrap items-center gap-x-2 font-didact text-base text-gray-600 dark:text-gray-300">
											<Show when={data().pupil.needs_review}>
												<span class="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-700 dark:text-amber-50">
													χρειάζεται έλεγχο
												</span>
											</Show>
										</p>
									</div>
									<TableControlsGroup prefix={PREFIX}>
										<TableControl prefix={PREFIX} action={editAction} />
										<TableControl prefix={PREFIX} action={enrollAction} />
									</TableControlsGroup>
								</div>

								<Show when={data().pupil.review_note}>
									<p class="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm dark:border-amber-600 dark:bg-amber-900/25">
										<i class="fa-solid fa-triangle-exclamation mr-2 text-amber-700 dark:text-amber-300" aria-hidden="true"></i>
										{data().pupil.review_note}
									</p>
								</Show>

								<div class="grid grid-cols-[minmax(260px,1fr)_2fr] gap-4 max-lg:grid-cols-1">
									{/* ---- left: personal information ---- */}
									<section class="grid h-max gap-y-3 rounded-xl border border-red-900/20 bg-white p-4 shadow-md shadow-gray-300 dark:border-red-800/50 dark:bg-dark dark:shadow-gray-700">
										<h2 class="font-anaktoria text-2xl">Στοιχεία Μαθητή</h2>
										<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm [&_dt]:text-gray-600 [&_dd]:tabular-nums dark:[&_dt]:text-gray-300 [&_dt]:underline [&_dd]:underline-offset-1">
											<dt>ΑΜ:</dt>
											<dd class="font-semibold">{amLabel(data().pupil)}</dd>
											<dt>ΑΜΚΑ:</dt>
											<dd class="tabular-nums">{data().pupil.amka || "-"}</dd>
											<dt>Πατρώνυμο:</dt>
											<dd>{data().pupil.fathers_name || "-"}</dd>
											<dt>Γέννηση:</dt>
											<dd>{formatDate(data().pupil.birth_date)}</dd>
											<dt>Διεύθυνση:</dt>
											<dd>
												{data().pupil.road} {data().pupil.number}
												<Show when={data().pupil.region}>
													<br />
													{data().pupil.tk} {data().pupil.region}
												</Show>
											</dd>
											<dt>Τηλέφωνα:</dt>
											<dd>
												{data().pupil.telephone || "-"}
												<br />
												{data().pupil.cellphone || "-"}
											</dd>
											<dt>Email:</dt>
											<dd class="break-all">{data().pupil.email || "-"}</dd>
											<dt class="pt-1">Σύνδεσμος:</dt>
											<dd>
												<Show when={data().pupil.registration_url} fallback="-">
													<a
														href={`/eggrafes/?regid=${encodeURIComponent(data().pupil.registration_url)}`}
														target="_blank"
														rel="noreferrer"
														title="Άνοιγμα της φόρμας εγγραφής σε νέα καρτέλα"
														aria-label="Άνοιγμα της φόρμας εγγραφής σε νέα καρτέλα"
														class="inline-grid h-7 w-7 place-items-center rounded-md border border-red-900/40 text-red-900 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-900/40 focus-visible:outline-hidden dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900/35">
														<i class="fa-solid fa-up-right-from-square text-sm" aria-hidden="true"></i>
													</a>
												</Show>
											</dd>
										</dl>
									</section>

									{/* ---- right: music types + history ---- */}
									<section class="grid h-max gap-y-4 rounded-xl border border-red-900/20 bg-white p-4 shadow-md shadow-gray-300 dark:border-red-800/50 dark:bg-dark dark:shadow-gray-700">
										<Show
											when={availableMusicTypes(data().enrollments).length > 0}
											fallback={<p class="text-gray-600 dark:text-gray-300">Δεν υπάρχουν εγγραφές.</p>}>
											{/* tabs — only the departments this pupil ever enrolled in */}
											<div
												role="tablist"
												aria-label="Μουσικές"
												class="flex flex-wrap gap-2"
												onKeyDown={(event) => {
													if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
													const tabs = availableMusicTypes(data().enrollments);
													const current = Math.max(tabs.indexOf(activeMusic() ?? tabs[0]), 0);
													const next = (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
													event.preventDefault();
													setActiveMusic(tabs[next]);
													const tabButtons = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("[role='tab']");
													tabButtons[next]?.focus();
												}}>
												<For each={availableMusicTypes(data().enrollments)}>
													{(classId) => (
														<button
															type="button"
															role="tab"
															aria-selected={activeMusic() === classId ? "true" : "false"}
															tabIndex={activeMusic() === classId ? 0 : -1}
															onClick={() => setActiveMusic(classId)}
															class={
																"rounded-full px-4 py-1.5 font-didact text-sm font-semibold transition-colors " +
																(activeMusic() === classId
																	? "bg-red-900 text-red-50 dark:bg-red-800"
																	: "border border-red-900 text-red-900 hover:bg-red-50 dark:border-red-700 dark:text-red-100 dark:hover:bg-red-900/35")
															}>
															{musicLabel(classId)}
															<span class="ml-2 opacity-70">{enrollmentsFor(classId).length}</span>
														</button>
													)}
												</For>
											</div>

											{/* history for the active department, grouped by instrument/class */}
											<div class="grid gap-y-4">
												<For each={instrumentGroups()}>
													{(group) => (
														<div class="grid gap-y-1">
															<p class="flex flex-wrap items-baseline gap-x-2">
																<span class="font-anaktoria text-lg">{group.name}</span>
																<span class="font-didact text-sm text-gray-500 dark:text-gray-400">
																	{countLabel(group.rows.length, "εγγραφή", "εγγραφές")}
																</span>
															</p>
															<div class="overflow-x-auto">
																<table class="w-full border-collapse font-didact text-sm">
																	<thead>
																		<tr class="bg-red-50 text-left dark:bg-red-900/25">
																			<th scope="col" class="px-2 py-1.5 font-semibold">
																				Έτος
																			</th>
																			<th scope="col" class="px-2 py-1.5 font-semibold">
																				Τάξη
																			</th>
																			<th scope="col" class="px-2 py-1.5 font-semibold">
																				Καθηγητής
																			</th>
																			<th scope="col" class="px-2 py-1.5 text-right font-semibold">
																				Πληρωμή
																			</th>
																			<th scope="col" class="px-2 py-1.5 text-center font-semibold">
																				Προάχθει
																			</th>
																		</tr>
																	</thead>
																	<tbody>
																		<For each={group.rows}>
																			{(row) => (
																				<tr class="border-t border-red-900/10 transition-colors hover:bg-red-50/60 dark:border-red-800/40 dark:hover:bg-red-900/15">
																					<td class="whitespace-nowrap px-2 py-1.5 tabular-nums">
																						{row.registration_year}
																					</td>
																					<td class="whitespace-nowrap px-2 py-1.5">{row.class_year || "-"}</td>
																					<td class="px-2 py-1.5">{teacherName(row.teacher_id)}</td>
																					<td class="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
																						{row.payment_amount} / {row.total_payment} €
																					</td>
																					<td class="px-2 py-1.5 text-center">
																						<span
																							class={
																								"rounded-full px-2 py-0.5 text-xs font-semibold " +
																								(row.pass
																									? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
																									: "bg-gray-200 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200")
																							}>
																							{row.pass ? "Ναί" : "Όχι"}
																						</span>
																					</td>
																				</tr>
																			)}
																		</For>
																	</tbody>
																</table>
															</div>
														</div>
													)}
												</For>
											</div>
										</Show>
									</section>
								</div>
							</div>
						)}
					</Show>
				</Show>
			</div>

			{/* ---- pinned bottom: pagination (list only) ---- */}
			<Show when={selectedId() === null && results() && results()!.total > PAGE_SIZE}>
				<div class="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-center gap-x-4 pt-4">
					<button
						type="button"
						disabled={page() === 0}
						onClick={() => goToPage(page() - 1)}
						class="rounded-md border border-red-900 px-3 py-1 font-didact text-sm transition-colors hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-red-700 dark:hover:bg-red-900/35 dark:disabled:hover:bg-transparent">
						Προηγούμενη
					</button>
					<span class="font-didact text-sm text-gray-600 dark:text-gray-300">
						Σελίδα {page() + 1} / {Math.max(1, Math.ceil(results()!.total / PAGE_SIZE))}
					</span>
					<button
						type="button"
						disabled={(page() + 1) * PAGE_SIZE >= results()!.total}
						onClick={() => goToPage(page() + 1)}
						class="rounded-md border border-red-900 px-3 py-1 font-didact text-sm transition-colors hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-red-700 dark:hover:bg-red-900/35 dark:disabled:hover:bg-transparent">
						Επόμενη
					</button>
				</div>
			</Show>
		</div>
	);
}

// ---------------------------------------------------------------------------

function emptyAction(type: ActionEnum, icon: ActionIcon) {
	return { type, icon };
}
