import { createStore } from "solid-js/store";
import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Instruments, Registrations, TeacherInstruments, Teachers } from "../../../types/entities";
import Input, { type Props as InputProps } from "../Input.solid";
import { Show, createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import { CloseButton } from "../admin/table/CloseButton.solid";

const isPhone = window.matchMedia("(max-width: 640px)").matches;
const genericInputs: Record<
	keyof Omit<
		Registrations,
		"id" | "date" | "class_id" | "class_year" | "teacher_id" | "instrument_id" | "payment_date" | "payment_amount"
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
				"Για επανεγγραφές: Αναζητήστε τον αριθμό μητρώο στην περσινή αίτηση, η οποία θα σας αποσταλεί με email."
			],
			position: isPhone ? "top" : "left"
		}
	},
	last_name: {
		label: "Επώνυμο",
		name: "last_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user",
		tooltip: {
			message: ["Συμπληρώνεται τα στοιχεία σας με πεζά γράμματα και το πρώτο κεφαλαίο (πχ Παπαδόπουλος Αντώνης)."],
			position: isPhone ? "top" : "right"
		}
	},
	first_name: {
		label: "Όνομα",
		name: "first_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user",
		tooltip: {
			message: ["Συμπληρώνεται τα στοιχεία σας όπως ακριβώς αναγράφονται στην ταυτότητα σας."],
			position: isPhone ? "top" : "left"
		}
	},
	fathers_name: {
		label: "Πατρώνυμο",
		name: "fathers_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user"
	},
	telephone: {
		label: "Τηλέφωνο",
		name: "telephone",
		type: "tel",
		iconClasses: "fa-solid fa-phone"
	},
	cellphone: {
		label: "Κινητό",
		name: "cellphone",
		type: "tel",
		required: true,
		iconClasses: "fa-solid fa-mobile-screen"
	},
	email: {
		label: "Email",
		name: "email",
		type: "email",
		required: true,
		iconClasses: "fa-solid fa-envelope"
	},
	birth_date: {
		label: "Ημερομηνία Γέννησης",
		name: "birth_date",
		type: "date",
		required: true,
		iconClasses: "fa-regular fa-calendar"
	},
	road: {
		label: "Οδός",
		name: "road",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-location-dot"
	},
	number: {
		label: "Αριθμός",
		name: "number",
		type: "number",
		required: true,
		iconClasses: "fa-solid fa-hashtag"
	},
	tk: {
		label: "Τ.Κ.",
		name: "tk",
		type: "number",
		required: true,
		iconClasses: "fa-solid fa-hashtag"
	},
	region: {
		label: "Δήμος/Περιοχή",
		name: "region",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-tree-city"
	},
	registration_year: {
		label: "Σχολικό Έτος",
		name: "registration_year",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-calendar",
		disabled: true,
		blurDisabled: false,
		value: "2023-2024"
	}
};

const byzantineInputs = (teachers: Teachers[]): Record<keyof Pick<Registrations, "class_year" | "teacher_id">, InputProps> => {
	return {
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: ["Α' Ετος", "Β' Ετος", "Γ' Ετος", "Δ' Ετος", "Ε' Ετος", "Α' Ετος Διπλώματος", "Β' Ετος Διπλώματος"],
			valueLiteral: true,
			tooltip: {
				message: ["Εαν δεν γνωρίζεται το έτος φοίτησης σας, συμβουλευτείτε τη γραμματεία"],
				position: isPhone ? "top" : "right"
			}
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map(teacher => teacher.fullname),
			valueLiteral: true
		}
	};
};

const traditionalInputs = (teachers: Teachers[]): Record<keyof Pick<Registrations, "class_year" | "teacher_id">, InputProps> => {
	return {
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: ["Α' Προκαταρκτική", "Α' Κατωτέρα", "Β' Κατωτέρα", "Α' Μέση", "Β' Μέση", "Γ' Μέση", "Α' Ανωτέρα", "Β' Ανωτέρα"],
			valueLiteral: true,
			tooltip: {
				message: ["Εαν δεν γνωρίζεται το έτος φοίτησης σας, συμβουλευτείτε τη γραμματεία"],
				position: isPhone ? "top" : "right"
			}
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map(teacher => teacher.fullname),
			valueLiteral: true
		}
	};
};

const europeanInputs = (teachers: Teachers[]): Record<keyof Pick<Registrations, "class_year" | "teacher_id">, InputProps> => {
	return {
		class_year: {
			label: "Έτος Φοίτησης",
			name: "class_year",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-graduation-cap",
			selectList: ["Α' Προκαταρκτική", "Α' Κατωτέρα", "Β' Κατωτέρα", "Α' Μέση", "Β' Μέση", "Γ' Μέση", "Α' Ανωτέρα", "Β' Ανωτέρα"],
			valueLiteral: true,
			tooltip: {
				message: ["Εαν δεν γνωρίζεται το έτος φοίτησης σας, συμβουλευτείτε τη γραμματεία"],
				position: isPhone ? "top" : "right"
			}
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map(teacher => teacher.fullname),
			valueLiteral: true
		}
	};
};

const instrumentsInput = ({
	type,
	teacher,
	instruments,
	instrumentsList
}: {
	type?: MusicType;
	teacher?: Teachers;
	instruments?: Instruments[];
	instrumentsList?: TeacherInstruments[];
}): { instruments: InputProps } => {
	if (!type || !teacher || !instruments || !instrumentsList || instruments.length === 0)
		return { instruments: { type: null, label: "", name: "" } };
	const teacherInstruments = instrumentsList?.filter(i => i.teacher_id === teacher?.id) || [];
	const multiselectInstruments = teacherInstruments?.map(ti => {
		const i = instruments.find(i => i.id === ti.instrument_id);
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
			multiselectOnce: true
		}
	};
};

const enum MusicType {
	Byzantine = "byz",
	Traditional = "par",
	European = "eur",
	None = ""
}

const heading = {
	[MusicType.Byzantine]: "Φόρμα Εγγραφής Βυζαντινής Μουσικής",
	[MusicType.Traditional]: "Φόρμα Εγγραφής Παραδοσιακής Μουσικής",
	[MusicType.European]: "Φόρμα Εγγραφής Ευρωπαϊκής Μουσικής"
} as { [key in MusicType]: string };

export function RegistrationForm() {
	const [store, setStore] = createStore<APIStore>({});
	const [formSelected, setFormSelected] = createSignal<MusicType>(MusicType.None);
	const [selectedTeacher, setSelectedTeacher] = createSignal<Teachers>();

	const hydrate = createHydration(() => {
		useAPI(setStore, API.Teachers.get, {});
		useAPI(setStore, API.Teachers.getClasses, {});
		useAPI(setStore, API.Teachers.getInstruments, {});
		useAPI(setStore, API.Instruments.get, {});
	});

	createEffect(() => hydrate(true));
	createEffect(
		on(formSelected, type => {
			const select = document.querySelector("select[name='teacher_id']") as HTMLSelectElement;
			if (!select) return;
			select.addEventListener("change", (e: Event) => {
				const target = e.target as HTMLSelectElement;
				const teacher_name = (target[target.selectedIndex] as HTMLOptionElement).value as string;
				setSelectedTeacher(TeachersByType().find(t => t.fullname === teacher_name));
			});
		})
	);

	onMount(() => {
		if (window.location.hash) {
			const hash = window.location.hash.replace("#", "");
			const type = decodeURI(hash);
			const music = {
				"Βυζαντινή Μουσική": "byz",
				"Παραδοσιακή Μουσική": "par",
				"Ευρωπαϊκή Μουσική": "eur"
			} as Record<string, string>;
			if (type in music) {
				const btn = document.querySelector(`#firstSelect #${music[type]} button`) as HTMLElement;
				btn.parentElement?.parentElement?.focus();
				void btn.offsetWidth;
				setTimeout(() => btn.click(), 3000);
			}
		}
	});

	const btns = [
		["Βυζαντινή Μουσική", MusicType.Byzantine],
		["Παραδοσιακή Μουσική", MusicType.Traditional],
		["Ευρωπαϊκή Μουσική", MusicType.European]
	] as const;

	const TeachersByType = createMemo(() => {
		let teacher_store = store[API.Teachers.get]?.slice(0, -1);
		const teachers = teacher_store && (JSON.parse(JSON.stringify(teacher_store)) as Teachers[]);
		const teacher_classes = store[API.Teachers.getClasses];
		if (!teachers || !teacher_classes) return [];
		const id = btns.findIndex(btn => btn[1] === formSelected()) + 1;
		teachers.sort((a, b) => {
			if (a.fullname < b.fullname) return -1;
			if (a.fullname > b.fullname) return 1;
			return 0;
		});
		return teachers.filter(teacher =>
			teacher_classes.find(teacher_class => teacher_class.teacher_id === teacher.id && teacher_class.class_id === id)
		);
	});
	const InstrumentsByTeacher = createMemo(() => {
		const instruments = store[API.Instruments.get];
		const teacher_instruments = store[API.Teachers.getInstruments];
		const teacher = selectedTeacher();
		console.log(teacher);
		if (!instruments || !teacher_instruments || !teacher) return {};
		return {
			type: formSelected(),
			teacher,
			instruments: instruments.filter(i => i.type === formSelected()),
			instrumentsList: teacher_instruments
		};
	}) as () => { teacher: Teachers; instruments: Instruments[]; instrumentsList: TeacherInstruments[] };

	const onSelectClick = (type: MusicType) => () => {
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
		const form = e.target as HTMLFormElement;
		const formData = new FormData(form);
		const data: Omit<Registrations, "id"> = {
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
			class_id: btns.findIndex(btn => btn[1] === formSelected()),
			teacher_id: teachers?.find(t => t.fullname === formData.get("teacher_id"))?.id || -1,
			instrument_id:
				[...document.querySelectorAll<HTMLInputElement>(`button[data-specifier='instruments'][data-selected='true']`)].map(btn => {
					const id = Number(btn.dataset.value) || null;
					return id;
				})[0] || 0,
			date: Date.now()
		};
		const res = await useAPI(setStore, API.Registrations.post, { RequestObject: data });
		if (res.message) {
			const messageDialog = document.querySelector("#submitMessage") as HTMLElement;
			messageDialog.classList.remove("hidden");
			messageDialog.classList.add("grid");
		}
	};

	return (
		<>
			<Show
				when={formSelected() !== MusicType.None}
				fallback={
					// MAIN PAGE - USER HASN'T SELECTED A FORM YET
					<div id="registrationContainer" class="w-full h-full place-items-center font-dicact">
						<div id="firstSelect" class="h-full w-full flex flex-row place-items-center overflow-hidden max-sm:flex-col">
							{btns.map(([str, type]) => (
								<div class="group/select relative h-full w-full grid before:absolute before:-z-10 before:inset-0 before:bg-[radial-gradient(transparent_-30%,_black)] before:transition-transform before:duration-500 hover:before:scale-125 focus-within:before:scale-125 overflow-hidden">
									<div
										id={type}
										class="glass w-max place-self-center rounded-lg shadow-gray-700 transition-colors duration-500 ease-in-out group-hover/select:bg-opacity-80 group-hover/select:shadow-md group-focus-within/select:bg-opacity-80 group-focus-within/select:shadow-md"
									>
										<button
											class="p-6 text-5xl max-sm:text-3xl font-bold drop-shadow-[-2px_1px_1px_rgba(15,15,15,1)] font-anaktoria text-white "
											onClick={onSelectClick(type)}
										>
											{str}
										</button>
									</div>
									<img
										src={`/${type}.jpg`}
										alt="Φόντο εισόδου εγγραφής"
										class="absolute inset-0 h-full max-sm:w-full object-cover -z-50 blur-[2px] transition-transform duration-500 group-hover/select:scale-105 group-focus-within/select:scale-105"
									/>
								</div>
							))}
						</div>
					</div>
				}
			>
				<>
					<div
						id="registrationContainer"
						class="w-full h-full overflow-y-auto pb-20 flex flex-col grid-cols-1 gap-y-4 place-items-center font-dicact"
					>
						<div
							id="registrationSelect"
							class="py-6 max-sm:py-1 max-sm:w-full flex flex-row gap-x-16 max-sm:gap-x-0 max-sm:pt-0 place-items-center"
						>
							{btns.map(([str, type]) => (
								<div
									class={
										"group self-center grid grid-cols-1 border-solid border-2 border-red-900 max-sm:border-0 max-sm:border-b-[1px] rounded-md max-sm:rounded-none shadow-md max-sm:shadow-none shadow-gray-400 transition-colors ease-in-out " +
										(type === formSelected() ? "bg-red-900" : "hover:bg-red-900")
									}
								>
									<button
										class={
											"p-6 max-sm:p-2 text-2xl font-didact font-medium bg-transparent group-hover:text-white transition-colors ease-in-out max-sm:text-base" +
											(type === formSelected() ? " text-white" : " group-hover:text-white")
										}
										onClick={onSelectClick(type)}
									>
										{str}
									</button>
								</div>
							))}
						</div>
						<form
							id="registrationForm"
							class="group/form px-20 max-sm:px-0 py-10 grid grid-cols-2 auto-rows-auto max-sm:flex flex-col max-sm:items-center gap-20 max-sm:gap-10 max-sm:gap-x-4 shadow-lg shadow-gray-600 rounded-md border-solid border-2 border-red-900"
							onSubmit={onSubmit}
						>
							<h1 class="col-span-full text-5xl max-sm:text-3xl max-sm:text-center text-red-900 font-anaktoria font-bold w-[75%] justify-self-center text-center drop-shadow-[-2px_1px_1px_rgba(0,0,0,0.15)]">
								{heading[formSelected()]}
							</h1>
							{Object.values(genericInputs).map(input => (
								<Input {...input} />
							))}
							{formSelected() === MusicType.Byzantine
								? Object.values(byzantineInputs(TeachersByType())).map(input => <Input {...input} />)
								: formSelected() === MusicType.Traditional
								? Object.values(traditionalInputs(TeachersByType())).map(input => <Input {...input} />)
								: Object.values(europeanInputs(TeachersByType())).map(input => <Input {...input} />)}
							{formSelected() === MusicType.Traditional || formSelected() === MusicType.European
								? // @ts-ignore
								  Object.values(instrumentsInput(InstrumentsByTeacher())).map(input => <Input {...input} />)
								: ""}
							<button
								class="col-span-full w-max font-didact place-self-center text-[1.75rem] font-medium p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors ease-in-out bg-green-300 hover:bg-green-400 focus:bg-green-400 group-[:is(.animate-shake)]/form:bg-red-500"
								type="submit"
							>
								Εγγραφή
							</button>
						</form>
					</div>
					<div
						id="submitMessage"
						class="hidden opacity-[0.0001] absolute w-full h-full grid-rows-[100%] place-items-center bg-gray-500 bg-opacity-40 backdrop-blur-[2px]"
					>
						<div
							id="messageBox"
							class="relative p-16 w-[500px] h-max rounded-xl shadow-lg drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)] shadow-gray-700 bg-red-100"
						>
							<p class="text-3xl text-center drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">Επιτυχής Εγγραφή</p>
							<p class="text-xl text-center drop-shadow-[-1px_1px_1px_rgba(0,0,0,0.15)]">Μήνυμα Επιτυχής εγγραφής</p>
							<CloseButton
								classes="absolute top-4 right-4 w-[1.5rem] h-[1.5rem] text-xl"
								onClick={() => {
									const messageDialog = document.querySelector("#submitMessage") as HTMLElement;
									messageDialog.classList.add("hidden");
									messageDialog.classList.remove("grid");
								}}
							></CloseButton>
						</div>
					</div>
				</>
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
	`}
			</style>
		</>
	);
}
