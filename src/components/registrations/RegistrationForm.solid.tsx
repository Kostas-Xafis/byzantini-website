import {
	For,
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	onMount,
	type Setter,
} from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import type {
	Instruments,
	Registrations,
	TeacherInstruments,
	Teachers,
} from "../../../types/entities";
import Input, { getMultiSelect, type Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { AnimTimeline, deepCopy } from "../../../lib/utils.client";
import Popup from "../other/Popup.solid";
import { customEvent } from "../../../types/custom-events";

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
	last_name: {
		label: "Επώνυμο",
		name: "last_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user",
		tooltip: {
			message: [
				"Συμπληρώνετε τα στοιχεία σας με πεζά γράμματα και το πρώτο κεφαλαίο (πχ Παπαδόπουλος Αντώνης).",
			],
			position: isPhone ? "top" : "right",
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
			position: isPhone ? "top" : "left",
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
		value: "2024-2025",
	},
};

const byzantineInputs = (
	teachers: Teachers[]
): Record<keyof Pick<Registrations, "class_year" | "teacher_id">, InputProps> => {
	return {
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: [
				"Υπό Κατάταξη",
				"Α' Ετος",
				"Β' Ετος",
				"Γ' Ετος",
				"Δ' Ετος",
				"Ε' Ετος",
				"Α' Ετος Διπλώματος",
				"Β' Ετος Διπλώματος",
			],
			valueLiteral: true,
			tooltip: {
				message: [
					"Εαν δεν γνωρίζετε το έτος φοίτησης σας, συμβουλευτείτε τη Γραμματεία της Σχολής",
				],
				position: isPhone ? "top" : "right",
			},
			onchange: (e) => {
				const select = e.target as HTMLSelectElement;
				const teacherSelect = document.querySelector("[name='teacher_id']");
				if (!teacherSelect) return;
				if (select.value === "Υπό Κατάταξη") {
					teacherSelect.dispatchEvent(customEvent("enable_input", false));
				} else {
					teacherSelect.dispatchEvent(customEvent("enable_input", true));
				}
			},
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
			listeners: true,
			blurDisabled: false,
		},
	};
};

const traditionalInputs = (
	teachers: Teachers[],
	resetTeacher: Setter<Teachers | undefined>
): Record<keyof Pick<Registrations, "class_year" | "teacher_id">, InputProps> => {
	return {
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: [
				"Υπό Κατάταξη",
				"Α' Προκαταρκτική",
				"Α' Κατωτέρα",
				"Β' Κατωτέρα",
				"Α' Μέση",
				"Β' Μέση",
				"Γ' Μέση",
				"Α' Ανωτέρα",
				"Β' Ανωτέρα",
			],
			valueLiteral: true,
			tooltip: {
				message: [
					"Εαν δεν γνωρίζετε το έτος φοίτησης σας, συμβουλευτείτε τη Γραμματεία της Σχολής",
				],
				position: isPhone ? "top" : "right",
			},
			onchange: (e) => {
				const select = e.target as HTMLSelectElement;
				const teacherSelect = document.querySelector("[name='teacher_id']");
				const allInstrumentsSelect = document.querySelector("[name='instruments-all']");
				if (!teacherSelect || !allInstrumentsSelect) return;
				if (select.value === "Υπό Κατάταξη" || select.value === "Α' Προκαταρκτική") {
					teacherSelect.dispatchEvent(customEvent("enable_input", false));
					allInstrumentsSelect.dispatchEvent(customEvent("enable_input", true));
					resetTeacher();
				} else {
					teacherSelect.dispatchEvent(customEvent("enable_input", true));
					allInstrumentsSelect.dispatchEvent(customEvent("enable_input", false));
				}
			},
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
			listeners: true,
		},
	};
};

const europeanInputs = (
	teachers: Teachers[],
	resetTeacher: Setter<Teachers | undefined>
): Record<keyof Pick<Registrations, "class_year" | "teacher_id">, InputProps> => {
	return {
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: [
				"Υπό Κατάταξη",
				"Α' Προκαταρκτική",
				"Α' Κατωτέρα",
				"Β' Κατωτέρα",
				"Α' Μέση",
				"Β' Μέση",
				"Γ' Μέση",
				"Α' Ανωτέρα",
				"Β' Ανωτέρα",
			],
			valueLiteral: true,
			tooltip: {
				message: [
					"Εαν δεν γνωρίζετε το έτος φοίτησης σας, συμβουλευτείτε τη Γραμματεία της Σχολής",
				],
				position: isPhone ? "top" : "right",
			},
			onchange: (e) => {
				const select = e.target as HTMLSelectElement;
				const teacherSelect = document.querySelector("[name='teacher_id']");
				const allInstrumentsSelect = document.querySelector("[name='instruments-all']");
				if (!teacherSelect || !allInstrumentsSelect) return;
				if (select.value === "Υπό Κατάταξη" || select.value === "Α' Προκαταρκτική") {
					teacherSelect.dispatchEvent(customEvent("enable_input", false));
					allInstrumentsSelect.dispatchEvent(customEvent("enable_input", true));
					resetTeacher();
				} else {
					teacherSelect.dispatchEvent(customEvent("enable_input", true));
					allInstrumentsSelect.dispatchEvent(customEvent("enable_input", false));
				}
			},
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
			listeners: true,
		},
	};
};

const allInstrumentsInput = ({
	type,
	instruments,
}: {
	type?: MusicType;
	instruments?: Instruments[];
}): { instruments: InputProps } => {
	if (type !== MusicType.Traditional && type !== MusicType.European)
		return { instruments: { type: null, label: "", name: "" } };
	const instrumentsByType = instruments?.filter((i) => i.type === type);
	return {
		instruments: {
			label: "Όργανα-Μαθήματα",
			name: "instruments-all",
			iconClasses: "fa-solid fa-guitar",
			type: "select",
			required: true,
			selectList: instrumentsByType?.map((i) => i.name),
			valueList: instrumentsByType?.map((i) => i.id),
			listeners: true,
			show: false,
		},
	};
};

const instrumentsByTeacherInput = ({
	type,
	teacher,
	instruments,
	instrumentsList,
}: {
	type?: MusicType;
	teacher?: Teachers;
	instruments?: Instruments[];
	instrumentsList?: TeacherInstruments[];
}): { instruments: InputProps } => {
	if (!type || !teacher || !instruments || !instrumentsList || instruments.length === 0)
		return { instruments: { type: null, label: "", name: "" } };
	const teacherInstruments = instrumentsList?.filter((i) => i.teacher_id === teacher?.id) || [];
	const multiselectInstruments = teacherInstruments?.map((ti) => {
		const i = instruments.find((i) => i.id === ti.instrument_id);
		if (!i) return { value: 0, label: "", selected: false };
		return { value: i.id, label: i.name, selected: false };
	});
	multiselectInstruments?.sort((a, b) => {
		if (a.label < b.label) return -1;
		if (a.label > b.label) return 1;
		return 0;
	});

	return {
		instruments: {
			label: "Όργανα-Μαθήματα",
			name: "instruments",
			iconClasses: "fa-solid fa-guitar",
			type: "multiselect",
			required: true,
			multiselectList: multiselectInstruments,
			multiselectOnce: true,
		},
	};
};

const DiplomaClasses = ["Β' Ετος Διπλώματος", "Β' Ανωτέρα"];

const enum MusicType {
	Byzantine = "byz",
	Traditional = "par",
	European = "eur",
	None = "",
}

const heading = {
	[MusicType.Byzantine]: "Φόρμα Εγγραφής Βυζαντινής Μουσικής",
	[MusicType.Traditional]: "Φόρμα Εγγραφής Παραδοσιακής Μουσικής",
	[MusicType.European]: "Φόρμα Εγγραφής Ευρωπαϊκής Μουσικής",
} as { [key in MusicType]: string };

export function RegistrationForm() {
	const [store, setStore] = createStore<APIStore>({});
	const [registrationData, setRegistrationData] = createStore<Registrations>({} as any);
	const apiHook = useAPI(setStore);
	const [formSelected, setFormSelected] = createSignal<MusicType>(MusicType.None);
	const [selectedTeacher, setSelectedTeacher] = createSignal<Teachers>();
	const [spinner, setSpinner] = createSignal(false, { equals: false });
	useHydrate(() => {
		apiHook(API.Teachers.get);
		apiHook(API.Teachers.getClasses);
		apiHook(API.Teachers.getInstruments);
		apiHook(API.Instruments.get);
	});
	createEffect(
		on(formSelected, (type) => {
			if (type === MusicType.None || type === MusicType.Byzantine) return;
			const select = document.querySelector<HTMLSelectElement>("select[name='teacher_id']");
			const teachers = store[API.Teachers.get];
			if (!select || !teachers) return;
			select.addEventListener("change", (e: Event) => {
				setSelectedTeacher(TeachersByType().find((t) => t.id === Number(select.value)));
			});
		})
	);

	onMount(async () => {
		const music = ["byz", "par", "eur"];
		if (window.location.hash) {
			const hash = window.location.hash.replace("#", "");
			const type = decodeURI(hash);
			window.location.hash = "";
			if (music.includes(type)) {
				setTimeout(() => {
					onSelectClick(type as MusicType);
				}, 1250);
			}
		}
		let urlParams = new URLSearchParams(window.location.search);
		if (urlParams.has("regid")) {
			const regid = urlParams.get("regid") as string;
			try {
				const res = await apiHook(API.Registrations.getByReregistrationId, {
					UrlArgs: { id: regid },
				});
				if (!res.data) return;
				res.data.registration_year = "2024-2025";
				res.data.class_year = "";
				res.data.teacher_id = 0;
				setRegistrationData(res.data);
				setFormSelected(music[res.data.class_id] as MusicType);
			} catch (err) {
				console.error(err);
			}
		}
	});

	const btns = [
		["Βυζαντινή Μουσική", MusicType.Byzantine],
		["Παραδοσιακή Μουσική", MusicType.Traditional],
		["Ευρωπαϊκή Μουσική", MusicType.European],
	] as const;

	const TeachersByType = createMemo(() => {
		let teacher_store = store[API.Teachers.get]?.slice();
		const teachers = teacher_store && deepCopy(teacher_store);
		const teacher_classes = store[API.Teachers.getClasses];
		if (!teachers || !teacher_classes) return [];
		const id = btns.findIndex((btn) => btn[1] === formSelected());
		teachers.sort((a, b) => {
			if (a.fullname < b.fullname) return -1;
			if (a.fullname > b.fullname) return 1;
			return 0;
		});
		return teachers.filter((teacher) =>
			teacher_classes.find(
				(teacher_class) =>
					teacher_class.teacher_id === teacher.id && teacher_class.class_id === id
			)
		);
	});
	const InstrumentsByTeacher = createMemo(() => {
		const instruments = store[API.Instruments.get];
		const teacher_instruments = store[API.Teachers.getInstruments];
		const teacher = selectedTeacher();
		if (!instruments || !teacher_instruments || !teacher) return {};
		return {
			type: formSelected(),
			teacher,
			instruments: instruments.filter((i) => i.type === formSelected()),
			instrumentsList: teacher_instruments,
		};
	}) as () => {
		teacher: Teachers;
		instruments: Instruments[];
		instrumentsList: TeacherInstruments[];
	};

	const onSelectClick = (type: MusicType) => {
		const curType = formSelected();
		const atl = new AnimTimeline();
		if (curType === type) return;
		if (curType === MusicType.None) {
			const regContainer = document.querySelector("#registrationContainer") as HTMLElement;
			atl.step(() => regContainer.classList.add("remove"))
				.step({
					time: 500,
					anim: () => {
						regContainer.classList.remove("remove");
						void regContainer.offsetWidth;
						setFormSelected(type);
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
						setFormSelected(type);
					},
				})
				.start();
		}
	};

	const onSubmit = async function (e: Event) {
		e.preventDefault();
		const teachers = store[API.Teachers.get];
		if (!teachers) return;

		const form = e.target as HTMLFormElement;
		const formData = new FormData(form);
		const data: Omit<Registrations, "id" | "payment_amount" | "total_payment"> = {
			last_name: formData.get("last_name") as string,
			first_name: formData.get("first_name") as string,
			am: formData.get("am") as string,
			fathers_name: formData.get("fathers_name") as string,
			telephone: (formData.get("telephone") as string) || "-",
			cellphone: formData.get("cellphone") as string,
			email: formData.get("email") as string,
			birth_date: new Date(formData.get("birth_date") as string).getTime(),
			road: formData.get("road") as string,
			number: Number(formData.get("number") as string),
			tk: Number(formData.get("tk") as string),
			region: formData.get("region") as string,
			registration_year: formData.get("registration_year") as string,
			class_year: formData.get("class_year") as string,
			class_id: btns.findIndex((btn) => btn[1] === formSelected()),
			teacher_id: Number(formData.get("teacher_id")) || -1,
			instrument_id:
				getMultiSelect("instruments").map((btn) => {
					const id = Number(btn.dataset.value) || null;
					return id;
				})[0] ||
				Number(formData.get("instruments-all")) ||
				0,
			date: Date.now(),
			pass: false,
		};
		setRegistrationData(data);
		try {
			if (
				data.am.startsWith("0") &&
				data.class_year !== "Υπό Κατάταξη" &&
				data.class_year !== "Α' Προκαταρκτική" &&
				data.class_year !== "Α' Ετος"
			) {
				alert(
					"Ο αριθμός μητρώου δεν μπορεί να είναι 000 ή να ξεκινάει με 0. Αν δεν γνωρίζεται το ΑΜ, θα το βρείτε σε προσωπικό μαιλ, αλλιώς επικοινωνήστε με τη Γραμματεία της Σχολής."
				);
				throw Error("");
			}
			if (
				data.teacher_id === -1 &&
				data.class_year !== "Υπό Κατάταξη" &&
				data.class_year !== "Α' Προκαταρκτική"
			) {
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
			if (res.message) {
				document.querySelector("#popup")?.dispatchEvent(customEvent("show"));
				setRegistrationData((prevReg) => {
					return {
						...prevReg,
						teacher_id: 0,
						instrument_id: 0,
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
	return (
		<>
			<Show
				when={formSelected() !== MusicType.None}
				fallback={
					// MAIN PAGE - USER HASN'T SELECTED A FORM YET
					<div
						id="registrationContainer"
						class="w-full max-sm:w-[100dvw] h-full max-sm:h-[calc(100dvh_-_8rem)] max-3xs:h-[calc(100dvh_-_6rem)] place-items-center font-dicact">
						<div
							id="firstSelect"
							class="h-full w-full flex flex-row place-items-center overflow-hidden max-sm:flex-col">
							<For each={btns}>
								{([str, type], index) => (
									<div class="group/select relative h-full w-full grid before:absolute before:-z-10 before:inset-0 before:bg-[radial-gradient(transparent_-30%,_black)] before:transition-transform before:duration-500 hover:before:scale-125 focus-within:before:scale-125 overflow-hidden">
										<div
											id={type}
											class="glass w-max place-self-center rounded-lg shadow-gray-700 transition-colors duration-500 ease-in-out group-hover/select:bg-opacity-80 group-hover/select:shadow-md group-focus-within/select:bg-opacity-80 group-focus-within/select:shadow-md">
											<button
												class="p-6 text-5xl max-sm:text-3xl max-3xs:text-2xl font-bold drop-shadow-[-2px_1px_1px_rgba(15,15,15,1)] font-anaktoria text-white "
												onClick={(e) => onSelectClick(type)}>
												{str}
											</button>
										</div>
										<img
											src={`/${type}.jpg`}
											alt="Φόντο εισόδου εγγραφής"
											class="absolute inset-0 h-full max-sm:w-full object-cover -z-50 blur-[2px] transition-transform duration-500 group-hover/select:scale-105 group-focus-within/select:scale-105"
										/>
									</div>
								)}
							</For>
						</div>
					</div>
				}>
				<div class="h-max pb-20">
					<div
						id="registrationContainer"
						class="w-full h-full flex flex-col grid-cols-1 gap-y-4 place-items-center font-dicact max-sm:gap-y-12">
						<div
							id="registrationSelect"
							class="py-6 max-sm:py-1 max-sm:w-full flex flex-row gap-x-16 max-sm:gap-x-0 max-sm:pt-0 place-items-center z-[100]">
							{btns.map(([str, type]) => (
								<div
									class={
										"group self-center grid grid-cols-1 border-solid border-2 border-red-900 max-sm:border-0 max-sm:border-b-[1px] rounded-md max-sm:rounded-none shadow-md max-sm:shadow-none shadow-gray-400 transition-colors ease-in-out " +
										(type === formSelected()
											? "bg-red-900"
											: "hover:bg-red-900")
									}
									onClick={(e) => onSelectClick(type)}>
									<button
										class={
											"p-6 max-sm:p-2 text-2xl font-didact font-medium bg-transparent group-hover:text-white transition-colors ease-in-out max-sm:text-base" +
											(type === formSelected()
												? " text-white"
												: " group-hover:text-white")
										}>
										{str}
									</button>
								</div>
							))}
						</div>
						<form
							id="registrationForm"
							data-prefix={PREFIX}
							class="group/form px-20 max-sm:px-0 py-10 grid grid-cols-2 auto-rows-auto max-sm:flex flex-col max-sm:items-center gap-20 max-sm:gap-10 max-sm:gap-x-4 shadow-lg shadow-gray-600 rounded-md border-solid border-2 border-red-900"
							onSubmit={onSubmit}>
							<h1 class="col-span-full text-5xl max-sm:text-3xl max-sm:text-center max-sm:py-2 text-red-900 font-anaktoria font-bold w-[75%] justify-self-center text-center drop-shadow-[-2px_1px_1px_rgba(0,0,0,0.15)]">
								{heading[formSelected()]}
							</h1>
							{Object.values(genericInputs).map((input) => {
								return (
									<Input
										{...input}
										prefix={PREFIX}
										value={
											registrationData[
												input.name as keyof Registrations
											] as any
										}
									/>
								);
							})}
							{formSelected() === MusicType.Byzantine
								? Object.values(byzantineInputs(TeachersByType())).map((input) => (
										<Input {...input} prefix={PREFIX} />
								  ))
								: formSelected() === MusicType.Traditional
								? Object.values(
										traditionalInputs(TeachersByType(), setSelectedTeacher)
								  ).map((input) => <Input {...input} prefix={PREFIX} />)
								: Object.values(
										europeanInputs(TeachersByType(), setSelectedTeacher)
								  ).map((input) => <Input {...input} prefix={PREFIX} />)}
							{formSelected() === MusicType.Traditional ||
							formSelected() === MusicType.European
								? Object.values(
										instrumentsByTeacherInput(InstrumentsByTeacher())
								  ).map((input) => <Input {...input} prefix={PREFIX} />)
								: ""}
							{formSelected() === MusicType.Traditional ? (
								<Input
									{...allInstrumentsInput({
										type: MusicType.Traditional,
										instruments: store[API.Instruments.get],
									}).instruments}
									prefix={PREFIX}
								/>
							) : formSelected() === MusicType.European ? (
								<Input
									{...allInstrumentsInput({
										type: MusicType.European,
										instruments: store[API.Instruments.get],
									}).instruments}
									prefix={PREFIX}
								/>
							) : (
								""
							)}
							<Show
								when={!spinner()}
								fallback={
									<div class="col-span-full w-max place-self-center p-2 px-6">
										<Spinner />
									</div>
								}>
								<button
									class="col-span-full w-max font-didact place-self-center text-[1.75rem] font-medium p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors ease-in-out bg-green-300 hover:bg-green-400 focus:bg-green-400 group-[:is(.animate-shake)]/form:bg-red-500"
									type="submit">
									Εγγραφή
								</button>
							</Show>
						</form>
					</div>
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
					setFormSelected(MusicType.None);
				}}
			/>
			<style>
				{`
	#registrationSelect,
	#registrationForm {
		opacity: 0.0001;
        animation: fadeIn 0.3s ease-in-out forwards;
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
