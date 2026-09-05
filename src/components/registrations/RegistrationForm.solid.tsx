import { customEvent } from "@_types/custom-events";
import type { Instruments, Registrations } from "@_types/entities";
import { API, useAPI, useHydrate, type APIStore } from "@hooks/useAPI.solid";
import { Random as R } from "@lib/random";
import { AnimTimeline } from "@utilities/dom";
import { ExtendedFormData } from "@utilities/forms";
import { sleep } from "@utilities/sleep";
import { For, Show, createEffect, createSignal, on, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import Input, { type Props as InputProps } from "../input/Input.solid";
import Popup, { PopupShow } from "../other/Popup.solid";
import Spinner from "../other/Spinner.solid";

const PREFIX = "RegForm";
const isPhone = window.matchMedia("(max-width: 640px)").matches;
const genericInputs: Record<
	keyof Omit<
		Registrations,
		| "id"
		| "date"
		| "class_id"
		| "class_year"
		| "teacher_id"
		| "instrument_id"
		| "payment_date"
		| "payment_amount"
		| "total_payment"
		| "registration_url"
		| "pass"
	>,
	InputProps
> = {
	am: {
		label: "Αριθμός Μητρώου",
		name: "am",
		type: "text",
		value: "000",
		required: true,
		iconClasses: "fa-solid fa-id-card",
		tooltip: {
			message: [
				"Για νέες εγγραφές: Ο αριθμός μητρώου είναι 000. ",
				"Για επανεγγραφές: Αναζητήστε τον αριθμό μητρώο στην περσινή αίτηση, η οποία θα σας αποσταλεί με email ή συμβουλευτείτε τη Γραμματεία της Σχολής.",
			],
			position: isPhone ? "top" : "left",
		},
	},
	amka: {
		label: "ΑΜΚΑ",
		name: "amka",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-id-card",
		tooltip: {
			message: ["Συμπληρώνετε τον Αριθμό Μητρώου Κοινωνικής Ασφάλισης (ΑΜΚΑ) σας.", "Ο ΑΜΚΑ αποτελείται από 11 ψηφία."],
			position: isPhone ? "top" : "right",
		},
	},
	last_name: {
		label: "Επώνυμο",
		name: "last_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user",
		tooltip: {
			message: ["Συμπληρώνετε τα στοιχεία σας με πεζά γράμματα και το πρώτο κεφαλαίο (πχ Παπαδόπουλος Αντώνης)."],
			position: isPhone ? "top" : "left",
		},
	},
	first_name: {
		label: "Όνομα",
		name: "first_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user",
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
		iconClasses: "fa-solid fa-user",
	},
	telephone: {
		label: "Τηλέφωνο",
		name: "telephone",
		type: "tel",
		iconClasses: "fa-solid fa-phone",
	},
	cellphone: {
		label: "Κινητό",
		name: "cellphone",
		type: "tel",
		required: true,
		iconClasses: "fa-solid fa-mobile-screen",
	},
	email: {
		label: "Email",
		name: "email",
		type: "email",
		required: true,
		iconClasses: "fa-solid fa-envelope",
	},
	birth_date: {
		label: "Ημερομηνία Γέννησης",
		name: "birth_date",
		type: "date",
		required: true,
		iconClasses: "fa-regular fa-calendar-days",
	},
	road: {
		label: "Οδός",
		name: "road",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-location-dot",
	},
	number: {
		label: "Αριθμός",
		name: "number",
		type: "number",
		required: true,
		iconClasses: "fa-solid fa-hashtag",
	},
	tk: {
		label: "Τ.Κ.",
		name: "tk",
		type: "number",
		required: true,
		iconClasses: "fa-solid fa-hashtag",
	},
	region: {
		label: "Δήμος/Περιοχή",
		name: "region",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-tree-city",
	},
	registration_year: {
		label: "Σχολικό Έτος",
		name: "registration_year",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-calendar-days",
		disabled: true,
		blurDisabled: false,
		value: "2026-2027",
	},
};

const enum MusicType {
	Byzantine = "byz",
	Traditional = "par",
	European = "eur",
	None = "",
}
const MusicTypeArr: MusicType[] = [MusicType.Byzantine, MusicType.Traditional, MusicType.European, MusicType.None];

const classYearsByMusicType = {
	[MusicType.None]: [""],
	[MusicType.Byzantine]: ["Υπό Κατάταξη", "Α' Ετος", "Β' Ετος", "Γ' Ετος", "Δ' Ετος", "Ε' Ετος", "Α' Ετος Διπλώματος", "Β' Ετος Διπλώματος"],
	[MusicType.Traditional]: [
		"Υπό Κατάταξη",
		"Α' Προκαταρκτική",
		"Α' Κατωτέρα",
		"Β' Κατωτέρα",
		"Α' Μέση",
		"Β' Μέση",
		"Γ' Μέση",
		"Α' Ανωτέρα",
		"Β' Ανωτέρα",
		"Α' Διπλώματος",
		"Β' Διπλώματος",
	],
	[MusicType.European]: [
		"Υπό Κατάταξη",
		"Α' Προκαταρκτική",
		"Α' Κατωτέρα",
		"Β' Κατωτέρα",
		"Α' Μέση",
		"Β' Μέση",
		"Γ' Μέση",
		"Α' Ανωτέρα",
		"Β' Ανωτέρα",
		"Α' Διπλώματος",
		"Β' Διπλώματος",
	],
};

const inputsByMusicType = (musicType: MusicType, store: APIStore, regData: Registrations): InputProps[] => {
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
		const teachers = (store[API.Teachers.get] || [])
			// Filter By Music type
			.filter((t) => {
				return tcs?.find((tc) => {
					return tc.teacher_id === t.id && tc.class_id === musicToIdx[musicType];
				});
			})
			// Filter By Selected instrument/class
			.filter((t) => {
				if (instrument_id === -1) return true;
				return tis?.find((ti) => {
					return ti.teacher_id === t.id && ti.instrument_id === instrument_id;
				});
			});
		teachersInput = {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
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
			iconClasses: "fa-solid fa-guitar",
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
		iconClasses: "fa-solid fa-graduation-cap",
		selectList: classYearsByMusicType[musicType],
		valueLiteral: true,
		value: regData.class_year || "",
		tooltip: {
			message: ["Εαν δεν γνωρίζετε το έτος φοίτησης σας, συμβουλευτείτε τη Γραμματεία της Σχολής"],
			position: isPhone ? "top" : "left",
		},
	};

	return [classYearInput, teachersInput, instrumentsInput];
};

const DiplomaClasses = ["Β' Ετος Διπλώματος", "Β' Ανωτέρα"];

const heading: Record<MusicType, string> = {
	[MusicType.None]: "",
	[MusicType.Byzantine]: "Φόρμα Εγγραφής Βυζαντινής Μουσικής",
	[MusicType.Traditional]: "Φόρμα Εγγραφής Παραδοσιακής Μουσικής",
	[MusicType.European]: "Φόρμα Εγγραφής Ευρωπαϊκής Μουσικής",
};

function fadeInForm(type: MusicType) {
	const atl = new AnimTimeline();
	if (type === MusicType.None) {
		const regContainer = document.querySelector("#registrationContainer") as HTMLElement;
		atl.step(() => regContainer.classList.add("remove"))
			.step({
				time: 500,
				anim: () => {
					regContainer.classList.remove("remove");
					void regContainer.offsetWidth;
				},
			})
			.start();
	} else {
		const form = document.querySelector("#registrationForm") as HTMLElement;
		atl.step(() => form.classList.add("remove"))
			.step({
				time: 500,
				anim: () => {
					form.classList.remove("remove");
					void form.offsetWidth;
				},
			})
			.start();
	}
}

function musicTypeFromURL(): MusicType {
	console.log("[musicTypeFromURL] This function has run");
	const music = ["byz", "par", "eur"] as MusicType[];
	if (window.location.hash) {
		const hash = window.location.hash.replace("#", "");
		const type = decodeURI(hash) as MusicType;
		window.location.hash = "";
		if (music.includes(type)) {
			return type;
		}
	}
	return MusicType.None;
}

async function loadRegistrationId(apiHook: ReturnType<typeof useAPI>) {
	let urlParams = new URLSearchParams(window.location.search);
	if (urlParams.has("regid")) {
		const reg_url = urlParams.get("regid") as string;
		try {
			const res = await apiHook(API.Registrations.getByReregistrationUrl, {
				UrlArgs: { url: reg_url },
			});
			if (!res.data) return;
			res.data.registration_year = genericInputs.registration_year.value as any;
			res.data.class_year = "";
			res.data.teacher_id = -1;
			res.data.instrument_id = -1;
			return res.data;
		} catch (err) {}
	}
}

export function RegistrationForm() {
	const [store, setStore] = createStore<APIStore>({});
	const [registrationData, setRegistrationData] = createStore<Registrations>({} as any);
	const apiHook = useAPI(setStore);
	const [musicType, setMusicType] = createSignal<MusicType>(musicTypeFromURL());
	const [spinner, setSpinner] = createSignal(false, { equals: false });

	useHydrate(() => {
		apiHook(API.Teachers.get);
		apiHook(API.Teachers.getClasses);
		apiHook(API.Teachers.getInstruments);
		apiHook(API.Instruments.get);
	});

	// Trigger the fade-in effect whenever the music type changes
	createEffect(on(musicType, () => fadeInForm(musicType())));

	// Load registration data from URL on mount if any
	onMount(async () => {
		const regData = await loadRegistrationId(apiHook);
		console.log(regData);
		if (!regData) return;
		setRegistrationData((prev) => {
			return { ...prev, ...regData };
		});
		setMusicType(MusicTypeArr[regData.class_id]);
	});

	const onMusicTypeChange = (type: MusicType) => {
		console.log("[onMusicTypeChange] triggered");
		setMusicType(type);
		setRegistrationData((prev) => {
			return { ...prev, instrument_id: -1, teacher_id: -1 };
		});
	};

	const onSubmit = async function (e: Event) {
		e.preventDefault();
		const teachers = store[API.Teachers.get];
		if (!teachers) return;

		const form = e.target as HTMLFormElement;
		const formData = new ExtendedFormData<Registrations>(form);
		const data: Omit<Registrations, "id" | "payment_amount" | "total_payment"> = {
			last_name: formData.string("last_name"),
			first_name: formData.string("first_name"),
			am: formData.string("am"),
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
			registration_url: R.string(32),
			pass: false,
		};
		setRegistrationData(data);
		try {
			if (data.am.startsWith("0") && data.class_year !== "Υπό Κατάταξη" && data.class_year !== "Α' Προκαταρκτική" && data.class_year !== "Α' Ετος") {
				alert(
					"Ο αριθμός μητρώου δεν μπορεί να είναι 000 ή να ξεκινάει με 0. Αν δεν γνωρίζεται το ΑΜ, θα το βρείτε σε προσωπικό μαιλ, αλλιώς επικοινωνήστε με τη Γραμματεία της Σχολής.",
				);
				throw Error("");
			}
			if (data.amka.length !== 11) {
				alert("Ο ΑΜΚΑ αποτελείται μόνο από 11 ψηφία.");
				throw Error("");
			}
			if (data.teacher_id === -1 && data.class_year !== "Α' Προκαταρκτική" && data.class_year !== "Υπό Κατάταξη") {
				alert("Παρακαλώ επιλέξτε καθηγητή");
				throw Error("");
			}
			if (data.instrument_id === 0 && data.class_id > 0) {
				alert("Παρακαλώ επιλέξτε όργανο / μάθημα");
				throw Error("");
			}
			if (data.class_year === "undefined") {
				alert("Παρακαλώ επιλέξτε έτος φοίτησης");
				throw Error("");
			}
			setSpinner(true);
			const res = await apiHook(API.Registrations.post, { RequestObject: data });
			if (res.data) {
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
			const form = document.querySelector("#registrationForm") as HTMLElement;
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
		} finally {
			setSpinner(false);
		}
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
		let mutation: Partial<Registrations>;
		if (el.name === "class_year") {
			document.querySelector("[name='teacher_id']")?.dispatchEvent(customEvent("enable_input", !(el.value === "Υπό Κατάταξη")));
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
			<Show
				when={musicType() !== MusicType.None}
				fallback={
					// MAIN PAGE - USER HASN'T SELECTED A FORM YET
					<div
						id="registrationContainer"
						class="w-full max-sm:w-[100dvw] h-full max-sm:h-[calc(100dvh_-_6rem)] max-3xs:h-[calc(100dvh_-_4rem)] place-items-center font-dicact">
						<h1 class="sr-only">Εγγραφές στη Σχολή Βυζαντινής & Παραδοσιακής Μουσικής</h1>
						<div id="firstSelect" class="h-full w-full flex flex-row place-items-center overflow-hidden max-sm:flex-col">
							<For each={btns}>
								{([str, type]) => (
									<div class="group/select relative h-full w-full grid before:absolute before:-z-10 before:inset-0 before:bg-[radial-gradient(transparent_-30%,_black)] before:transition-transform before:duration-500 hover:before:scale-125 focus-within:before:scale-125 overflow-hidden">
										<div
											id={type}
											class="glass w-max place-self-center rounded-lg shadow-gray-700 transition-colors duration-500 ease-in-out group-hover/select:bg-opacity-80 group-hover/select:shadow-md group-focus-within/select:bg-opacity-80 group-focus-within/select:shadow-md">
											<button
												class="p-6 text-5xl max-sm:text-3xl max-3xs:text-2xl font-bold drop-shadow-[-2px_1px_1px_rgba(15,15,15,1)] font-anaktoria text-white "
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
				}>
				<div class="relative h-max pb-[6rem] max-lg:pb-[9.5rem]">
					<img
						id="registrationFormBg"
						src={`/${musicType()}.jpg`}
						alt=""
						aria-hidden="true"
						class="fixed inset-0 h-full w-full object-cover blur-[2px] z-0 pointer-events-none"
					/>
					<div
						id="registrationContainer"
						class="relative z-10 w-full h-full flex flex-col grid-cols-1 py-10 gap-y-4 place-items-center font-dicact max-sm:gap-y-12">
						<form
							id="registrationForm"
							data-prefix={PREFIX}
							class="group/form relative z-10 px-20 max-sm:px-0 py-10 grid grid-cols-2 auto-rows-auto max-sm:flex flex-col max-sm:items-center gap-20 max-sm:gap-10 max-sm:gap-x-4 shadow-lg shadow-gray-800/60 rounded-md border-solid border-2 border-red-900 bg-white/90 backdrop-blur-sm"
							onSubmit={onSubmit}>
							<h1 class="col-span-full text-5xl max-sm:text-3xl max-sm:text-center max-sm:py-2 text-red-900 font-anaktoria font-bold w-[75%] justify-self-center text-center drop-shadow-[-2px_1px_1px_rgba(0,0,0,0.15)]">
								{heading[musicType()]}
							</h1>
							{Object.values(genericInputs).map((input) => {
								return <Input {...input} prefix={PREFIX} value={registrationData[input.name as keyof Registrations] as any} />;
							})}
							<For each={inputsByMusicType(musicType(), store, registrationData)}>
								{(input) => <Input {...input} prefix={PREFIX} onchange={onFormInputsChange} />}
							</For>
							<Show
								when={!spinner()}
								fallback={
									<div class="col-span-full w-max place-self-center p-2 px-6">
										<Spinner />
									</div>
								}>
								<button
									class="col-span-full w-max font-didact place-self-center text-[1.75rem] font-semibold p-2 px-7 rounded-xl text-red-50 bg-gradient-to-r from-red-800 to-red-900 shadow-lg shadow-red-950/30 ring-1 ring-red-950/20 transition-all duration-200 ease-out hover:shadow-xl hover:shadow-red-950/40 hover:from-red-900 hover:to-red-950 focus:outline-none focus:ring-2 focus:ring-red-900 focus:ring-offset-2 active:shadow-lg group-[:is(.animate-shake)]/form:from-red-600 group-[:is(.animate-shake)]/form:to-red-700"
									type="submit">
									Εγγραφή
								</button>
							</Show>
						</form>
					</div>
					<nav id="registrationSelect" class="fixed left-1/2 bottom-[max(1.25rem,2.5vh)] -translate-x-1/2 z-[1001]" aria-label="Κατηγορίες μαθημάτων">
						<div class="flex items-center gap-[0.2rem] rounded-full bg-red-900/90 backdrop-blur-md px-[0.4rem] py-[0.4rem] max-sm:px-[0.3rem] max-sm:py-[0.3rem] shadow-[0_12px_32px_-8px_rgba(127,29,29,0.65)]">
							<For each={btns}>
								{([str, type]) => (
									<div class="group/btn relative">
										<button
											type="button"
											aria-pressed={type === musicType() ? "true" : "false"}
											class={
												"rounded-full px-[1.1vw] py-[0.5vw] max-sm:px-3 max-sm:py-1.5 text-[1.05vw] max-sm:text-xs font-medium whitespace-nowrap transition-colors duration-300 ease-in-out " +
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
					setMusicType(MusicType.None);
				}}
			/>
			<style>
				{`
	#registrationSelect,
	#registrationForm {
		opacity: 0.0001;
        animation: fadeIn 0.3s ease-in-out forwards;
    }
	#registrationFormBg {
		opacity: 0.0001;
        animation: fadeIn 0.7s ease-in-out 0.3s forwards;
    }
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
