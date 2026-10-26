import { customEvent } from "@_types/custom-events";
import type { Instruments, PupilEnrollments, Pupils, PupilSearchResult, Teachers } from "@_types/entities";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { classYearLabel, EVALUATION_LABEL, MusicTypeArr } from "@lib/classYears";
import { currentSchoolYear } from "@lib/pupils/years";
import { API, type APIResponse } from "@routes/index.client";
import { ExtendedFormData } from "@utilities/forms";
import { createComponent, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { InputFields, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import { EnrollmentPlacementFields, EvaluationBadge, FeeManualMarker, readPlacementFields } from "./controls/Registrations/EnrollmentFeeFields.solid";
import { storedPaymentFields } from "./controls/Registrations/helpers";
import PupilFeesDialog from "./PupilFeesDialog.solid";
import Modal, { setGlobalOpen } from "./table/Modal.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import type { Action } from "./table/TableControls.solid";

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
/** Own modal prefix for the per-row enrollment editor (the pupil editor already uses PREFIX + MODIFY). */
const ENROLLMENT_PREFIX = "pupils-enrollment";

const MUSIC_TYPES = [
	{
		id: 0,
		label: "Βυζαντινή Μουσική",
		short: "Βυζαντινή",
		chip: "bg-red-100 text-red-900 dark:bg-red-900/45 dark:text-red-100",
		dot: "bg-red-700 dark:bg-red-400",
	},
	{
		id: 1,
		label: "Παραδοσιακή Μουσική",
		short: "Παραδοσιακή",
		chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/45 dark:text-emerald-100",
		dot: "bg-emerald-600 dark:bg-emerald-400",
	},
	{
		id: 2,
		label: "Ευρωπαϊκή Μουσική",
		short: "Ευρωπαϊκή",
		chip: "bg-sky-100 text-sky-900 dark:bg-sky-900/45 dark:text-sky-100",
		dot: "bg-sky-600 dark:bg-sky-400",
	},
] as const;

const musicType = (classId: number) => MUSIC_TYPES.find((type) => type.id === classId);
const musicLabel = (classId: number) => musicType(classId)?.label ?? "Άγνωστο";

// ---- shared look ------------------------------------------------------------
// The admin layout maps `.bg-white` to #242424 in dark mode, so `bg-white` IS the card surface in both themes.
const CARD = "rounded-2xl border border-gray-200 bg-white shadow-sm shadow-gray-200/60 dark:border-white/10 dark:shadow-none";
const BTN =
	"inline-flex items-center justify-center gap-x-2 whitespace-nowrap rounded-xl px-3.5 py-2 font-didact text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY = BTN + " bg-red-900 text-white! hover:bg-red-800 dark:bg-red-800 dark:hover:bg-red-700";
const BTN_SECONDARY =
	BTN +
	" border border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 dark:border-neutral-600 dark:hover:border-neutral-500 dark:hover:bg-neutral-700";
const BTN_DANGER = BTN + " text-red-700 hover:bg-red-50 dark:text-red-300! dark:hover:bg-red-900/30";
const ICON_BTN =
	"inline-grid size-9 place-items-center rounded-lg text-red-900 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-800 dark:text-red-200 dark:hover:bg-red-900/35";
const MUTED = "text-gray-500 dark:text-gray-400";
const CALLOUT_WARN = "rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-base dark:border-amber-500/40 dark:bg-amber-900/20";

/** Department chip with its colour dot. */
function MusicChip(props: { classId: number; count?: number; size?: "sm" | "md" }) {
	const type = () => musicType(props.classId);
	return (
		<span
			class={
				"inline-flex items-center gap-x-1.5 rounded-full font-semibold " +
				(props.size === "sm" ? "px-2 py-0.5 text-xs " : "px-2.5 py-1 text-sm ") +
				(type()?.chip ?? "bg-gray-100 text-gray-800")
			}>
			<span class={"size-1.5 shrink-0 rounded-full " + (type()?.dot ?? "bg-gray-500")} aria-hidden="true"></span>
			{type()?.short ?? "Άγνωστο"}
			<Show when={props.count !== undefined}>
				<span class="tabular-nums opacity-70">{props.count}</span>
			</Show>
		</span>
	);
}

const ReviewChip = (props: { long?: boolean }) => (
	<span
		title="Χρειάζεται έλεγχο"
		class="inline-flex items-center gap-x-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-500/40">
		<i class="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true"></i>
		{props.long ? "χρειάζεται έλεγχο" : "έλεγχος"}
	</span>
);

/** One «label: value» line of the details card. */
const Detail = (props: { label: string; children: JSX.Element }) => (
	<div class="grid grid-cols-[7rem_1fr] items-baseline gap-x-3 py-1">
		<dt class={"text-sm " + MUTED}>{props.label}</dt>
		<dd class="min-w-0 break-words text-base">{props.children}</dd>
	</div>
);

const DetailGroup = (props: { title: string; children: JSX.Element }) => (
	<div class="grid gap-y-1 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 dark:border-white/5">
		<h3 class={"pb-1 text-xs font-bold tracking-wider " + MUTED}>{props.title}</h3>
		<dl>{props.children}</dl>
	</div>
);

const initials = (pupil: Pick<Pupils, "last_name" | "first_name">) =>
	`${pupil.last_name.trim().charAt(0)}${pupil.first_name.trim().charAt(0)}`.toLocaleUpperCase("el");

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
			tooltip: { message: ["Κενό = χωρίς ΑΜ (εκκρεμεί απονομή)."], position: "bottom" },
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

/** The instruments a music type is taught with (Βυζαντινή has none). */
const instrumentsForClassId = (instruments: Instruments[], classId: number) => instruments.filter((instrument) => instrument.type === MusicTypeArr[classId]);

/** Rewrites a select's options in place, keeping `Input`'s blank first option. */
function setSelectOptions(select: HTMLSelectElement | null | undefined, options: { value: string | number; label: string }[]) {
	select?.replaceChildren(new Option("", "undefined"), ...options.map((option) => new Option(option.label, String(option.value))));
}

/**
 * Enroll / edit-enrollment form: one history row (a year, a music type, a class/instrument).
 *
 * The inputs are built once per modal open and `Input` freezes the props it is
 * given, so `class_id`'s change handler re-fills the instrument select: it
 * belongs to the music type being enrolled in, which is not necessarily the tab
 * the modal was opened from. The class year and «Υπό Κατάταξη» live in the
 * «Κατάταξη» field (`EnrollmentPlacementFields`), which follows `class_id` on its
 * own. Fees and payments live in the «Δίδακτρα μαθητή» dialog.
 *
 * `defaults.id` set = editing that enrollment.
 */
function enrollmentInputs(teachers: Teachers[], instruments: Instruments[], defaults: Partial<PupilEnrollments>): Record<string, InputProps> {
	const defaultClassId = defaults.class_id ?? 0;
	const teacherList = teachers.filter((teacher) => teacher.id >= 0).sort((a, b) => a.fullname.localeCompare(b.fullname, "el"));
	const instrumentList = instrumentsForClassId(instruments, defaultClassId);

	return {
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			required: true,
			iconClasses: "fa-solid fa-calendar-days",
			placeholder: currentSchoolYear(),
			// Most enrollments added by the secretariat are for the current school year; still editable for past ones.
			value: defaults.registration_year || currentSchoolYear(),
		},
		class_id: {
			label: "Μουσική",
			name: "class_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-music",
			selectList: MUSIC_TYPES.map((type) => type.label),
			valueList: MUSIC_TYPES.map((type) => type.id),
			value: defaultClassId,
			listeners: true,
			onchange: (event) => {
				const classSelect = event.currentTarget as HTMLSelectElement;
				const classId = Number(classSelect.value);
				const form = classSelect.form as HTMLFormElement;
				// Rebuilt empty-selected: an instrument of the previous department must not survive the switch.
				const instrumentSelect = form?.querySelector("select[name='instrument_id']") as any as HTMLSelectElement;
				setSelectOptions(
					instrumentSelect,
					instrumentsForClassId(instruments, classId).map((instrument) => ({ value: instrument.id, label: instrument.name })),
				);
				// Όργανο is a Παραδοσιακή/Ευρωπαϊκή field only (see `Input.listeners`).
				instrumentSelect?.dispatchEvent(customEvent("enable_input", classId !== 0));
			},
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			iconClasses: "fa-solid fa-chalkboard-user",
			selectList: teacherList.map((teacher) => teacher.fullname),
			valueList: teacherList.map((teacher) => teacher.id),
			value: defaults.teacher_id,
		},
		instrument_id: {
			label: "Όργανο / Μάθημα",
			name: "instrument_id",
			type: "select",
			iconClasses: "fa-solid fa-guitar",
			selectList: instrumentList.map((instrument) => instrument.name),
			valueList: instrumentList.map((instrument) => instrument.id),
			show: defaultClassId !== 0,
			listeners: true,
			value: defaults.instrument_id,
		},
		placement: {
			label: "Κατάταξη",
			name: "placement",
			type: "custom",
			render: () =>
				createComponent(EnrollmentPlacementFields, {
					classId: defaultClassId,
					classYear: defaults.class_year ?? "",
					evaluation: !!defaults.evaluation,
				}),
		},
		pass: {
			label: "Προήχθη",
			name: "pass",
			type: "multiselect",
			iconClasses: "fa-solid fa-check",
			multiselectOnce: true,
			multiselectList: [
				{ value: 1, label: "Ναι", selected: !!defaults.pass },
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
	// «Δίδακτρα μαθητή» dialog
	const [feesOpen, setFeesOpen] = createSignal(false);

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
	 *
	 * Opening a record from the list PUSHES a history entry (`pushOnNextSync`), so the
	 * browser's Back closes the record (see the popstate listener) instead of leaving the
	 * page; everything else replaces. The router's `history.state` (`_depth`) is preserved.
	 */
	let pushOnNextSync = false;
	const syncUrl = (id: number | null) => {
		const text = untrack(() => query()).trim();
		const params = new URLSearchParams(window.location.search);
		if (id === null) params.delete("pupil");
		else params.set("pupil", String(id));
		if (text) params.set("q", text);
		else params.delete("q");
		const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
		if (next === `${window.location.pathname}${window.location.search}`) return;
		const state = window.history.state as { _depth?: number; pupilRecord?: number } | null;
		if (pushOnNextSync && id !== null) {
			pushOnNextSync = false;
			window.history.pushState({ ...state, _depth: (state?._depth ?? window.history.length - 1) + 1, pupilRecord: id }, "", next);
		} else {
			// `pupilRecord` marks only an entry this page pushed (a deep link has none): keep it while it still
			// describes the same record, drop it otherwise.
			window.history.replaceState({ ...state, pupilRecord: state?.pupilRecord === id ? id : undefined }, "", next);
		}
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
		pushOnNextSync = true;
		scrollToTop();
		void loadPupil(id);
	};

	const closeRecord = () => {
		setFeesOpen(false);
		setSelectedId(null);
		setRecord(null);
		setActiveMusic(null);
	};

	/** Back to the result list without touching the query. */
	const backToSearch = () => {
		// The record was opened from the list (its own history entry): step back through it, so the
		// browser's Back/Forward stay in line; the popstate listener closes the record.
		if ((window.history.state as { pupilRecord?: number } | null)?.pupilRecord === selectedId()) {
			window.history.back();
			return;
		}
		closeRecord();
		scrollToTop();
		searchInput?.focus();
	};

	// Browser Back/Forward: follow `?pupil=` — close the record when it is gone, (re)open it when it differs.
	const onPopState = () => {
		const raw = new URLSearchParams(window.location.search).get("pupil");
		const id = raw && /^\d+$/.test(raw) ? Number(raw) : null;
		if (id === selectedId()) return;
		pushOnNextSync = false;
		if (id === null) {
			closeRecord();
			scrollToTop();
			searchInput?.focus();
		} else {
			scrollToTop();
			void loadPupil(id);
		}
	};
	window.addEventListener("popstate", onPopState);
	onCleanup(() => window.removeEventListener("popstate", onPopState));

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

		return {
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD,
			headerText: "Προσθήκη Εγγραφής",
			submitText: "Προσθήκη",
			inputs: inputs.getInputs(),
			onSubmit: async (form: ExtendedFormData<PupilEnrollments>) => {
				const classId = form.number("class_id", 0);
				const placement = readPlacementFields(form);
				// No total: the server prices it from the catalog; payments go through «Δίδακτρα μαθητή».
				await apiHook(API.Pupils.enroll, {
					RequestObject: {
						pupil_id: data.pupil.id,
						registration_year: form.string("registration_year"),
						class_id: classId as 0 | 1 | 2,
						class_year: placement.class_year,
						evaluation: placement.evaluation,
						teacher_id: form.number("teacher_id", -1),
						instrument_id: classId ? form.number("instrument_id", 0) : 0,
						date: Date.now(),
						pass: form.multiSelect("pass", "boolean", { single: true }),
					},
				});
				pushAlert(createAlert("success", "Επιτυχής προσθήκη εγγραφής"));
				await loadPupil(data.pupil.id);
				void runSearch(page());
			},
		};
	});

	/** Deletes the open pupil with their whole history (one batch on the server), then returns to the list. */
	const deleteAction = createMemo<Action | ReturnType<typeof emptyAction>>(() => {
		const data = record();
		if (!data) return emptyAction(ActionEnum.DELETE, ActionIcon.DELETE_USER);
		const { pupil, enrollments } = data;
		const paid = enrollments.reduce((sum, enrollment) => sum + (enrollment.payment_amount || 0), 0);
		const summary = [
			`${pupil.last_name} ${pupil.first_name} — ΑΜ ${amLabel(pupil)}`,
			`Θα διαγραφούν ${countLabel(enrollments.length, "εγγραφή", "εγγραφές")} του ιστορικού, μαζί με τα δίδακτρα και τις πληρωμές τους.`,
		];
		if (paid > 0) summary.push(`Καταχωρημένες πληρωμές που θα χαθούν: ${paid} €`);
		summary.push("Ο σύνδεσμος επανεγγραφής του μαθητή θα πάψει να λειτουργεί.", "Η ενέργεια δεν αναιρείται.");

		return {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_USER,
			label: "Διαγραφή μαθητή",
			headerText: "Διαγραφή Μαθητή",
			submitText: "Διαγραφή",
			summary,
			inputs: pupil.email.trim()
				? {
						unsubscribe: {
							label: `Διαγραφή του ${pupil.email.trim()} από το newsletter`,
							name: "unsubscribe",
							type: "multiselect",
							iconClasses: "fa-solid fa-envelope",
							multiselectOnce: true,
							tooltip: { message: ["Η διεύθυνση παραμένει αν τη χρησιμοποιεί κι άλλος μαθητής."], position: "top" },
							multiselectList: [
								{ value: 1, label: "Ναι", selected: true },
								{ value: 0, label: "Όχι", selected: false },
							],
						},
					}
				: {},
			onSubmit: async (form: ExtendedFormData<{ unsubscribe: boolean }>) => {
				const unsubscribe = pupil.email.trim() ? form.multiSelect("unsubscribe", "boolean", { single: true }) : false;
				const res = await apiHook(API.Pupils.delete, { RequestObject: { id: pupil.id, unsubscribe } });
				if (!("data" in res)) return;
				const removed = res.data.unsubscribed ? " και το email από το newsletter" : "";
				pushAlert(createAlert("success", `Διαγράφηκε ο μαθητής ${pupil.last_name} ${pupil.first_name}${removed}`));
				backToSearch();
				void runSearch(page());
			},
		};
	});

	// ---- edit one history row (also how the review flow places «Υπό Κατάταξη» rows) ----
	const [editingEnrollment, setEditingEnrollment] = createSignal<PupilEnrollments | null>(null);
	const editEnrollmentAction = createMemo<Action | ReturnType<typeof emptyAction>>(() => {
		const data = record();
		const enrollment = editingEnrollment();
		if (!data || !enrollment) return emptyAction(ActionEnum.MODIFY, ActionIcon.MODIFY);
		const inputs = enrollmentInputs(teachers(), instruments(), enrollment);
		return {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
			label: "Επεξεργασία εγγραφής",
			headerText: `Ενημέρωση Εγγραφής ${enrollment.registration_year}`,
			submitText: "Ενημέρωση",
			inputs,
			onSubmit: async (form: ExtendedFormData<PupilEnrollments>) => {
				const classId = form.number("class_id", 0);
				const placement = readPlacementFields(form);
				await apiHook(API.Pupils.updateEnrollment, {
					RequestObject: {
						id: enrollment.id,
						pupil_id: data.pupil.id,
						registration_year: form.string("registration_year"),
						class_id: classId as 0 | 1 | 2,
						class_year: placement.class_year,
						evaluation: placement.evaluation,
						teacher_id: form.number("teacher_id", -1),
						instrument_id: classId ? form.number("instrument_id", 0) : 0,
						date: enrollment.date,
						// Fees and payments belong to the «Δίδακτρα μαθητή» dialog: resend the stored values.
						...storedPaymentFields(enrollment),
						pass: form.multiSelect("pass", "boolean", { single: true }),
					},
				});
				pushAlert(createAlert("success", "Επιτυχής ενημέρωση εγγραφής"));
				await loadPupil(data.pupil.id);
				void runSearch(page());
			},
		};
	});
	// The modal reads its action from a store (like `TableControl`).
	const [editEnrollmentStore, setEditEnrollmentStore] = createStore<{ action: Action }>({ action: editEnrollmentAction() as Action });
	createEffect(() => setEditEnrollmentStore({ action: editEnrollmentAction() as Action }));
	const openEnrollmentEditor = (enrollment: PupilEnrollments) => {
		setEditingEnrollment(enrollment);
		setGlobalOpen(ENROLLMENT_PREFIX + ActionEnum.MODIFY, true);
	};

	/** Enrollments still awaiting placement (evaluation without a class year), newest first. */
	const awaitingPlacement = createMemo(() =>
		(record()?.enrollments ?? [])
			.filter((enrollment) => enrollment.evaluation && !enrollment.class_year)
			.sort((a, b) => b.registration_year.localeCompare(a.registration_year)),
	);

	/** One modal per record action (edit / enroll / delete), opened by the header buttons. */
	const modalStore = (action: () => Action | EmptyAction) => {
		const [store, setStore] = createStore<{ action: Action }>({ action: action() as Action });
		createEffect(() => setStore({ action: action() as Action }));
		return store;
	};
	const editStore = modalStore(editAction);
	const enrollStore = modalStore(enrollAction);
	const deleteStore = modalStore(deleteAction);
	const openModal = (type: ActionEnum) => setGlobalOpen(PREFIX + type, true);

	/** Fees at a glance: the current school year, or the newest the pupil has (as the fees dialog opens). */
	const feeSummary = createMemo(() => {
		const enrollments = record()?.enrollments ?? [];
		const years = [...new Set(enrollments.map((enrollment) => enrollment.registration_year))].sort((a, b) => b.localeCompare(a));
		const current = currentSchoolYear();
		const year = years.includes(current) || years.length === 0 ? current : years[0]!;
		const rows = enrollments.filter((enrollment) => enrollment.registration_year === year);
		const total = rows.reduce((sum, row) => sum + row.total_payment, 0);
		const paid = rows.reduce((sum, row) => sum + row.payment_amount, 0);
		return { year, count: rows.length, total, paid, balance: total - paid };
	});

	const registrationLink = (url: string) => `${window.location.origin}/eggrafes/?regid=${encodeURIComponent(url)}`;
	const copyRegistrationLink = async (url: string) => {
		try {
			await navigator.clipboard.writeText(registrationLink(url));
			pushAlert(createAlert("success", "Ο σύνδεσμος επανεγγραφής αντιγράφηκε"));
		} catch {
			pushAlert(createAlert("error", "Η αντιγραφή απέτυχε"));
		}
	};

	/** Paid / total of one history row, coloured by what is still owed. */
	const paymentCell = (row: PupilEnrollments) => (
		<Show when={row.total_payment > 0 || row.payment_amount > 0} fallback={<span class={MUTED}>—</span>}>
			<span
				class={
					"font-semibold " +
					(row.payment_amount >= row.total_payment ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")
				}>
				{row.payment_amount} / {row.total_payment} €
			</span>
		</Show>
	);

	// ---- render -------------------------------------------------------------
	// Shell: the admin content cell is already exactly one viewport tall
	// (#AdminPage: 100dvh grid rows), so the page fills it and scrolls its MIDDLE
	// section instead of growing the document — same shape as `Table`'s
	// top-tools / scrolling data / bottom-tools grid. On small screens the shell
	// releases the height and the page flows (and scrolls) normally.
	return (
		<div class="flex h-full w-full flex-col overflow-hidden p-6 font-didact text-red-950 max-sm:h-auto max-sm:overflow-visible max-sm:p-3 dark:text-red-50">
			{/* ---- pinned top: title + search ---- */}
			<div class="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-y-3">
				{/* ---- landing heading ---- */}
				<Show when={selectedId() === null}>
					<div class="grid justify-items-center gap-y-2 pt-[5vh] pb-3 text-center max-sm:pt-2">
						<span
							class="grid size-14 place-items-center rounded-2xl bg-red-900 text-2xl text-white shadow-md shadow-red-900/20 max-sm:hidden"
							aria-hidden="true">
							<i class="fa-solid fa-address-book"></i>
						</span>
						<h1 class="font-anaktoria text-5xl max-sm:text-4xl">Μαθητολόγιο</h1>
						<p class={"max-w-2xl text-lg " + MUTED}>Αναζητήστε μαθητή με τον Αριθμό Μητρώου ή το ονοματεπώνυμο.</p>
					</div>
				</Show>

				{/* ---- search ---- */}
				<div
					role="search"
					class="flex items-center gap-x-3 rounded-2xl border border-gray-300 bg-white px-4 py-3 shadow-sm shadow-gray-200/70 transition-[border-color,box-shadow] focus-within:border-red-800 focus-within:ring-4 focus-within:ring-red-800/10 dark:border-neutral-600 dark:shadow-none dark:focus-within:border-red-400 dark:focus-within:ring-red-400/15">
					<i class="fa-solid fa-magnifying-glass text-lg text-red-900/70 dark:text-red-200/70" aria-hidden="true"></i>
					<input
						ref={searchInput}
						type="search"
						name="pupil-search"
						autocomplete="off"
						spellcheck="false"
						aria-label="Αναζήτηση μαθητή με ΑΜ ή ονοματεπώνυμο"
						placeholder="ΑΜ ή ονοματεπώνυμο…"
						class="min-w-0 flex-1 bg-transparent text-xl text-red-950 placeholder:text-gray-400 focus-visible:outline-hidden max-sm:text-lg dark:text-red-50 dark:placeholder:text-gray-500 [&::-webkit-search-cancel-button]:appearance-none"
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
							title="Καθαρισμός"
							class="grid size-8 shrink-0 place-items-center rounded-full text-red-900 transition-colors hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
							onClick={() => {
								setQuery("");
								clearTimeout(debounceTimer);
								startSearch(0);
								searchInput?.focus();
							}}>
							<i class="fa-solid fa-xmark text-base leading-none" aria-hidden="true"></i>
						</button>
					</Show>
				</div>

				{/* ---- toolbar: back / result count + the review filter ---- */}
				<div class="flex flex-wrap items-center justify-between gap-2 px-1">
					<Show
						when={selectedId() !== null}
						fallback={
							<span class={"text-base " + MUTED} aria-live="polite">
								<Show when={results()}>
									<Show when={query().trim()} fallback={countLabel(results()!.total, "μαθητής", "μαθητές")}>
										{countLabel(results()!.total, "αποτέλεσμα", "αποτελέσματα")} για «{query().trim()}»
									</Show>
								</Show>
							</span>
						}>
						<button
							type="button"
							onClick={backToSearch}
							class={BTN + " -ml-2 px-2 py-1 text-red-900 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/30"}>
							<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
							Πίσω στα αποτελέσματα
						</button>
					</Show>
					<label class="inline-flex cursor-pointer items-center gap-x-2 rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold transition-colors select-none focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red-800 hover:border-amber-400 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-100 has-[:checked]:text-amber-900 dark:border-neutral-600 dark:has-[:checked]:border-amber-500/60 dark:has-[:checked]:bg-amber-900/40 dark:has-[:checked]:text-amber-100">
						<input
							type="checkbox"
							class="sr-only"
							checked={needsReviewOnly()}
							onChange={(e) => {
								setNeedsReviewOnly(e.currentTarget.checked);
								startSearch(0);
							}}
						/>
						<i
							class={(needsReviewOnly() ? "fa-solid fa-circle-check" : "fa-regular fa-circle") + " text-amber-600 dark:text-amber-300"}
							aria-hidden="true"></i>
						Μόνο προς έλεγχο
					</label>
				</div>
			</div>

			{/* ---- scrolling body: results or the open record ---- */}
			<div
				id="pupilsScroller"
				ref={bodyRef}
				class="mx-auto mt-4 flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-y-4 overflow-y-auto px-0.5 pb-4 max-sm:mt-3 max-sm:overflow-visible">
				{/* ---- result list ---- */}
				<Show when={selectedId() === null}>
					<Show
						when={!searching() || results()}
						fallback={
							<div class="py-10">
								<Spinner />
							</div>
						}>
						<Show
							when={(results()?.rows.length ?? 0) > 0}
							fallback={
								<Show when={results()}>
									<div class={CARD + " grid justify-items-center gap-y-2 px-6 py-12 text-center"}>
										<i class={"fa-solid fa-user-slash text-3xl " + MUTED} aria-hidden="true"></i>
										<p class="text-xl font-semibold">
											<Show when={query().trim()} fallback="Δεν βρέθηκαν μαθητές.">
												Δεν βρέθηκε μαθητής για «{query().trim()}».
											</Show>
										</p>
										<p class={"text-base " + MUTED}>Δοκιμάστε τον ΑΜ ή τα πρώτα γράμματα του επωνύμου.</p>
									</div>
								</Show>
							}>
							<ul class={CARD + " divide-y divide-gray-100 overflow-hidden dark:divide-white/5"}>
								<For each={results()?.rows ?? []}>
									{(row) => (
										<li>
											<button
												type="button"
												onClick={() => openPupil(row.id)}
												class="group grid w-full grid-cols-[4.75rem_1fr_auto] items-center gap-x-4 px-4 py-3 text-left transition-colors hover:bg-red-50/70 focus-visible:bg-red-50 focus-visible:outline-hidden max-sm:grid-cols-[3.75rem_1fr_auto] max-sm:gap-x-3 max-sm:px-3 dark:hover:bg-white/[0.04] dark:focus-visible:bg-white/[0.06]">
												<span
													class={
														"whitespace-nowrap rounded-lg bg-red-50 px-1.5 py-1 text-center font-bold tabular-nums text-red-900 ring-1 ring-red-900/10 dark:bg-red-900/30 dark:text-red-100 dark:ring-red-300/15 " +
														// review codes ('000-Ο43') are longer than any ΑΜ
														(row.am === null ? "text-sm leading-7" : "text-lg")
													}>
													{amLabel(row)}
												</span>
												<span class="grid min-w-0 gap-y-1">
													<span class="truncate text-lg">
														<span class="font-semibold">{row.last_name}</span> {row.first_name}
														<Show when={row.fathers_name}>
															<span class={"text-base " + MUTED}> · {row.fathers_name}</span>
														</Show>
													</span>
													<span class={"flex flex-wrap items-center gap-x-2 gap-y-1 text-sm " + MUTED}>
														<For each={row.music_types.split(",").filter(Boolean)}>
															{(id) => <MusicChip classId={Number(id)} size="sm" />}
														</For>
														<span>
															{countLabel(row.enrollment_count, "εγγραφή", "εγγραφές")}
															<Show when={row.last_registration_year}> · τελευταία {row.last_registration_year}</Show>
														</span>
													</span>
												</span>
												<span class="flex items-center gap-x-3">
													<Show when={row.needs_review}>
														<ReviewChip />
													</Show>
													<i
														class="fa-solid fa-chevron-right text-red-900/40 transition-transform group-hover:translate-x-0.5 group-hover:text-red-900 dark:text-red-200/40 dark:group-hover:text-red-200"
														aria-hidden="true"></i>
												</span>
											</button>
										</li>
									)}
								</For>
							</ul>
						</Show>
					</Show>
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
								{/* header: who + actions */}
								<section class={CARD + " flex flex-wrap items-center gap-4 p-5 max-sm:p-4"}>
									<span
										class="grid size-16 shrink-0 place-items-center rounded-2xl bg-red-900 font-anaktoria text-2xl text-white shadow-md shadow-red-900/25 max-sm:size-12 max-sm:text-xl"
										aria-hidden="true">
										{initials(data().pupil)}
									</span>
									<div class="grid min-w-0 flex-1 gap-y-2">
										<h1 class="font-anaktoria text-4xl leading-tight max-sm:text-3xl">
											{data().pupil.last_name} {data().pupil.first_name}
										</h1>
										<div class="flex flex-wrap items-center gap-2">
											<span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums ring-1 ring-gray-200 dark:bg-white/5 dark:ring-white/10">
												ΑΜ {amLabel(data().pupil)}
											</span>
											<For each={availableMusicTypes(data().enrollments)}>{(classId) => <MusicChip classId={classId} />}</For>
											<Show when={data().pupil.needs_review}>
												<ReviewChip long />
											</Show>
										</div>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<button type="button" class={BTN_SECONDARY} onClick={() => openModal(ActionEnum.MODIFY)}>
											<i class={ActionIcon.MODIFY} aria-hidden="true"></i>
											Επεξεργασία
										</button>
										<button type="button" class={BTN_PRIMARY} onClick={() => openModal(ActionEnum.ADD)}>
											<i class={ActionIcon.ADD} aria-hidden="true"></i>
											Νέα εγγραφή
										</button>
										<button
											type="button"
											class={BTN_DANGER}
											onClick={() => openModal(ActionEnum.DELETE)}
											aria-label="Διαγραφή μαθητή"
											title="Διαγραφή μαθητή">
											<i class={ActionIcon.DELETE_USER} aria-hidden="true"></i>
											Διαγραφή
										</button>
									</div>
								</section>

								<Show when={data().pupil.review_note}>
									<p class={CALLOUT_WARN + " flex items-start gap-x-3"}>
										<i class="fa-solid fa-triangle-exclamation mt-1 text-amber-600 dark:text-amber-300" aria-hidden="true"></i>
										<span>
											<span class="font-semibold">Σημείωση ελέγχου: </span>
											{data().pupil.review_note}
										</span>
									</p>
								</Show>

								{/* «Υπό Κατάταξη» rows awaiting a class year — one click opens the editor with the select empty. */}
								<Show when={awaitingPlacement().length > 0}>
									<section aria-labelledby="awaiting-placement-title" class={CALLOUT_WARN + " grid gap-y-3"}>
										<h2 id="awaiting-placement-title" class="flex items-center gap-x-2 font-semibold">
											<i class="fa-solid fa-hourglass-half text-amber-600 dark:text-amber-300" aria-hidden="true"></i>
											Εγγραφές που αναμένουν κατάταξη
										</h2>
										<ul class="grid gap-y-2">
											<For each={awaitingPlacement()}>
												{(enrollment) => (
													<li class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/70 px-3 py-2 dark:bg-black/20">
														<span class="font-semibold tabular-nums">{enrollment.registration_year}</span>
														<MusicChip classId={enrollment.class_id} size="sm" />
														<span class={MUTED}>{teacherName(enrollment.teacher_id)}</span>
														<button
															type="button"
															onClick={() => openEnrollmentEditor(enrollment)}
															class={BTN_SECONDARY + " ml-auto py-1 text-sm"}>
															Ορισμός έτους φοίτησης
															<span class="sr-only">
																{" "}
																— {enrollment.registration_year}, {musicLabel(enrollment.class_id)}
															</span>
														</button>
													</li>
												)}
											</For>
										</ul>
										<p class={"text-sm " + MUTED}>
											Όταν τοποθετηθούν όλες, καθαρίστε τη «Σημείωση ελέγχου» από την επεξεργασία στοιχείων μαθητή.
										</p>
									</section>
								</Show>

								<div class="grid grid-cols-[minmax(280px,1fr)_2.1fr] items-start gap-4 max-lg:grid-cols-1">
									{/* ---- left: personal information + the pupil's fees ---- */}
									<div class="grid gap-y-4">
										<section class={CARD + " grid gap-y-3 p-5"} aria-labelledby="pupil-details-title">
											<h2 id="pupil-details-title" class="font-anaktoria text-2xl">
												Στοιχεία μαθητή
											</h2>
											<DetailGroup title="ΤΑΥΤΟΤΗΤΑ">
												<Detail label="ΑΜ">
													<span class="font-semibold tabular-nums">{amLabel(data().pupil)}</span>
												</Detail>
												<Detail label="ΑΜΚΑ">
													<span class="tabular-nums">{data().pupil.amka || "—"}</span>
												</Detail>
												<Detail label="Πατρώνυμο">{data().pupil.fathers_name || "—"}</Detail>
												<Detail label="Γέννηση">{formatDate(data().pupil.birth_date)}</Detail>
											</DetailGroup>
											<DetailGroup title="ΕΠΙΚΟΙΝΩΝΙΑ">
												<Detail label="Κινητό">
													<Show when={data().pupil.cellphone} fallback="—">
														<a class="tabular-nums hover:underline" href={`tel:${data().pupil.cellphone}`}>
															{data().pupil.cellphone}
														</a>
													</Show>
												</Detail>
												<Detail label="Τηλέφωνο">
													<Show when={data().pupil.telephone && data().pupil.telephone !== "-"} fallback="—">
														<a class="tabular-nums hover:underline" href={`tel:${data().pupil.telephone}`}>
															{data().pupil.telephone}
														</a>
													</Show>
												</Detail>
												<Detail label="Email">
													<Show when={data().pupil.email} fallback="—">
														<a class="break-all hover:underline" href={`mailto:${data().pupil.email}`}>
															{data().pupil.email}
														</a>
													</Show>
												</Detail>
												<Detail label="Διεύθυνση">
													<Show when={data().pupil.road || data().pupil.region} fallback="—">
														{data().pupil.road} {data().pupil.number || ""}
														<Show when={data().pupil.region}>
															<br />
															{data().pupil.tk || ""} {data().pupil.region}
														</Show>
													</Show>
												</Detail>
											</DetailGroup>
											<Show when={data().pupil.registration_url}>
												<DetailGroup title="ΣΥΝΔΕΣΜΟΣ ΕΠΑΝΕΓΓΡΑΦΗΣ">
													<div class="flex flex-wrap gap-2 pt-1">
														<a
															href={registrationLink(data().pupil.registration_url)}
															target="_blank"
															rel="noreferrer"
															title="Άνοιγμα της φόρμας εγγραφής σε νέα καρτέλα"
															class={BTN_SECONDARY + " py-1.5 text-sm"}>
															<i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i>
															Άνοιγμα
														</a>
														<button
															type="button"
															class={BTN_SECONDARY + " py-1.5 text-sm"}
															onClick={() => copyRegistrationLink(data().pupil.registration_url)}>
															<i class="fa-regular fa-copy" aria-hidden="true"></i>
															Αντιγραφή
														</button>
													</div>
												</DetailGroup>
											</Show>
										</section>

										<section class={CARD + " grid gap-y-3 p-5"} aria-labelledby="pupil-fees-title">
											<div class="flex items-baseline justify-between gap-x-2">
												<h2 id="pupil-fees-title" class="font-anaktoria text-2xl">
													Δίδακτρα
												</h2>
												<span class={"text-sm tabular-nums " + MUTED}>{feeSummary().year}</span>
											</div>
											<Show
												when={feeSummary().count > 0}
												fallback={<p class={"text-base " + MUTED}>Καμία εγγραφή για το {feeSummary().year}.</p>}>
												<dl class="grid grid-cols-3 gap-2 text-center">
													<div class="rounded-xl bg-gray-50 px-2 py-2 dark:bg-white/5">
														<dt class={"text-xs " + MUTED}>Σύνολο</dt>
														<dd class="text-lg font-semibold tabular-nums">{feeSummary().total} €</dd>
													</div>
													<div class="rounded-xl bg-gray-50 px-2 py-2 dark:bg-white/5">
														<dt class={"text-xs " + MUTED}>Πληρώθηκαν</dt>
														<dd class="text-lg font-semibold tabular-nums">{feeSummary().paid} €</dd>
													</div>
													<div
														class={
															"rounded-xl px-2 py-2 " +
															(feeSummary().balance > 0
																? "bg-amber-50 dark:bg-amber-900/25"
																: "bg-emerald-50 dark:bg-emerald-900/25")
														}>
														<dt class={"text-xs " + MUTED}>Υπόλοιπο</dt>
														<dd
															class={
																"text-lg font-semibold tabular-nums " +
																(feeSummary().balance > 0
																	? "text-amber-800 dark:text-amber-200"
																	: "text-emerald-800 dark:text-emerald-200")
															}>
															{feeSummary().balance} €
														</dd>
													</div>
												</dl>
												<Show when={feeSummary().total > 0}>
													<div
														class="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
														role="progressbar"
														aria-label="Πληρωμένο ποσοστό διδάκτρων"
														aria-valuemin={0}
														aria-valuemax={100}
														aria-valuenow={Math.round(
															(Math.min(feeSummary().paid, feeSummary().total) / feeSummary().total) * 100,
														)}>
														<div
															class="h-full rounded-full bg-emerald-600 transition-[width] dark:bg-emerald-400"
															style={{
																width: `${(Math.min(feeSummary().paid, feeSummary().total) / feeSummary().total) * 100}%`,
															}}></div>
													</div>
												</Show>
											</Show>
											<button type="button" onClick={() => setFeesOpen(true)} class={BTN_SECONDARY + " w-full"}>
												<i class="fa-solid fa-euro-sign" aria-hidden="true"></i>
												Δίδακτρα & πληρωμές
											</button>
										</section>
									</div>

									{/* ---- right: music types + history ---- */}
									<section class={CARD + " grid gap-y-4 p-5 max-sm:p-4"} aria-labelledby="pupil-history-title">
										<div class="flex flex-wrap items-center justify-between gap-3">
											<h2 id="pupil-history-title" class="font-anaktoria text-2xl">
												Ιστορικό εγγραφών
											</h2>
											<Show when={availableMusicTypes(data().enrollments).length > 0}>
												{/* tabs — only the departments this pupil ever enrolled in */}
												<div
													role="tablist"
													aria-label="Μουσικές"
													class="inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-black/25"
													onKeyDown={(event) => {
														if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
														const tabs = availableMusicTypes(data().enrollments);
														const current = Math.max(tabs.indexOf(activeMusic() ?? tabs[0]), 0);
														const next = (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
														event.preventDefault();
														setActiveMusic(tabs[next]);
														const tabButtons = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
															"[role='tab']",
														);
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
																	"inline-flex items-center gap-x-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-red-800 " +
																	(activeMusic() === classId
																		? "bg-[#fff] shadow-sm dark:bg-neutral-700"
																		: "text-gray-600 hover:bg-white/60 dark:text-gray-300! dark:hover:bg-white/5")
																}>
																<span
																	class={"size-2 rounded-full " + (musicType(classId)?.dot ?? "")}
																	aria-hidden="true"></span>
																{musicType(classId)?.short}
																<span class="tabular-nums opacity-60">{enrollmentsFor(classId).length}</span>
															</button>
														)}
													</For>
												</div>
											</Show>
										</div>
										<Show
											when={availableMusicTypes(data().enrollments).length > 0}
											fallback={
												<div class="grid justify-items-center gap-y-2 py-10 text-center">
													<i class={"fa-regular fa-folder-open text-3xl " + MUTED} aria-hidden="true"></i>
													<p class={"text-lg " + MUTED}>Δεν υπάρχουν εγγραφές.</p>
													<button type="button" class={BTN_PRIMARY} onClick={() => openModal(ActionEnum.ADD)}>
														<i class={ActionIcon.ADD} aria-hidden="true"></i>
														Νέα εγγραφή
													</button>
												</div>
											}>
											{/* history for the active department, grouped by instrument/class */}
											<div class="grid gap-y-5">
												<For each={instrumentGroups()}>
													{(group) => (
														<div class="grid gap-y-2">
															<p class="flex flex-wrap items-baseline gap-x-2">
																<span class="text-lg font-semibold">{group.name}</span>
																<span class={"text-sm " + MUTED}>{countLabel(group.rows.length, "εγγραφή", "εγγραφές")}</span>
															</p>
															<div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
																<table class="w-full border-collapse text-base">
																	<thead>
																		<tr
																			class={
																				"bg-gray-50 text-left text-sm dark:bg-white/[0.04] [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold " +
																				MUTED
																			}>
																			<th scope="col">Έτος</th>
																			<th scope="col">Τάξη</th>
																			<th scope="col">Καθηγητής</th>
																			<th scope="col" class="text-right">
																				Πληρωμή
																			</th>
																			<th scope="col" class="text-center">
																				Προήχθη
																			</th>
																			<th scope="col">
																				<span class="sr-only">Ενέργειες</span>
																			</th>
																		</tr>
																	</thead>
																	<tbody class="divide-y divide-gray-100 dark:divide-white/5">
																		<For each={group.rows}>
																			{(row) => (
																				<tr class="transition-colors hover:bg-red-50/50 dark:hover:bg-white/[0.03] [&>td]:px-3 [&>td]:py-2">
																					<td class="whitespace-nowrap font-semibold tabular-nums">
																						{row.registration_year}
																					</td>
																					<td class="whitespace-nowrap">
																						<Show
																							when={row.evaluation && !row.class_year}
																							fallback={
																								<>
																									{classYearLabel(row.class_year, row.evaluation) || "—"}
																									<Show when={row.evaluation}>
																										<EvaluationBadge />
																									</Show>
																								</>
																							}>
																							<span class="rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:ring-amber-500/40">
																								{EVALUATION_LABEL}
																							</span>
																						</Show>
																					</td>
																					<td>{teacherName(row.teacher_id)}</td>
																					<td class="whitespace-nowrap text-right tabular-nums">
																						{paymentCell(row)}
																						<Show when={row.fee_manual}>
																							<span class="ml-1">
																								<FeeManualMarker compact />
																							</span>
																						</Show>
																					</td>
																					<td class="text-center">
																						<Show
																							when={row.pass}
																							fallback={<span class={"text-sm " + MUTED}>Όχι</span>}>
																							<span class="inline-flex items-center gap-x-1 rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
																								<i class="fa-solid fa-check text-xs" aria-hidden="true"></i>
																								Ναι
																							</span>
																						</Show>
																					</td>
																					<td class="w-0 text-right">
																						<button
																							type="button"
																							onClick={() => openEnrollmentEditor(row)}
																							aria-label={`Επεξεργασία εγγραφής ${row.registration_year}`}
																							title="Επεξεργασία εγγραφής"
																							class={ICON_BTN}>
																							<i class={ActionIcon.MODIFY + " text-base"} aria-hidden="true"></i>
																						</button>
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

			{/* «Δίδακτρα μαθητή»: the pupil's fees and payments per school year */}
			<Show when={record()}>
				{(data) => (
					<PupilFeesDialog
						open={feesOpen()}
						onClose={() => setFeesOpen(false)}
						onSaved={() => loadPupil(data().pupil.id)}
						pupil={{ id: data().pupil.id, name: `${data().pupil.last_name} ${data().pupil.first_name}`, am: amLabel(data().pupil) }}
						enrollments={data().enrollments}
						teachers={teachers()}
						instruments={instruments()}
					/>
				)}
			</Show>

			{/* record actions (header buttons) */}
			<Show when={"inputs" in editAction()}>
				<Modal prefix={PREFIX} actionStore={editStore} />
			</Show>
			<Show when={"inputs" in enrollAction()}>
				<Modal prefix={PREFIX} actionStore={enrollStore} />
			</Show>
			<Show when={"inputs" in deleteAction()}>
				<Modal prefix={PREFIX} actionStore={deleteStore} />
			</Show>

			{/* per-row enrollment editor (opened from the history rows / the awaiting-placement list) */}
			<Show when={"inputs" in editEnrollmentAction()}>
				<Modal prefix={ENROLLMENT_PREFIX} actionStore={editEnrollmentStore} />
			</Show>

			{/* ---- pinned bottom: pagination (list only) ---- */}
			<Show when={selectedId() === null && results() && results()!.total > PAGE_SIZE}>
				<nav aria-label="Σελίδες αποτελεσμάτων" class="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-center gap-x-3 pt-3">
					<button type="button" disabled={page() === 0} onClick={() => goToPage(page() - 1)} class={BTN_SECONDARY + " py-1.5"}>
						<i class="fa-solid fa-chevron-left text-sm" aria-hidden="true"></i>
						Προηγούμενη
					</button>
					<span class={"text-base tabular-nums " + MUTED}>
						Σελίδα {page() + 1} / {Math.max(1, Math.ceil(results()!.total / PAGE_SIZE))}
					</span>
					<button
						type="button"
						disabled={(page() + 1) * PAGE_SIZE >= results()!.total}
						onClick={() => goToPage(page() + 1)}
						class={BTN_SECONDARY + " py-1.5"}>
						Επόμενη
						<i class="fa-solid fa-chevron-right text-sm" aria-hidden="true"></i>
					</button>
				</nav>
			</Show>
		</div>
	);
}

// ---------------------------------------------------------------------------

function emptyAction(type: ActionEnum, icon: ActionIcon) {
	return { type, icon };
}
