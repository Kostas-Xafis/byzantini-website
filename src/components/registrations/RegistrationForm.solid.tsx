import { For, Show, createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { API, useAPI, useHydrate, type APIStore } from "../../../lib/hooks/useAPI.solid";
import type {
	Instruments,
	Registrations,
	TeacherInstruments,
	Teachers,
} from "../../../types/entities";
import { CloseButton } from "../admin/table/CloseButton.solid";
import Input, { getMultiSelect, type Props as InputProps } from "../input/Input.solid";
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
		value: "2023-2024",
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
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
		},
	};
};

const traditionalInputs = (
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
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
		},
	};
};

const europeanInputs = (
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
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map((t) => t.fullname),
			valueList: teachers.map((t) => t.id),
		},
	};
};

const instrumentsInput = ({
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
			const select = document.querySelector(
				"select[name='teacher_id']"
			) as unknown as HTMLSelectElement;
			const teachers = store[API.Teachers.get];
			if (!select || !teachers) return;
			select.addEventListener("change", (e: Event) => {
				setSelectedTeacher(TeachersByType().find((t) => t.id === Number(select.value)));
			});
			setSelectedTeacher();
		})
	);

	onMount(() => {
		if (window.location.hash) {
			const hash = window.location.hash.replace("#", "");
			const type = decodeURI(hash);
			const music = {
				"Βυζαντινή Μουσική": "byz",
				"Παραδοσιακή Μουσική": "par",
				"Ευρωπαϊκή Μουσική": "eur",
			} as Record<string, string>;
			if (type in music) {
				const btn = document.querySelector(
					`#firstSelect #${music[type]} button`
				) as HTMLElement;
				btn.parentElement?.parentElement?.focus();
				void btn.offsetWidth;
				setTimeout(() => btn.click(), 3000);
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
		const teachers = teacher_store && (JSON.parse(JSON.stringify(teacher_store)) as Teachers[]);
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
		if (curType === type) return;
		if (curType === MusicType.None) {
			const regContainer = document.querySelector("#registrationContainer") as HTMLElement;
			regContainer.classList.add("remove");
			void regContainer.offsetWidth;
			setTimeout(() => {
				regContainer.classList.remove("remove");
				void regContainer.offsetWidth;
				setFormSelected(type);
			}, 500);
		} else {
			const form = document.querySelector("#registrationForm") as HTMLElement;
			form.classList.add("remove");
			void form.offsetWidth;
			setTimeout(() => {
				form.classList.remove("remove");
				void form.offsetWidth;
				setFormSelected(type);
			}, 500);
		}
	};

	const onSubmit = async function (e: Event) {
		e.preventDefault();
		const teachers = store[API.Teachers.get];
		if (!teachers) return;
		setSpinner(true);
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
				})[0] || 0,
			date: Date.now(),
		};
		try {
			if (data.teacher_id === -1) {
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
			const res = await apiHook(API.Registrations.post, { RequestObject: data });
			if (res.message) {
				const messageDialog = document.querySelector("#submitMessage") as HTMLElement;
				messageDialog.classList.remove("hidden");
				messageDialog.classList.add("flex");
			}
		} catch (err) {
			const form = document.querySelector("#registrationForm") as HTMLElement;
			setSpinner(false);
			setTimeout(() => {
				form.classList.add("animate-shake");
				setTimeout(() => {
					form.classList.remove("animate-shake");
				}, 500);
			}, 500);
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
							{Object.values(genericInputs).map((input) => (
								<Input {...input} prefix={PREFIX} />
							))}
							{formSelected() === MusicType.Byzantine
								? Object.values(byzantineInputs(TeachersByType())).map((input) => (
										<Input {...input} prefix={PREFIX} />
								  ))
								: formSelected() === MusicType.Traditional
								? Object.values(traditionalInputs(TeachersByType())).map(
										(input) => <Input {...input} prefix={PREFIX} />
								  )
								: Object.values(europeanInputs(TeachersByType())).map((input) => (
										<Input {...input} prefix={PREFIX} />
								  ))}
							{formSelected() === MusicType.Traditional ||
							formSelected() === MusicType.European
								? Object.values(instrumentsInput(InstrumentsByTeacher())).map(
										(input) => <Input {...input} prefix={PREFIX} />
								  )
								: ""}
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
					<div
						id="submitMessage"
						class="hidden fixed inset-0 w-[100dvw] h-[100dvh] items-center justify-center bg-gray-500 bg-opacity-40 backdrop-blur-[2px] z-[100]">
						<div
							id="messageBox"
							class="relative p-12 max-sm:p-6 w-[500px] max-sm:w-[450px] max-[420px]:320px max-2xs:280px h-max rounded-xl flex flex-col justify-center gap-y-4 shadow-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)] shadow-gray-700 bg-red-100">
							<p class="text-3xl text-center drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
								Επιτυχής Εγγραφή
							</p>
							<p class="text-xl text-center drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">
								Η εγγραφή ολοκληρώθηκε επιτυχώς! Επικοινωνήστε με τη Γραμματεία της
								Σχολής για περαιτέρω πληροφορίες
							</p>
							<CloseButton
								classes="absolute top-4 right-4 w-10 h-10 text-xl"
								onClick={() => {
									const messageDialog = document.querySelector(
										"#submitMessage"
									) as HTMLElement;
									messageDialog.classList.add("hidden");
									messageDialog.classList.remove("flex");
								}}></CloseButton>
						</div>
					</div>
				</div>
			</Show>
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

	.animate-shake button {
		animation: ShakeAnimation 0.6s ease-in-out;
	}
`}
			</style>
		</>
	);
}
