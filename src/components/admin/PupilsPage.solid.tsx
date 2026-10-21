import { customEvent } from "@_types/custom-events";
import type { Instruments, PupilEnrollments, Pupils, PupilSearchResult, TeacherClasses, Teachers } from "@_types/entities";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { useLocation } from "@solidjs/router";
import { classYearLabel, EVALUATION_LABEL, MusicTypeArr } from "@lib/classYears";
import { currentSchoolYear } from "@lib/pupils/years";
import { API, type APIResponse } from "@routes/index.client";
import { ExtendedFormData } from "@utilities/forms";
import { createComponent, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { InputFields, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import { EnrollmentPlacementFields, EvaluationBadge, FeeManualMarker, readPlacementFields } from "./controls/Registrations/EnrollmentFeeFields.solid";
import { storedPaymentFields } from "./controls/Registrations/helpers";
import PupilFeesDialog from "./PupilFeesDialog.solid";
import Modal, { setGlobalOpen } from "./table/Modal.solid";
import { ActionEnum, ActionIcon } from "./table/TableControlTypes";
import { TableControl, TableControlsGroup, type Action } from "./table/TableControls.solid";
import Icon from "@components/other/Icon.solid";

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
	({ label, name, type, icon: "user", ...extra }) as InputProps;

/** Edit form: the pupil's identity and contact details. */
function pupilInputs(pupil: Pupils): Record<string, InputProps> {
	return {
		am: {
			label: "Αριθμός Μητρώου",
			name: "am",
			type: "number",
			icon: "id-card",
			tooltip: { message: ["Κενό = χωρίς ΑΜ (εκκρεμεί απονομή)."], position: "top" },
		},
		amka: { label: "ΑΜΚΑ", name: "amka", type: "text", icon: "id-card" },
		last_name: field("Επώνυμο", "last_name", "text", { required: true }),
		first_name: field("Όνομα", "first_name", "text", { required: true }),
		fathers_name: field("Πατρώνυμο", "fathers_name", "text"),
		birth_date: { label: "Ημερομηνία Γέννησης", name: "birth_date", type: "date", icon: "calendar" },
		road: { label: "Οδός", name: "road", type: "text", icon: "map-pin" },
		number: { label: "Αριθμός", name: "number", type: "number", icon: "hash" },
		tk: { label: "Τ.Κ.", name: "tk", type: "number", icon: "hash" },
		region: { label: "Δήμος/Περιοχή", name: "region", type: "text", icon: "city" },
		telephone: { label: "Τηλέφωνο", name: "telephone", type: "tel", icon: "phone" },
		cellphone: { label: "Κινητό", name: "cellphone", type: "tel", icon: "smartphone" },
		email: { label: "Email", name: "email", type: "email", icon: "mail" },
		review_note: { label: "Σημείωση ελέγχου", name: "review_note", type: "text", icon: "note" },
	};
}

/** The instruments a music type is taught with (Βυζαντινή has none). */
const instrumentsForClassId = (instruments: Instruments[], classId: number) => instruments.filter((instrument) => instrument.type === MusicTypeArr[classId]);

/**
 * The teachers who teach `classId` (`teacher_classes`), by name. `keepId` stays listed even if it no longer teaches
 * that music type, so editing an old enrollment never silently drops its teacher. Without the class links (they
 * failed to load) every teacher is offered, as before.
 */
function teachersForClassId(teachers: Teachers[], teacherClasses: TeacherClasses[], classId: number, keepId?: number) {
	const teaching = new Set(teacherClasses.filter((link) => link.class_id === classId).map((link) => link.teacher_id));
	return teachers
		.filter((teacher) => teacher.id >= 0 && (!teacherClasses.length || teaching.has(teacher.id) || teacher.id === keepId))
		.sort((a, b) => a.fullname.localeCompare(b.fullname, "el"));
}

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
function enrollmentInputs(
	teachers: Teachers[],
	teacherClasses: TeacherClasses[],
	instruments: Instruments[],
	defaults: Partial<PupilEnrollments>,
): Record<string, InputProps> {
	const defaultClassId = defaults.class_id ?? 0;
	const teacherList = teachersForClassId(teachers, teacherClasses, defaultClassId, defaults.teacher_id);
	const instrumentList = instrumentsForClassId(instruments, defaultClassId);

	return {
		registration_year: {
			label: "Σχολικό Έτος",
			name: "registration_year",
			type: "text",
			required: true,
			icon: "calendar",
			placeholder: currentSchoolYear(),
			// Most enrollments added by the secretariat are for the current school year; still editable for past ones.
			value: defaults.registration_year || currentSchoolYear(),
		},
		class_id: {
			label: "Μουσική",
			name: "class_id",
			type: "select",
			required: true,
			icon: "music",
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
				// Only the teachers of the chosen music type; the current choice survives the switch when it still fits.
				const teacherSelect = form?.querySelector("select[name='teacher_id']") as any as HTMLSelectElement;
				const currentTeacher = teacherSelect?.value;
				setSelectOptions(
					teacherSelect,
					teachersForClassId(teachers, teacherClasses, classId, defaults.teacher_id).map((teacher) => ({
						value: teacher.id,
						label: teacher.fullname,
					})),
				);
				if (teacherSelect && [...teacherSelect.options].some((option) => option.value === currentTeacher)) teacherSelect.value = currentTeacher;
			},
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			icon: "teacher",
			selectList: teacherList.map((teacher) => teacher.fullname),
			valueList: teacherList.map((teacher) => teacher.id),
			value: defaults.teacher_id,
		},
		instrument_id: {
			label: "Όργανο / Μάθημα",
			name: "instrument_id",
			type: "select",
			icon: "guitar",
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
			icon: "check",
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
	const [teacherClasses, setTeacherClasses] = createSignal<TeacherClasses[]>([]);
	const [instruments, setInstruments] = createSignal<Instruments[]>([]);

	const PAGE_SIZE = 20;

	let searchInput!: HTMLInputElement;
	let bodyRef: HTMLDivElement | undefined;
	let resultsList: HTMLDivElement | undefined;

	// «/» focuses the search from anywhere on the page (not while typing in a field or with a dialog open).
	const onSlash = (e: KeyboardEvent) => {
		if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
		e.preventDefault();
		searchInput?.focus();
		searchInput?.select();
	};
	document.addEventListener("keydown", onSlash);
	onCleanup(() => document.removeEventListener("keydown", onSlash));

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
	 * `?q=<query>` for the search, `?review=1` for «Μόνο προς έλεγχο». The typed query is component state, so without
	 * this it is lost the moment the page remounts (reload, or a detour to another
	 * admin page); with it, "Πίσω στην αναζήτηση" — and everything after — keeps it.
	 *
	 * Opening a record from the list PUSHES a history entry (`pushOnNextSync`), so the
	 * browser's Back closes the record (see the popstate listener) instead of leaving the
	 * page; everything else replaces. The router's `history.state` (`_depth`) is preserved.
	 */
	let pushOnNextSync = false;
	// The router renders the page before it commits the URL of an in-app navigation, so until then
	// `window.location` is still the previous page's: read the deep link from the router's location,
	// and never write onto the previous page's history entry.
	const location = useLocation();
	const initialSearch = location.search;
	const syncUrl = (id: number | null) => {
		if (window.location.pathname !== untrack(() => location.pathname)) return;
		const text = untrack(() => query()).trim();
		const params = new URLSearchParams(window.location.search);
		if (id === null) params.delete("pupil");
		else params.set("pupil", String(id));
		if (text) params.set("q", text);
		else params.delete("q");
		if (untrack(needsReviewOnly)) params.set("review", "1");
		else params.delete("review");
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
				const [teachersRes, classesRes, instrumentsRes] = await Promise.all([
					apiHook(API.Teachers.getByFullnames),
					apiHook(API.Teachers.getClasses),
					apiHook(API.Instruments.get),
				]);
				if ("data" in teachersRes) setTeachers(teachersRes.data ?? []);
				if ("data" in classesRes) setTeacherClasses(classesRes.data ?? []);
				if ("data" in instrumentsRes) setInstruments(instrumentsRes.data ?? []);
			} catch {
				/* the forms degrade to free-text ids; search still works */
			}
		})();

		// deep link: /admin/pupils?pupil=<id> (and/or ?q=<query>)
		const params = new URLSearchParams(initialSearch);
		const deepLink = params.get("pupil");
		const deepQuery = params.get("q");
		// ?review=1 opens with «Μόνο προς έλεγχο» on (the «Αρχική» dashboard links here)
		if (params.get("review") === "1") setNeedsReviewOnly(true);
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
		const inputs = new InputFields(enrollmentInputs(teachers(), teacherClasses(), instruments(), defaults));

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

	// ---- edit one history row (also how the review flow places «Υπό Κατάταξη» rows) ----
	const [editingEnrollment, setEditingEnrollment] = createSignal<PupilEnrollments | null>(null);
	const editEnrollmentAction = createMemo<Action | ReturnType<typeof emptyAction>>(() => {
		const data = record();
		const enrollment = editingEnrollment();
		if (!data || !enrollment) return emptyAction(ActionEnum.MODIFY, ActionIcon.MODIFY);
		const inputs = enrollmentInputs(teachers(), teacherClasses(), instruments(), enrollment);
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

	// ---- render -------------------------------------------------------------
	// Shell: the admin content cell is already exactly one viewport tall
	// (#AdminPage: 100dvh grid rows), so the page fills it and scrolls its MIDDLE
	// section instead of growing the document — same shape as `Table`'s
	// top-tools / scrolling data / bottom-tools grid. On small screens the shell
	// releases the height and the page scrolls normally, like the tables do.
	return (
		<div class="flex h-full w-full flex-col overflow-hidden p-6 text-ink max-sm:h-auto max-sm:overflow-visible max-sm:p-3">
			{/* ---- pinned top: title + search ---- */}
			<div class="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-y-4">
				{/* ---- landing heading ---- */}
				<Show when={selectedId() === null}>
					<div class="grid justify-items-center gap-y-2 pt-[6vh] pb-2 text-center max-sm:pt-2">
						<h1 class="font-anaktoria text-5xl max-sm:text-4xl">Μαθητολόγιο</h1>
						<p class="max-w-2xl text-lg text-ink-muted">Αναζητήστε μαθητή με ΑΜ, ονοματεπώνυμο, ΑΜΚΑ, τηλέφωνο, email ή περιοχή.</p>
					</div>
				</Show>

				{/* ---- search ---- */}
				<div
					role="search"
					class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2 shadow-md shadow-shade transition-[border-color,box-shadow] focus-within:border-accent-ink focus-within:ring-4 focus-within:ring-accent-ink/10">
					<Icon name="search" class="text-accent-ink" />
					<input
						ref={searchInput}
						type="search"
						name="pupil-search"
						autocomplete="off"
						spellcheck="false"
						aria-label="Αναζήτηση μαθητή"
						placeholder="Αναζήτηση…"
						class="min-w-48 flex-1 bg-transparent font-didact text-xl max-sm:text-lg text-ink placeholder:text-ink-muted/70 focus-visible:outline-hidden [&::-webkit-search-cancel-button]:appearance-none"
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
							// ↓ moves into the result list (↑/↓ walk it, see the list's onKeyDown).
							if (e.key === "ArrowDown" && selectedId() === null) {
								const first = resultsList?.querySelector<HTMLButtonElement>("button[data-result]");
								if (first) {
									e.preventDefault();
									first.focus();
								}
							}
						}}
					/>
					<Show when={!query() && !searching()}>
						<kbd
							title="Πατήστε / για αναζήτηση από οπουδήποτε στη σελίδα"
							class="rounded-md border border-line bg-surface-muted px-1.5 font-didact text-sm text-ink-muted max-sm:hidden">
							/
						</kbd>
					</Show>
					<Show when={searching()}>
						<Icon name="spinner" class="text-accent-ink" spin />
					</Show>
					<Show when={query()}>
						<button
							type="button"
							aria-label="Καθαρισμός αναζήτησης"
							class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-accent-ink transition-colors hover:bg-accent-soft"
							onClick={() => {
								setQuery("");
								clearTimeout(debounceTimer);
								startSearch(0);
								searchInput?.focus();
							}}>
							<Icon name="close" class="text-base leading-none" />
						</button>
					</Show>
					<Show when={results()}>
						<span class="whitespace-nowrap font-didact text-base text-ink-muted" aria-live="polite">
							{countLabel(results()!.total, "μαθητής", "μαθητές")}
						</span>
					</Show>
					<label class="flex cursor-pointer items-center gap-x-2 whitespace-nowrap font-didact text-base text-ink-muted">
						<input
							type="checkbox"
							class="size-4 cursor-pointer accent-brand"
							checked={needsReviewOnly()}
							onChange={(e) => {
								setNeedsReviewOnly(e.currentTarget.checked);
								startSearch(0);
							}}
						/>
						Μόνο προς έλεγχο
					</label>
				</div>
			</div>

			{/* ---- scrolling body: results or the open record ---- */}
			<div
				id="pupilsScroller"
				ref={bodyRef}
				class="mx-auto mt-6 flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-y-4 overflow-y-auto max-sm:mt-4 max-sm:overflow-visible">
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
							<div
								class="grid gap-y-2"
								ref={resultsList}
								onKeyDown={(e) => {
									if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
									const buttons = [...(resultsList?.querySelectorAll<HTMLButtonElement>("button[data-result]") ?? [])];
									const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
									if (at === -1) return;
									e.preventDefault();
									if (e.key === "ArrowUp" && at === 0) searchInput.focus();
									else buttons[Math.min(buttons.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
								}}>
								<Show when={results() && results()!.rows.length === 0}>
									<p class="py-10 text-center text-xl text-ink-muted">
										<Show when={query().trim()} fallback="Δεν βρέθηκαν μαθητές.">
											Δεν βρέθηκε μαθητής για «{query().trim()}».
										</Show>
									</p>
								</Show>
								<For each={results()?.rows ?? []}>
									{(row) => (
										<button
											type="button"
											data-result
											onClick={() => openPupil(row.id)}
											class="group grid w-full grid-cols-[auto_auto_1fr_auto] items-center gap-x-4 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-sm shadow-shade transition-colors hover:border-accent-ink/40 hover:bg-accent-soft focus-visible:border-accent-ink focus-visible:ring-4 focus-visible:ring-accent-ink/15 focus-visible:outline-hidden max-sm:grid-cols-[auto_1fr_auto] max-sm:gap-x-3 max-sm:px-3">
											<span
												aria-hidden="true"
												class="grid size-11 place-items-center rounded-full bg-brand font-anaktoria text-lg font-bold text-brand-ink max-sm:hidden">
												{initials(row.last_name, row.first_name)}
											</span>
											<span class="min-w-14 rounded-md bg-accent-soft px-2 py-0.5 text-center font-didact text-lg font-bold tabular-nums text-accent-ink">
												{amLabel(row)}
											</span>
											<span class="grid min-w-0">
												<span class="truncate text-xl font-semibold">
													{row.last_name} {row.first_name}
													<Show when={row.fathers_name}>
														{" "}
														<span class="font-normal text-ink-muted">({row.fathers_name})</span>
													</Show>
												</span>
												<span class="truncate text-base text-ink-muted">{resultMeta(row)}</span>
											</span>
											<span class="flex items-center gap-x-2">
												<Show when={row.needs_review}>
													<span
														title="Χρειάζεται έλεγχο"
														class="rounded-full bg-amber-200 px-2 py-0.5 text-sm font-bold text-amber-900 dark:bg-amber-700 dark:text-amber-50">
														έλεγχος
													</span>
												</Show>
												<Icon name="chevron-right" class="text-accent-ink/60 transition-transform group-hover:translate-x-0.5" />
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
								<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-md shadow-shade">
									<div class="flex min-w-0 items-center gap-x-3">
										<button
											type="button"
											onClick={backToSearch}
											aria-label="Πίσω στην αναζήτηση"
											title="Πίσω στην αναζήτηση"
											class="grid size-10 shrink-0 place-items-center rounded-full text-accent-ink transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-hidden">
											<Icon name="arrow-left" class="text-xl" />
										</button>
										<span
											aria-hidden="true"
											class="grid size-14 shrink-0 place-items-center rounded-full bg-brand font-anaktoria text-2xl font-bold text-brand-ink max-sm:hidden">
											{initials(data().pupil.last_name, data().pupil.first_name)}
										</span>
										<div class="grid min-w-0 gap-y-1">
											<h1 class="font-anaktoria text-4xl leading-tight max-sm:text-3xl">
												{data().pupil.last_name} {data().pupil.first_name}
											</h1>
											<p class="flex flex-wrap items-center gap-1.5 font-didact text-sm text-ink-muted">
												<span class="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold tabular-nums text-accent-ink">
													ΑΜ {amLabel(data().pupil)}
												</span>
												<span class="rounded-full bg-ink/5 px-2.5 py-0.5">
													{countLabel(data().enrollments.length, "εγγραφή", "εγγραφές")}
												</span>
												<For each={availableMusicTypes(data().enrollments)}>
													{(classId) => <span class="rounded-full bg-ink/5 px-2.5 py-0.5">{musicLabel(classId)}</span>}
												</For>
												<Show when={data().pupil.needs_review}>
													<span class="rounded-full bg-amber-200 px-2.5 py-0.5 font-bold text-amber-900 dark:bg-amber-700 dark:text-amber-50">
														χρειάζεται έλεγχο
													</span>
												</Show>
											</p>
										</div>
									</div>
									<TableControlsGroup prefix={PREFIX}>
										<TableControl prefix={PREFIX} action={editAction} />
										<TableControl prefix={PREFIX} action={enrollAction} />
									</TableControlsGroup>
								</div>

								<Show when={data().pupil.review_note}>
									<p class="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-base dark:border-amber-600 dark:bg-amber-900/25">
										<Icon name="warning" class="mr-2 text-amber-700 dark:text-amber-300" />
										{data().pupil.review_note}
									</p>
								</Show>

								{/* «Υπό Κατάταξη» rows awaiting a class year — one click opens the editor with the select empty. */}
								<Show when={awaitingPlacement().length > 0}>
									<section
										aria-labelledby="awaiting-placement-title"
										class="grid gap-y-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-base dark:border-amber-600 dark:bg-amber-900/25">
										<h2 id="awaiting-placement-title" class="font-semibold">
											Εγγραφές που αναμένουν κατάταξη
										</h2>
										<ul class="grid gap-y-1">
											<For each={awaitingPlacement()}>
												{(enrollment) => (
													<li class="flex flex-wrap items-center gap-x-3 gap-y-1">
														<span class="tabular-nums">{enrollment.registration_year}</span>
														<span>{musicLabel(enrollment.class_id)}</span>
														<span class="text-ink-muted">{teacherName(enrollment.teacher_id)}</span>
														<button
															type="button"
															onClick={() => openEnrollmentEditor(enrollment)}
															class="rounded-md border border-brand px-3 py-0.5 font-didact text-base transition-colors hover:bg-accent-soft">
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
										<p class="text-ink-muted">
											Όταν τοποθετηθούν όλες, καθαρίστε τη «Σημείωση ελέγχου» από την επεξεργασία στοιχείων μαθητή.
										</p>
									</section>
								</Show>

								<div class="grid grid-cols-[minmax(260px,1fr)_2fr] gap-4 max-lg:grid-cols-1">
									{/* ---- left: personal information + the pupil's fees ---- */}
									<div class="grid h-max gap-y-3">
										<section class="grid h-max gap-y-3 rounded-xl border border-line bg-surface p-4 shadow-md shadow-shade">
											<h2 class="font-anaktoria text-2xl">Στοιχεία Μαθητή</h2>
											<dl class="grid grid-cols-[auto_1fr] gap-x-4 text-base [&>dt]:border-t [&>dt]:border-line [&>dt]:py-2 [&>dt]:text-sm [&>dt]:text-ink-muted [&>dd]:border-t [&>dd]:border-line [&>dd]:py-2 [&>dd]:tabular-nums [&>dt:first-of-type]:border-t-0 [&>dd:first-of-type]:border-t-0">
												<dt>Επώνυμο:</dt>
												<dd>{data().pupil.last_name || "-"}</dd>
												<dt>Όνομα:</dt>
												<dd>{data().pupil.first_name || "-"}</dd>
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
												<dd class="grid">
													<ContactLink kind="tel" value={data().pupil.telephone} />
													<ContactLink kind="tel" value={data().pupil.cellphone} />
												</dd>
												<dt>Email:</dt>
												<dd class="break-all">
													<ContactLink kind="mailto" value={data().pupil.email} />
												</dd>
												<dt>Σύνδεσμος:</dt>
												<dd>
													<Show when={data().pupil.registration_url} fallback="-">
														<a
															href={`/eggrafes/?regid=${encodeURIComponent(data().pupil.registration_url)}`}
															target="_blank"
															rel="noreferrer"
															title="Άνοιγμα της φόρμας εγγραφής σε νέα καρτέλα"
															aria-label="Άνοιγμα της φόρμας εγγραφής σε νέα καρτέλα"
															class="inline-grid h-7 w-7 place-items-center rounded-md border border-accent-ink/40 text-accent-ink transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-hidden">
															<Icon name="external-link" class="text-base" />
														</a>
													</Show>
												</dd>
											</dl>
										</section>
										<button
											type="button"
											onClick={() => setFeesOpen(true)}
											class="flex w-full items-center justify-center gap-x-2 rounded-xl border-2 border-brand bg-surface px-4 py-2 font-didact text-lg font-semibold text-accent-ink shadow-md shadow-shade transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-hidden">
											<Icon name="euro" />
											Δίδακτρα
										</button>
									</div>

									{/* ---- right: music types + history ---- */}
									<section class="grid h-max gap-y-4 rounded-xl border border-line bg-surface p-4 shadow-md shadow-shade">
										<Show
											when={availableMusicTypes(data().enrollments).length > 0}
											fallback={<p class="text-ink-muted">Δεν υπάρχουν εγγραφές.</p>}>
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
																"rounded-full px-4 py-1.5 font-didact text-base font-semibold transition-colors " +
																(activeMusic() === classId
																	? "bg-brand text-brand-ink"
																	: "border border-brand text-accent-ink hover:bg-accent-soft")
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
																<span class="font-anaktoria text-xl">{group.name}</span>
																<span class="font-didact text-base text-ink-muted">
																	{countLabel(group.rows.length, "εγγραφή", "εγγραφές")}
																</span>
															</p>
															<div class="overflow-x-auto">
																<table class="w-full border-collapse font-didact text-base">
																	<thead>
																		<tr class="bg-accent-soft text-left">
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
																				Προήχθη
																			</th>
																			<th scope="col" class="px-2 py-1.5 text-center font-semibold">
																				<span class="sr-only">Ενέργειες</span>
																			</th>
																		</tr>
																	</thead>
																	<tbody>
																		<For each={group.rows}>
																			{(row) => (
																				<tr class="border-t border-line transition-colors hover:bg-surface-muted">
																					<td class="whitespace-nowrap px-2 py-1.5 tabular-nums">
																						{row.registration_year}
																					</td>
																					<td class="whitespace-nowrap px-2 py-1.5">
																						<Show
																							when={row.evaluation && !row.class_year}
																							fallback={
																								<>
																									{classYearLabel(row.class_year, row.evaluation) || "-"}
																									<Show when={row.evaluation}>
																										<EvaluationBadge />
																									</Show>
																								</>
																							}>
																							<span class="rounded-full bg-amber-200 px-2 py-0.5 text-sm font-bold text-amber-900 dark:bg-amber-700 dark:text-amber-50">
																								{EVALUATION_LABEL}
																							</span>
																						</Show>
																					</td>
																					<td class="px-2 py-1.5">{teacherName(row.teacher_id)}</td>
																					<td class="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
																						{row.payment_amount} / {row.total_payment} €
																						<Show when={row.fee_manual}>
																							<span class="ml-1">
																								<FeeManualMarker compact />
																							</span>
																						</Show>
																					</td>
																					<td class="px-2 py-1.5 text-center">
																						<span
																							class={
																								"rounded-full px-2 py-0.5 text-sm font-semibold " +
																								(row.pass
																									? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
																									: "bg-ink/10 text-ink-muted")
																							}>
																							{row.pass ? "Ναι" : "Όχι"}
																						</span>
																					</td>
																					<td class="whitespace-nowrap px-2 py-1.5 text-center">
																						<button
																							type="button"
																							onClick={() => openEnrollmentEditor(row)}
																							aria-label={`Επεξεργασία εγγραφής ${row.registration_year}`}
																							title="Επεξεργασία εγγραφής"
																							class="inline-grid h-8 w-8 place-items-center rounded-md text-accent-ink transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-hidden">
																							<Icon name={ActionIcon.MODIFY} class="text-base" />
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

			{/* per-row enrollment editor (opened from the history rows / the awaiting-placement list) */}
			<Show when={"inputs" in editEnrollmentAction()}>
				<Modal prefix={ENROLLMENT_PREFIX} actionStore={editEnrollmentStore} />
			</Show>

			{/* ---- pinned bottom: pagination (list only) ---- */}
			<Show when={selectedId() === null && results() && results()!.total > PAGE_SIZE}>
				<div class="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-center gap-x-4 pt-4">
					<button
						type="button"
						disabled={page() === 0}
						onClick={() => goToPage(page() - 1)}
						class="rounded-md border border-brand px-3 py-1 font-didact text-base transition-colors hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent">
						Προηγούμενη
					</button>
					<span class="font-didact text-base text-ink-muted tabular-nums">
						{page() * PAGE_SIZE + 1}–{Math.min((page() + 1) * PAGE_SIZE, results()!.total)} από {results()!.total}
						<span class="mx-2 opacity-50">·</span>
						σελίδα {page() + 1} / {Math.max(1, Math.ceil(results()!.total / PAGE_SIZE))}
					</span>
					<button
						type="button"
						disabled={(page() + 1) * PAGE_SIZE >= results()!.total}
						onClick={() => goToPage(page() + 1)}
						class="rounded-md border border-brand px-3 py-1 font-didact text-base transition-colors hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent">
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

/** Initials for the avatar: «Παπαδόπουλος Γιώργος» → «ΠΓ». */
function initials(last: string | null | undefined, first: string | null | undefined) {
	return ((last?.trim()[0] ?? "") + (first?.trim()[0] ?? "")).toUpperCase() || "?";
}

/** A phone number or email as a link (tap to call / write), or «-» when empty. */
function ContactLink(props: { kind: "tel" | "mailto"; value: string | null | undefined }) {
	return (
		<Show when={props.value} fallback={<span>-</span>}>
			<a
				href={`${props.kind}:${props.kind === "tel" ? props.value!.replace(/\s+/g, "") : props.value}`}
				class="w-max max-w-full text-accent-ink underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-hidden">
				{props.value}
			</a>
		</Show>
	);
}
