import { customEvent } from "@_types/custom-events";
import type { Instruments, PupilRegistrationForm } from "@_types/entities";
import { APIRequestError, validationMessages } from "@hooks/apiCall";
import type { APIResourceStore } from "@hooks/createAPIResource.solid";
import { useAPIClient, type APIClient } from "@hooks/useAPIClient.solid";
import { classYearsByMusicType, MusicType, MusicTypeArr } from "@lib/classYears";
import { currentSchoolYear, currentSchoolYearShort, isRegistrationWindowOpen, REGISTRATION_WINDOW_LABEL } from "@lib/pupils/years";
import { API } from "@routes/index.client";
import { AnimTimeline } from "@utilities/dom";
import { ExtendedFormData } from "@utilities/forms";
import { sleep } from "@utilities/sleep";
import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import Input, { type Props as InputProps } from "../input/Input.solid";
import Popup, { PopupShow } from "../other/Popup.solid";
import Spinner from "../other/Spinner.solid";
import Icon from "@components/other/Icon.solid";

const PREFIX = "RegForm";
const isPhone = window.matchMedia("(max-width: 640px)").matches;
const genericInputs: Record<
	keyof Omit<PupilRegistrationForm, "date" | "class_id" | "class_year" | "teacher_id" | "instrument_id" | "registration_url" | "pass">,
	InputProps
> = {
	am: {
		label: "Αριθμός Μητρώου",
		name: "am",
		autocomplete: "off",
		inputMode: "numeric",
		type: "text",
		value: "000",
		required: true,
		icon: "id-card",
		tooltip: {
			message: ["Αναζητήστε τον αριθμό μητρώου στην περσινή αίτηση, η οποία θα σας αποσταλεί με email ή συμβουλευτείτε τη Γραμματεία της Σχολής."],
			position: isPhone ? "top" : "left",
		},
	},
	amka: {
		label: "ΑΜΚΑ",
		name: "amka",
		autocomplete: "off",
		inputMode: "numeric",
		type: "text",
		required: true,
		icon: "id-card",
		tooltip: {
			message: ["Συμπληρώνετε τον Αριθμό Μητρώου Κοινωνικής Ασφάλισης (ΑΜΚΑ) σας.", "Ο ΑΜΚΑ αποτελείται από 11 ψηφία."],
			position: isPhone ? "top" : "right",
		},
	},
	last_name: {
		label: "Επώνυμο",
		name: "last_name",
		autocomplete: "family-name",
		type: "text",
		required: true,
		icon: "user",
		tooltip: {
			message: ["Συμπληρώνετε τα στοιχεία σας με πεζά γράμματα και το πρώτο κεφαλαίο (π.χ. Παπαδόπουλος Αντώνης)."],
			position: isPhone ? "top" : "left",
		},
	},
	first_name: {
		label: "Όνομα",
		name: "first_name",
		autocomplete: "given-name",
		type: "text",
		required: true,
		icon: "user",
		tooltip: {
			message: ["Συμπληρώνετε τα στοιχεία σας όπως ακριβώς αναγράφονται στην ταυτότητά σας."],
			position: isPhone ? "top" : "right",
		},
	},
	fathers_name: {
		label: "Πατρώνυμο",
		name: "fathers_name",
		type: "text",
		required: true,
		icon: "user",
	},
	telephone: {
		label: "Τηλέφωνο",
		name: "telephone",
		autocomplete: "tel",
		type: "tel",
		icon: "phone",
	},
	cellphone: {
		label: "Κινητό",
		name: "cellphone",
		autocomplete: "tel",
		type: "tel",
		required: true,
		icon: "smartphone",
	},
	email: {
		label: "Email",
		name: "email",
		autocomplete: "email",
		type: "email",
		required: true,
		icon: "mail",
	},
	birth_date: {
		label: "Ημερομηνία Γέννησης",
		name: "birth_date",
		type: "date",
		required: true,
		icon: "calendar",
	},
	road: {
		label: "Οδός",
		name: "road",
		autocomplete: "street-address",
		type: "text",
		required: true,
		icon: "map-pin",
	},
	number: {
		label: "Αριθμός",
		name: "number",
		type: "number",
		required: true,
		icon: "hash",
	},
	tk: {
		label: "Τ.Κ.",
		name: "tk",
		autocomplete: "postal-code",
		inputMode: "numeric",
		type: "number",
		required: true,
		icon: "hash",
	},
	region: {
		label: "Δήμος/Περιοχή",
		name: "region",
		autocomplete: "address-level2",
		type: "text",
		required: true,
		icon: "city",
	},
	registration_year: {
		label: "Σχολικό Έτος",
		name: "registration_year",
		type: "text",
		required: true,
		icon: "calendar",
		disabled: true,
		blurDisabled: false,
		// The school year being registered for (rolls over on 1 July — see lib/pupils/years.ts).
		value: currentSchoolYear(),
	},
};

const inputsByMusicType = (musicType: MusicType, store: APIResourceStore, regData: PupilRegistrationForm): InputProps[] => {
	const musicToIdx = {
		[MusicType.Byzantine]: 0,
		[MusicType.Traditional]: 1,
		[MusicType.European]: 2,
	} as Record<MusicType, number>;

	let teachersInput: InputProps;
	if (regData.class_year === "Υπό Κατάταξη") {
		teachersInput = { type: null, label: "", name: "" };
	} else {
		// Get instrument and teacher IDs from registration data
		// So that we can pre-select the correct values in the form
		const instrument_id = regData.instrument_id;

		// Filter teachers by music type
		const tcs = store[API.Teachers.getClasses];
		const tis = store[API.Teachers.getInstruments];
		const teachers = (store[API.Teachers.getPublic] || [])
			// Filter By Music type — the store slot stays undefined until (or unless)
			// the fetch succeeds; never let `.find` throw on a UI page.
			.filter((t) => {
				if (!Array.isArray(tcs)) return false;
				return tcs.find((tc) => {
					return tc.teacher_id === t.id && tc.class_id === musicToIdx[musicType];
				});
			})
			// Filter By Selected instrument/class
			.filter((t) => {
				if (instrument_id === -1) return true;
				if (!Array.isArray(tis)) return false;
				return tis.find((ti) => {
					return ti.teacher_id === t.id && ti.instrument_id === instrument_id;
				});
			});
		teachersInput = {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			icon: "user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
			value: regData.teacher_id,
			listeners: true,
			blurDisabled: false,
		};
	}

	let instrumentsInput: InputProps;
	if (musicType === MusicType.Byzantine) {
		instrumentsInput = { type: null, label: "", name: "" };
	} else {
		// Get all instruments/classes by music type
		let instruments = store[API.Instruments.get]?.filter((i) => i.type === musicType);

		if (regData.teacher_id !== -1) {
			let teacher_instruments = store[API.Teachers.getInstruments]?.filter((ti) => ti.teacher_id === regData.teacher_id);
			instruments = teacher_instruments?.map((ti) => instruments?.find((i) => i.id === ti.instrument_id)).filter(Boolean) as Instruments[];
		}

		instrumentsInput = {
			label: "Όργανα-Μαθήματα",
			name: "instruments-all",
			icon: "guitar",
			type: "select",
			required: true,
			selectList: instruments?.map((i) => i.name),
			valueList: instruments?.map((i) => i.id),
			listeners: true,
			value: regData.instrument_id,
		};
	}

	const classYearInput: InputProps = {
		label: "Έτος Φοίτησης",
		name: "class_year",
		type: "select",
		required: true,
		icon: "graduation-cap",
		selectList: classYearsByMusicType[musicType],
		valueLiteral: true,
		value: regData.class_year || "",
		tooltip: {
			message: ["Εάν δεν γνωρίζετε το έτος φοίτησής σας, συμβουλευτείτε τη Γραμματεία της Σχολής"],
			position: isPhone ? "top" : "left",
		},
	};

	return [classYearInput, teachersInput, instrumentsInput];
};

const DiplomaClasses = ["Β' Έτος Διπλώματος", "Β' Ανωτέρα"];

const heading: Record<MusicType, string> = {
	[MusicType.None]: "",
	[MusicType.Byzantine]: "Φόρμα Εγγραφής Βυζαντινής Μουσικής",
	[MusicType.Traditional]: "Φόρμα Εγγραφής Παραδοσιακής Μουσικής",
	[MusicType.European]: "Φόρμα Εγγραφής Ευρωπαϊκής Μουσικής",
};

function fadeInForm(type: MusicType) {
	if (type === MusicType.None) return;

	const atl = new AnimTimeline();
	let el = document.querySelector("#registrationForm") as HTMLElement;

	atl.step(() => el?.classList.add("remove"))
		.step({
			time: 500,
			anim: () => {
				el?.classList.remove("remove");
				void el?.offsetWidth;
			},
		})
		.start();
}

/**
 * Three-step flow:
 *  - "type"   — pick a music type
 *  - "lookup" — ΑΜ + ΑΜΚΑ only, so a returning student can be identified and
 *               the form prefilled (or the "new student" path chosen)
 *  - "form"   — the full registration form
 */
type Step = "type" | "lookup" | "form";
type Route = { step: Step; type: MusicType };
/** Our slot in `history.state`: the step shown by that entry and its depth (0 = the picker, 1 = a department). */
type HistoryEntry = Route & { depth: 0 | 1 };

const HISTORY_KEY = "registrationStep";
const DEPARTMENTS: MusicType[] = [MusicType.Byzantine, MusicType.Traditional, MusicType.European];
const PICKER: Route = { step: "type", type: MusicType.None };

/*
 * Browser history of the steps. Every entry stays on /eggrafes; the step is kept in `history.state`
 * (HISTORY_KEY) and, readable and linkable, in the hash:
 *   (no hash)   → the department picker — always the page's base entry (depth 0)
 *   "#byz"      → the identification step of that department (also the deep link other pages / emails use)
 *   "#byz-form" → the form of that department
 * Semantics:
 *  - picker → department: pushState, so Back returns to the picker; Forward goes back to the department with
 *    everything already entered (the form stays mounted, only hidden, until it is submitted).
 *  - identification → form: replaceState. The identification happens ONCE, so it does not stay in the history:
 *    Back from the form goes to the picker, never back through the ΑΜ + ΑΜΚΑ step (which would re-run it).
 *  - switching department inside the form (the pill nav): replaceState — a tab switch, not a step.
 *  - once identified (or "new student" chosen), every department goes straight to the form; before that, a
 *    form entry reached by Back/Forward or a link shows the identification step instead (`resolveRoute`).
 *  - after a successful submit (closing the success popup) the identification is reset — the next registration,
 *    e.g. a sibling, starts again from the ΑΜ + ΑΜΚΑ step — and Back returns to the picker.
 * There is at most one entry above the picker, so "back to the picker" is `history.back()` from depth 1.
 */

/** The route a hash names; `null` for a hash that is not one of ours. */
function routeFromHash(hash: string): Route | null {
	let raw: string;
	try {
		raw = decodeURIComponent(hash.replace(/^#/, ""));
	} catch {
		return null;
	}
	if (!raw) return PICKER;
	const [type, suffix, ...rest] = raw.split("-");
	if (!DEPARTMENTS.includes(type as MusicType) || rest.length || (suffix !== undefined && suffix !== "form")) return null;
	return { step: suffix === "form" ? "form" : "lookup", type: type as MusicType };
}

const hashOf = (route: Route) => (route.step === "type" ? "" : route.step === "form" ? `#${route.type}-form` : `#${route.type}`);
const urlOf = (route: Route) => window.location.pathname + window.location.search + hashOf(route);
const savedEntry = (state: unknown): HistoryEntry | undefined => (state as Record<string, HistoryEntry> | null)?.[HISTORY_KEY];
/** Writes our entry into the history, keeping whatever else (e.g. the router) stored in the state. */
function writeHistory(mode: "push" | "replace", entry: HistoryEntry) {
	const state = { ...(mode === "replace" && history.state && typeof history.state === "object" ? history.state : {}), [HISTORY_KEY]: entry };
	if (mode === "push") history.pushState(state, "", urlOf(entry));
	else history.replaceState(state, "", urlOf(entry));
}

async function loadRegistrationId(apiHook: APIClient) {
	let urlParams = new URLSearchParams(window.location.search);
	if (urlParams.has("regid")) {
		const reg_url = urlParams.get("regid") as string;
		try {
			const res = await apiHook(API.Pupils.getByReregistrationUrl, {
				UrlArgs: { url: reg_url },
			});
			if (!("data" in res) || !res.data) return;
			// The pupil's permanent registration_url resolves to the pupil plus
			// their history. The form edits a flat row, so merge the identity
			// fields with the most recent enrollment.
			const { pupil, enrollments } = res.data;
			const latest = [...enrollments].sort(
				(a, b) => (b.registration_year || "").localeCompare(a.registration_year || "") || (b.date || 0) - (a.date || 0),
			)[0];
			return {
				...pupil,
				am: pupil.am === null ? "" : String(pupil.am),
				registration_year: genericInputs.registration_year.value as string,
				class_year: "",
				class_id: latest?.class_id ?? 0,
				teacher_id: -1,
				instrument_id: -1,
			} as unknown as PupilRegistrationForm;
		} catch (err) {}
	}
}

/** The lookup found nobody: with an ΑΜ, the pair did not match; without one, no pupil without ΑΜ has that ΑΜΚΑ. */
const notFoundMessage = (am: number | undefined) =>
	am === undefined
		? "Δεν βρέθηκε μαθητής χωρίς αριθμό μητρώου με αυτόν τον ΑΜΚΑ. Αν έχετε αριθμό μητρώου, συμπληρώστε τον· αλλιώς δηλώστε νέα εγγραφή."
		: "Δεν βρέθηκε μαθητής με αυτά τα στοιχεία. Ελέγξτε τον ΑΜ και τον ΑΜΚΑ ή δηλώστε νέα εγγραφή.";

/**
 * Turns a failed request into a message for the family filling the form: invalid fields (the server's
 * per-field validation messages), a rejected request (4xx), a server failure (5xx / a response that is
 * not the API's JSON) or no connection (fetch itself failed — not an APIRequestError).
 */
function describeError(err: unknown): string {
	if (!(err instanceof APIRequestError)) {
		return "Δεν ήταν δυνατή η σύνδεση με τον διακομιστή. Ελέγξτε τη σύνδεσή σας στο διαδίκτυο και δοκιμάστε ξανά.";
	}
	if (err.envelope && err.status < 500) {
		const issues = validationMessages(err.details);
		if (issues.length) return issues.join(" · ");
		return err.message && err.message !== "Invalid request body" ? err.message : "Ορισμένα στοιχεία δεν είναι έγκυρα. Ελέγξτε τα πεδία της φόρμας.";
	}
	return "Παρουσιάστηκε σφάλμα στον διακομιστή. Δοκιμάστε ξανά σε λίγο ή επικοινωνήστε με τη Γραμματεία της Σχολής.";
}

/** Required inputs the user left empty (a select's empty option has the value "undefined"). */
function emptyRequiredFields(form: HTMLFormElement) {
	const fields = [...form.querySelectorAll("[aria-required='true']")] as (HTMLInputElement | HTMLSelectElement)[];
	return fields.filter((el) => !el.closest(".hidden") && (el.value.trim() === "" || el.value === "undefined"));
}

/** Shown outside the official registration period — informational only, the form stays open. */
function OutOfWindowNotice(props: { schoolYear: string; class?: string }) {
	return (
		<p role="note" class={"rounded-md border border-amber-300 bg-amber-50 px-4 py-3 font-didact text-base text-amber-950 " + (props.class ?? "")}>
			<Icon name="info" class="mr-2" />Η επίσημη περίοδος εγγραφών για το σχολικό έτος {props.schoolYear} είναι από {REGISTRATION_WINDOW_LABEL}. Αιτήσεις
			που υποβάλλονται εκτός αυτής της περιόδου γίνονται δεκτές και εξετάζονται από τη Γραμματεία της Σχολής.
		</p>
	);
}

export function RegistrationForm() {
	const [store, setStore] = createStore<APIResourceStore>({});
	const [registrationData, setRegistrationData] = createStore<PupilRegistrationForm>({} as any);
	const apiHook = useAPIClient(setStore);
	// The department being registered for. It stays set while the picker is shown again (Back), so the
	// hidden form keeps its data; it is cleared only when a registration is completed.
	const [musicType, setMusicType] = createSignal<MusicType>(MusicType.None);
	const [spinner, setSpinner] = createSignal(false, { equals: false });
	const [step, setStep] = createSignal<Step>("type");
	const [lookupAm, setLookupAm] = createSignal("");
	const [lookupAmka, setLookupAmka] = createSignal("");
	const [lookupError, setLookupError] = createSignal("");
	const [lookupBusy, setLookupBusy] = createSignal(false);
	const [submitError, setSubmitError] = createSignal("");
	// Set once the pupil is found by ΑΜ + ΑΜΚΑ: those two are then locked so the identification cannot be undone by editing them.
	const [identified, setIdentified] = createSignal(false);
	// The pupil has no ΑΜ: "new student" was chosen, or a pupil who registered as new before and was not given one
	// yet was found by ΑΜΚΑ (or their ?regid link). The form then shows no ΑΜ field and sends the '000' placeholder:
	// the server matches such a pupil by ΑΜΚΑ, or creates one without ΑΜ, flagged for the secretaries to assign it.
	const [withoutAm, setWithoutAm] = createSignal(false);
	// Set once the identification step is done — by ΑΜ + ΑΜΚΑ, "new student" or the permanent ?regid link. From
	// then on the form is mounted (and keeps what was typed while hidden) and every department goes straight to it.
	const [identityResolved, setIdentityResolved] = createSignal(false);
	// Something was typed into the form that has not been submitted yet — guards against leaving the page.
	const [dirty, setDirty] = createSignal(false);
	// Display-only: the form stays open all year, it just says so outside the official period.
	const windowOpen = isRegistrationWindowOpen();
	const schoolYearShort = currentSchoolYearShort();

	/** The step a route can actually show: identification happens once, so it is skipped (or required) accordingly. */
	const resolveRoute = (route: Route): Route => {
		if (route.step === "type" || !DEPARTMENTS.includes(route.type)) return PICKER;
		return { step: identityResolved() ? "form" : "lookup", type: route.type };
	};

	/** Shows a route. A different department resets the fields that belong to the department (see onMusicTypeChange). */
	const render = (route: Route) => {
		if (route.step !== "type" && route.type !== musicType()) {
			setMusicType(route.type);
			setRegistrationData((prev) => ({ ...prev, class_year: "", instrument_id: -1, teacher_id: -1 }));
		}
		if (route.step === "lookup" && step() !== "lookup") setLookupError("");
		setStep(route.step);
	};

	/** Navigates within the page (see the history semantics above `routeFromHash`). */
	const goTo = (route: Route) => {
		const target = resolveRoute(route);
		const depth = savedEntry(history.state)?.depth ?? 0;
		if (target.step === "type") {
			// Back to the picker = Back in the history, so Forward can return to the department.
			if (depth > 0) history.back();
			render(target);
			return;
		}
		writeHistory(depth > 0 ? "replace" : "push", { ...target, depth: 1 });
		render(target);
	};

	onMount(() => {
		const saved = savedEntry(history.state);
		if (saved) {
			// A reload (or a restored page) keeps its entry; the identification has to be done again, though.
			const target = resolveRoute(saved);
			writeHistory("replace", { ...target, depth: target.step === "type" ? 0 : saved.depth });
			render(target);
		} else {
			// The page's first entry is always the picker; a deep link (#byz, #par, #eur) lands one step above it.
			const linked = routeFromHash(window.location.hash) ?? PICKER;
			writeHistory("replace", { ...PICKER, depth: 0 });
			if (linked.step !== "type") goTo(linked);
		}

		const onPopState = (e: PopStateEvent) => {
			const entry = savedEntry(e.state);
			const route = entry ?? routeFromHash(window.location.hash);
			if (!route) return; // a hash that is not ours
			const target = resolveRoute(route);
			if (!entry || target.step !== route.step || target.type !== route.type) {
				writeHistory("replace", { ...target, depth: target.step === "type" ? 0 : (entry?.depth ?? 1) });
			}
			render(target);
		};
		window.addEventListener("popstate", onPopState);
		onCleanup(() => window.removeEventListener("popstate", onPopState));
	});

	// Leaving the page (closing the tab, Back past /eggrafes, a link) with typed-in, unsubmitted data asks first.
	createEffect(() => {
		if (!dirty()) return;
		const guard = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", guard);
		onCleanup(() => window.removeEventListener("beforeunload", guard));
	});
	const markDirty = (e: Event) => {
		if (e.isTrusted) setDirty(true);
	};

	// The lists the form is built from. A failed load is kept so that submitting can explain it instead of doing nothing.
	const [loadError, setLoadError] = createSignal<unknown>();
	onMount(() => {
		const load = (request: Promise<unknown>) => request.catch((err) => setLoadError(() => err));
		load(apiHook(API.Teachers.getPublic));
		load(apiHook(API.Teachers.getClasses));
		load(apiHook(API.Teachers.getInstruments));
		load(apiHook(API.Instruments.get));
	});

	// Trigger the fade-in effect whenever the music type changes
	createEffect(on(musicType, () => fadeInForm(musicType())));

	// Load registration data from URL on mount if any
	onMount(async () => {
		const regData = await loadRegistrationId(apiHook);
		if (!regData) return;
		setRegistrationData((prev) => {
			return { ...prev, ...regData };
		});
		// The permanent link already identifies the pupil — skip the lookup step.
		setWithoutAm(!regData.am);
		setIdentityResolved(true);
		goTo({ step: "form", type: MusicTypeArr[regData.class_id] });
	});

	const onMusicTypeChange = (type: MusicType) => {
		// The class year / teacher / instrument belong to the department being
		// registered for, so they reset when the department changes (in `render`).
		// The first pick lands on the returning/new-student choice; identifying the
		// pupil happens ONCE, so any later pick goes straight to the form.
		goTo({ step: "form", type });
	};

	/**
	 * Returning student: ΑΜ + ΑΜΚΑ must both match, then prefill from the record. A pupil who registered as new and
	 * has no ΑΜ yet leaves it empty (or types the '000' they registered with): the ΑΜΚΑ alone then finds them.
	 */
	const onLookup = async (e: Event) => {
		e.preventDefault();
		const typedAm = lookupAm().trim();
		// The first run of digits ('000-Ο12' → '000'); none typed, or only zeros, means "no ΑΜ".
		const amDigits = typedAm.match(/\d+/)?.[0] ?? "";
		const am = Number(amDigits) > 0 ? Number(amDigits) : undefined;
		const amka = lookupAmka().trim();
		if (typedAm && !amDigits) {
			setLookupError("Ο αριθμός μητρώου αποτελείται μόνο από ψηφία. Αν δεν έχετε αριθμό μητρώου, αφήστε το πεδίο κενό.");
			return;
		}
		if (amka.length !== 11) {
			setLookupError("Ο ΑΜΚΑ αποτελείται από 11 ψηφία.");
			return;
		}
		setLookupError("");
		setLookupBusy(true);
		try {
			const res = await apiHook(API.Pupils.getByAm, { RequestObject: { am, amka } });
			if (!("data" in res) || !res.data) {
				setLookupError(notFoundMessage(am));
				return;
			}
			const { pupil } = res.data;
			// Identity comes from the record; the enrollment fields reset so the
			// student re-registers for the current year.
			setRegistrationData((prev) => ({
				...prev,
				...pupil,
				am: String(pupil.am ?? ""),
				amka: pupil.amka,
				registration_year: genericInputs.registration_year.value as string,
				class_year: "",
				teacher_id: -1,
				instrument_id: -1,
			}));
			// Keep the department the family picked — they may be enrolling in a different one this year.
			setWithoutAm(pupil.am === null);
			setIdentified(true);
			setIdentityResolved(true);
			goTo({ step: "form", type: musicType() });
		} catch (err) {
			// Only a 404 means "no such pupil" — anything else must not push the family onto the new-student path.
			if (err instanceof APIRequestError && err.status === 404) {
				setLookupError(notFoundMessage(am));
			} else {
				setLookupError(describeError(err));
			}
		} finally {
			setLookupBusy(false);
		}
	};

	/** New student: blank form without an ΑΜ field; they are registered with the '000' placeholder. */
	const onNewStudent = () => {
		setRegistrationData((prev) => ({
			...prev,
			am: "000",
			amka: "",
			last_name: "",
			first_name: "",
			fathers_name: "",
			telephone: "",
			cellphone: "",
			email: "",
			birth_date: undefined as any,
			road: "",
			number: undefined as any,
			tk: undefined as any,
			region: "",
			registration_year: genericInputs.registration_year.value as string,
			class_year: "",
			teacher_id: -1,
			instrument_id: -1,
		}));
		setLookupError("");
		setIdentified(false);
		setWithoutAm(true);
		setIdentityResolved(true);
		goTo({ step: "form", type: musicType() });
	};

	const onSubmit = async function (e: Event) {
		e.preventDefault();
		const teachers = store[API.Teachers.getPublic];
		if (!teachers) {
			// Still loading — or the lists failed to load, which the family must be told about.
			if (loadError()) {
				setSubmitError(describeError(loadError()));
				shakeForm();
			}
			return;
		}

		const form = e.target as HTMLFormElement;
		setSubmitError("");
		const missing = emptyRequiredFields(form);
		if (missing.length) {
			// Mark them (the inputs style `:invalid` red) and say which ones.
			missing.forEach((el) => el.setAttribute("required", ""));
			const names = missing.map((el) => el.closest("label")?.querySelector("p")?.textContent?.trim()).filter(Boolean);
			setSubmitError(`Συμπληρώστε τα υποχρεωτικά πεδία: ${names.join(", ")}.`);
			missing[0].focus();
			shakeForm();
			return;
		}
		const formData = new ExtendedFormData<PupilRegistrationForm>(form);
		const data: PupilRegistrationForm = {
			last_name: formData.string("last_name"),
			first_name: formData.string("first_name"),
			am: withoutAm() ? "000" : formData.string("am"),
			amka: formData.string("amka"),
			fathers_name: formData.string("fathers_name"),
			telephone: formData.string("telephone", "-"),
			cellphone: formData.string("cellphone"),
			email: formData.string("email"),
			birth_date: formData.date("birth_date").getTime(),
			road: formData.string("road"),
			number: formData.number("number"),
			tk: formData.number("tk"),
			region: formData.string("region"),
			registration_year: formData.string("registration_year"),
			class_year: formData.string("class_year"),
			class_id: btns.findIndex((btn) => btn[1] === musicType()),
			teacher_id: formData.number("teacher_id", -1),
			instrument_id: formData.multiSelect("instruments" as any, "number", { single: true }) || formData.number("instruments-all" as any, 0),
			date: Date.now(),
			pass: false,
		};
		setRegistrationData(data);
		try {
			if (data.amka.length !== 11) {
				throw Error("Ο ΑΜΚΑ αποτελείται μόνο από 11 ψηφία.");
			}
			if (data.teacher_id === -1 && data.class_year !== "Α' Προκαταρκτική" && data.class_year !== "Υπό Κατάταξη") {
				throw Error("Παρακαλώ επιλέξτε καθηγητή.");
			}
			if (data.instrument_id === 0 && data.class_id > 0) {
				throw Error("Παρακαλώ επιλέξτε όργανο / μάθημα.");
			}
			if (data.class_year === "undefined") {
				throw Error("Παρακαλώ επιλέξτε έτος φοίτησης.");
			}
			setSpinner(true);
			const res = await apiHook(API.Pupils.post, { RequestObject: { ...data, class_id: data.class_id as 0 | 1 | 2 } });
			if ("data" in res && res.data) {
				setDirty(false);
				PopupShow();
				setRegistrationData((prevReg) => {
					return {
						...prevReg,
						teacher_id: -1,
						instrument_id: -1,
					};
				});
			}
		} catch (err) {
			// Our own checks throw plain Errors with a Greek message; request failures (APIRequestError, fetch's TypeError) get described.
			const isLocalCheck = err instanceof Error && err.name === "Error";
			setSubmitError(isLocalCheck ? err.message : describeError(err));
			shakeForm();
		} finally {
			setSpinner(false);
		}
	};

	const shakeForm = () => {
		const form = document.querySelector("#registrationForm") as HTMLElement | null;
		if (!form) return;
		queueMicrotask(() => form.querySelector<HTMLElement>("[data-submit-error]")?.scrollIntoView({ block: "center", behavior: "smooth" }));
		const atl = new AnimTimeline();
		atl.step({
			time: 50,
			anim: () => form.classList.add("animate-shake"),
		})
			.step({
				time: 500,
				anim: () => form.classList.remove("animate-shake"),
			})
			.start();
	};

	const btns = [
		["Βυζαντινή Μουσική", MusicType.Byzantine],
		["Παραδοσιακή Μουσική", MusicType.Traditional],
		["Ευρωπαϊκή Μουσική", MusicType.European],
	] as const;

	// Apply an onChange for class_year/teachers/instruments
	const onFormInputsChange = async (e: Event) => {
		const el = e.target as HTMLSelectElement;
		console.log("[onFormInputsChange] triggered and with value: ", el.value);
		let mutation: Partial<PupilRegistrationForm>;
		if (el.name === "class_year") {
			// Only this form's teacher field (its own Input listens for the event).
			const teacherSelect = el.form ? el.form.querySelector("[name='teacher_id']") : document.querySelector("[name='teacher_id']");
			teacherSelect?.dispatchEvent(customEvent("enable_input", !(el.value === "Υπό Κατάταξη")));
			mutation = { class_year: el.value };
			// Reset the teacher_id also
			if (el.value === "Υπό Κατάταξη") {
				mutation.teacher_id = -1;
			}
			await sleep(500);
		} else if (el.name === "teacher_id") {
			mutation = { teacher_id: Number(el.value) || -1 };
		} else {
			mutation = { instrument_id: Number(el.value) || -1 };
		}
		console.log("[onFormInputsChange] mutation: ", mutation);
		setRegistrationData((prev) => {
			return { ...prev, ...mutation };
		});
	};

	return (
		<>
			<Show when={step() === "type"}>
				{/* MAIN PAGE - USER HASN'T SELECTED A FORM YET (or went Back to the picker) */}
				<div
					id="registrationPicker"
					class="w-full max-sm:w-[calc(100dvw-4.25rem)] h-full max-sm:h-[calc(100dvh-4.25rem)] place-items-center font-didact">
					<h1 class="sr-only">Εγγραφές στη Σχολή Βυζαντινής & Παραδοσιακής Μουσικής</h1>
					<div id="firstSelect" class="h-full w-full flex flex-row place-items-center overflow-hidden max-sm:flex-col">
						<For each={btns}>
							{([str, type]) => (
								<div class="group/select relative h-full w-full grid before:absolute before:-z-10 before:inset-0 before:bg-[radial-gradient(transparent_-30%,black)] before:transition-transform before:duration-500 hover:before:scale-125 focus-within:before:scale-125 overflow-hidden">
									<div
										id={type}
										class="glass w-max place-self-center rounded-lg shadow-gray-700 transition-colors duration-500 ease-in-out group-hover/select:bg-red-900/80 group-hover/select:shadow-md group-focus-within/select:bg-red-900/80 group-focus-within/select:shadow-md">
										<button
											class="p-6 max-lg:p-4 text-[clamp(1.75rem,3.1vw,3rem)] max-sm:text-3xl max-3xs:text-2xl font-bold drop-shadow-[-2px_1px_1px_rgba(15,15,15,1)] font-anaktoria text-white "
											onClick={() => onMusicTypeChange(type)}>
											{str}
										</button>
									</div>
									<img
										src={`/${type}.jpg`}
										alt=""
										aria-hidden="true"
										decoding="async"
										class="absolute inset-0 h-full max-sm:w-full object-cover -z-50 blur-[2px] transition-transform duration-500 group-hover/select:scale-105 group-focus-within/select:scale-105"
									/>
								</div>
							)}
						</For>
					</div>
				</div>
			</Show>
			<Show when={musicType() !== MusicType.None}>
				{/* Bottom padding keeps the last fields and the submit button clear of the floating department pill. */}
				<div
					class={
						"relative h-max pb-[calc(6rem+env(safe-area-inset-bottom))] max-lg:pb-[calc(9.5rem+env(safe-area-inset-bottom))]" +
						(step() === "type" ? " hidden" : "")
					}>
					<img
						id="registrationFormBg"
						src={`/${musicType()}.jpg`}
						alt=""
						aria-hidden="true"
						class="fixed inset-0 h-full w-full object-cover blur-[2px] z-0 pointer-events-none"
					/>
					<div
						id="registrationContainer"
						class="relative z-10 w-full h-full flex flex-col grid-cols-1 py-10 gap-y-4 place-items-center font-didact max-sm:gap-y-12">
						{/* Mounted once the pupil is identified and then only hidden (Back to the picker keeps what was typed). */}
						<Show when={identityResolved()}>
							<form
								id="registrationForm"
								data-prefix={PREFIX}
								class={
									"group/form relative z-10 px-20 max-sm:px-0 py-10 grid grid-cols-2 auto-rows-auto max-sm:flex flex-col max-sm:items-center gap-20 max-sm:gap-10 max-sm:gap-x-4 shadow-lg shadow-gray-800/60 rounded-md border-solid border-2 border-red-900 bg-white/90 backdrop-blur-sm" +
									// A focused field is scrolled clear of the floating department pill.
									" [&_:is(input,select,textarea,button)]:scroll-mb-28" +
									(step() === "form" ? "" : " hidden")
								}
								onInput={markDirty}
								onChange={markDirty}
								onSubmit={onSubmit}>
								<h1 class="col-span-full text-5xl max-sm:text-3xl max-sm:text-center max-sm:py-2 text-red-900 font-anaktoria font-bold w-[75%] justify-self-center text-center drop-shadow-[-2px_1px_1px_rgba(0,0,0,0.15)]">
									{heading[musicType()]}
								</h1>
								<Show when={!windowOpen}>
									<OutOfWindowNotice schoolYear={schoolYearShort} class="col-span-full justify-self-center max-w-[60ch]" />
								</Show>
								{Object.values(genericInputs).map((input) => {
									// A pupil without ΑΜ (new, or not given one yet) has nothing to fill in: the field is not shown at all.
									if (input.name === "am" && withoutAm()) return null;
									// After the ΑΜ + ΑΜΚΑ lookup those two are read-only (still submitted).
									const locked = identified() && (input.name === "am" || input.name === "amka");
									return (
										<Input
											{...input}
											prefix={PREFIX}
											value={registrationData[input.name as keyof PupilRegistrationForm] as any}
											disabled={input.disabled || locked}
											blurDisabled={locked ? false : input.blurDisabled}
										/>
									);
								})}
								<For each={inputsByMusicType(musicType(), store, registrationData)}>
									{(input) => <Input {...input} prefix={PREFIX} onchange={onFormInputsChange} />}
								</For>
								<Show when={submitError()}>
									<p
										role="alert"
										data-submit-error
										class="col-span-full justify-self-center max-w-[60ch] rounded-md bg-red-100 px-4 py-3 font-didact text-base text-red-900">
										<Icon name="alert-circle" class="mr-2" />
										{submitError()}
									</p>
								</Show>
								<Show
									when={!spinner()}
									fallback={
										<div class="col-span-full w-max place-self-center p-2 px-6">
											<Spinner />
										</div>
									}>
									<button
										class="col-span-full w-max font-didact place-self-center text-2.5xl font-semibold p-2 px-7 rounded-xl text-red-50 bg-linear-to-r from-red-800 to-red-900 shadow-lg shadow-red-950/30 ring-1 ring-red-950/20 transition-all duration-200 ease-out hover:shadow-xl hover:shadow-red-950/40 hover:from-red-900 hover:to-red-950 focus:outline-hidden focus:ring-2 focus:ring-red-900 focus:ring-offset-2 active:shadow-lg group-[:is(.animate-shake)]/form:from-red-600 group-[:is(.animate-shake)]/form:to-red-700"
										type="submit">
										Εγγραφή
									</button>
								</Show>
							</form>
						</Show>
						<Show when={step() === "lookup"}>
							{/* ---- returning student: ΑΜ + ΑΜΚΑ only ---- */}
							<div
								id="registrationLookup"
								class="relative z-10 w-[min(92vw,34rem)] px-10 max-sm:px-5 py-10 grid gap-y-6 shadow-lg shadow-gray-800/60 rounded-md border-solid border-2 border-red-900 bg-white/90 backdrop-blur-sm">
								<div class="grid gap-y-1 text-center">
									<h1 class="text-4xl max-sm:text-3xl text-red-900 font-anaktoria font-bold drop-shadow-[-2px_1px_1px_rgba(0,0,0,0.15)]">
										{heading[musicType()]}
									</h1>
									<p class="font-didact text-base text-red-950/80">
										Συμπληρώστε τον αριθμό μητρώου και τον ΑΜΚΑ σας για να ανακτήσουμε τα στοιχεία σας.
									</p>
								</div>
								<Show when={!windowOpen}>
									<OutOfWindowNotice schoolYear={schoolYearShort} />
								</Show>

								<form class="grid gap-y-5" onSubmit={onLookup}>
									<label class="grid gap-y-1">
										<span class="font-didact text-sm font-semibold text-red-950">Αριθμός Μητρώου</span>
										<input
											name="lookup-am"
											aria-describedby="lookup-am-hint"
											type="text"
											inputmode="numeric"
											autocomplete="off"
											class="rounded-md border border-red-900/40 bg-white px-3 py-2 font-didact text-lg text-red-950 shadow-inner focus:outline-hidden focus:ring-2 focus:ring-red-900"
											value={lookupAm()}
											onInput={(e) => setLookupAm(e.currentTarget.value)}
										/>
										<span id="lookup-am-hint" class="font-didact text-sm text-red-950/70">
											Αν εγγραφήκατε ως νέος μαθητής και δεν σας έχει δοθεί ακόμη αριθμός μητρώου, αφήστε το κενό.
										</span>
									</label>
									<label class="grid gap-y-1">
										<span class="font-didact text-sm font-semibold text-red-950">ΑΜΚΑ</span>
										<input
											name="lookup-amka"
											type="text"
											inputmode="numeric"
											maxlength={11}
											autocomplete="off"
											class="rounded-md border border-red-900/40 bg-white px-3 py-2 font-didact text-lg text-red-950 shadow-inner focus:outline-hidden focus:ring-2 focus:ring-red-900"
											value={lookupAmka()}
											onInput={(e) => setLookupAmka(e.currentTarget.value)}
										/>
									</label>

									<Show when={lookupError()}>
										<p role="alert" class="rounded-md bg-red-100 px-3 py-2 font-didact text-sm text-red-900">
											<Icon name="alert-circle" class="mr-2" />
											{lookupError()}
										</p>
									</Show>

									<Show
										when={!lookupBusy()}
										fallback={
											<div class="w-max place-self-center p-2">
												<Spinner />
											</div>
										}>
										<button
											type="submit"
											class="w-max place-self-center text-2xl font-semibold p-2 px-7 rounded-xl text-red-50 bg-linear-to-r from-red-800 to-red-900 shadow-lg shadow-red-950/30 ring-1 ring-red-950/20 transition-all duration-200 ease-out hover:shadow-xl hover:shadow-red-950/40 hover:from-red-900 hover:to-red-950 focus:outline-hidden focus:ring-2 focus:ring-red-900 focus:ring-offset-2 active:shadow-lg">
											Ανάκτηση στοιχείων
										</button>
									</Show>
								</form>

								<div class="grid gap-y-3 border-t border-red-900/15 pt-5">
									<p class="text-center font-didact text-base text-red-950/80">Είστε νέος μαθητής;</p>
									<button
										type="button"
										onClick={onNewStudent}
										class="w-max place-self-center rounded-xl border-2 border-red-900 px-6 py-2 text-xl font-semibold text-red-900 transition-colors hover:bg-red-900 hover:text-red-50 focus:outline-hidden focus:ring-2 focus:ring-red-900 focus:ring-offset-2">
										Πατήστε εδώ
									</button>
								</div>

								<button
									type="button"
									onClick={() => goTo(PICKER)}
									class="w-max place-self-center font-didact text-sm text-red-900/70 underline underline-offset-2 hover:text-red-900">
									Πίσω στην επιλογή μουσικής
								</button>
							</div>
						</Show>
					</div>
					<nav
						id="registrationSelect"
						class={"fixed left-1/2 bottom-[max(1.25rem,2.5vh)] -translate-x-1/2 z-1001" + (step() === "form" ? "" : " hidden")}
						aria-label="Κατηγορίες μαθημάτων">
						<div class="flex items-center gap-[0.2rem] rounded-full bg-red-900/90 backdrop-blur-md px-[0.4rem] py-[0.4rem] max-sm:px-[0.3rem] max-sm:py-[0.3rem] shadow-[0_12px_32px_-8px_rgba(127,29,29,0.65)]">
							<For each={btns}>
								{([str, type]) => (
									<div class="group/btn relative">
										<button
											type="button"
											aria-pressed={type === musicType() ? "true" : "false"}
											class={
												"rounded-full px-[clamp(0.75rem,1.1vw,1.5rem)] py-[clamp(0.375rem,0.5vw,0.75rem)] max-sm:px-3 max-sm:py-1.5 text-[clamp(0.875rem,1.05vw,1.25rem)] max-sm:text-xs font-medium whitespace-nowrap transition-colors duration-300 ease-in-out " +
												(type === musicType()
													? "bg-red-50 text-red-900 font-semibold shadow-md"
													: "text-red-50 hover:bg-red-800 hover:text-white")
											}
											onClick={() => onMusicTypeChange(type)}>
											<span class="max-xs:hidden">{str}</span>
											<span class="hidden max-xs:inline">{str.replace(" Μουσική", "")}</span>
										</button>
									</div>
								)}
							</For>
						</div>
					</nav>
				</div>
			</Show>
			<Popup
				title="Επιτυχής Εγγραφή"
				content={
					!DiplomaClasses.includes(registrationData["class_year"])
						? "Επικοινωνήστε με τη Γραμματεία της Σχολής για ερωτήσεις ή περαιτέρω πληροφορίες."
						: registrationData["class_year"] === "Β' Ανωτέρα"
							? [
									"Για την ολοκλήρωση της εγγραφής θα χρειαστεί να στείλετε ηλεκτρονικά το Απολυτήριο λυκείου σας.",
									" Επικοινωνήστε με τη Γραμματεία της Σχολής για ερωτήσεις ή περαιτέρω πληροφορίες.",
								]
							: [
									"Για την ολοκλήρωση της εγγραφής θα χρειαστεί να στείλετε ηλεκτρονικά το Απολυτήριο λυκείου σας και το Πτυχίο σας.",
									" Επικοινωνήστε με τη Γραμματεία της Σχολής για ερωτήσεις ή περαιτέρω πληροφορίες.",
								]
				}
				onClose={() => {
					// The registration is done: the next one (another department, a sibling) starts from the
					// picker and goes through the identification again.
					setIdentityResolved(false);
					setIdentified(false);
					setWithoutAm(false);
					setLookupAm("");
					setLookupAmka("");
					setMusicType(MusicType.None);
					goTo(PICKER);
				}}
			/>
			<style>
				{`
	#registrationSelect,
	#registrationLookup,
	#registrationForm {
		opacity: 0.0001;
        animation: fadeIn 0.3s ease-in-out forwards;
    }
	#registrationFormBg {
		opacity: 0.0001;
        animation: fadeIn 0.7s ease-in-out 0.3s forwards;
    }
	#registrationPicker,
	#registrationContainer:is(:not(.remove)),
	#submitMessage:is(:not(.hidden)) {
		opacity: 0.0001;
        animation: fadeIn 0.7s ease-in-out 0.3s forwards;
    }
	#registrationSelect:is(.remove),
	#registrationForm:is(.remove) {
        animation: fadeOut 0.3s ease-in-out forwards;
    }
	#registrationContainer:is(.remove) {
        animation: fadeOut 0.3s ease-in-out forwards;
    }
	@keyframes ShakeAnimation {
		0% {
			transform: translateX(0);
			filter: blur(0px);
		}
		10%,
		30%,
		70%,
		90% {
			transform: translateX(1px);
		}
		20%,
		40%,
		60%,
		80% {
			transform: translateX(-1px);
		}
		50% {
			transform: translateX(1px);
			filter: blur(1px);
		}
		100% {
			transform: translateX(0px);
			filter: blur(0px);
		}
	}
`}
			</style>
		</>
	);
}
