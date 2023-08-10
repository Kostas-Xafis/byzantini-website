import { createStore } from "solid-js/store";
import { API, APIStore, createHydration, useAPI } from "../../../lib/hooks/useAPI.solid";
import type { Registrations, Teachers } from "../../../types/entities";
import Input, { type Props as InputProps } from "../Input.solid";
import { Show, createEffect, createMemo, createSignal } from "solid-js";

const genericInputs: Record<keyof Omit<Registrations, "id" | "date" | "class_id" | "class_year" | "teacher_id">, InputProps> = {
	am: {
		label: "Αριθμός Μητρώου",
		name: "am",
		type: "text",
		value: "000",
		required: true,
		iconClasses: "fa-solid fa-id-card"
	},
	last_name: {
		label: "Επώνυμο",
		name: "last_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user"
	},
	first_name: {
		label: "Όνομα",
		name: "first_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user"
	},
	father_name: {
		label: "Πατρώνυμο",
		name: "father_name",
		type: "text",
		required: true,
		iconClasses: "fa-solid fa-user"
	},
	telephone: {
		label: "Τηλέφωνο",
		name: "telephone",
		type: "number",
		iconClasses: "fa-solid fa-phone"
	},
	cellphone: {
		label: "Κινητό",
		name: "cellphone",
		type: "number",
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
	birth_year: {
		label: "Έτος Γέννησης",
		name: "birth_year",
		type: "number",
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
			selectList: ["Α' Ετος", "Β' Ετος", "Γ' Ετος", "Δ' Ετος", "Ε' Ετος", "Α' Ετος Διπλώματος", "Β' Ετος Διπλώματος"]
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map(teacher => teacher.fullname)
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
			selectList: ["Α' Ετος", "Β' Ετος", "Γ' Ετος", "Δ' Ετος", "Ε' Ετος", "Α' Ετος Διπλώματος", "Β' Ετος Διπλώματος"]
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map(teacher => teacher.fullname)
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
			selectList: ["Α' Ετος", "Β' Ετος", "Γ' Ετος", "Δ' Ετος", "Ε' Ετος", "Α' Ετος Διπλώματος", "Β' Ετος Διπλώματος"]
		},
		teacher_id: {
			label: "Καθηγητής",
			name: "teacher_id",
			type: "select",
			required: true,
			iconClasses: "fa-solid fa-user",
			selectList: teachers.map(teacher => teacher.fullname)
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
	const hydrate = createHydration(() => {
		console.log("Hydrating table data");
		useAPI(setStore, API.Teachers.get, {});
		useAPI(setStore, API.Teachers.getClasses, {});
	});

	createEffect(() => hydrate(true));

	const btns = [
		["Βυζαντινή Μουσική", MusicType.Byzantine],
		["Παραδοσιακή Μουσική", MusicType.Traditional],
		["Ευρωπαϊκή Μουσική", MusicType.European]
	] as const;

	const TeachersByType = createMemo(() => {
		const teachers = store[API.Teachers.get];
		const teacher_classes = store[API.Teachers.getClasses];
		if (!teachers || !teacher_classes) return [];
		// Not yet implemented
		const id = btns.findIndex(btn => btn[1] === formSelected()) + 1;
		return teachers.filter(teacher =>
			teacher_classes.find(teacher_class => teacher_class.teacher_id === teacher.id && teacher_class.class_id === id)
		);
	});

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

	return (
		<>
			<Show
				when={formSelected() !== MusicType.None}
				fallback={
					// MAIN PAGE - USER HASN'T SELECTED A FORM YET
					<div id="registrationContainer" class="w-full h-full grid grid-rows-1 grid-cols-1 place-items-center font-dicact">
						<div id="firstSelect" class="h-full w-full grid grid-cols-3 place-items-center overflow-hidden">
							{btns.map(([str, type]) => (
								<div class="group/select relative h-full w-full grid before:absolute before:-z-10 before:inset-0 before:bg-[radial-gradient(transparent_-30%,_black)] before:transition-transform before:duration-500 hover:before:scale-125 overflow-hidden">
									<div class="w-max place-self-center grid grid-cols-1 border-solid border-2 border-transparent rounded-md shadow-gray-700 transition-colors duration-500 ease-in-out group-hover/select:border-red-800  group-hover/select:bg-red-800 group-hover/select:shadow-md">
										<button
											class="p-6 text-5xl font-bold drop-shadow-[-2px_1px_1px_rgba(15,15,15,1)] font-anaktoria text-white "
											onClick={onSelectClick(type)}
										>
											{str}
										</button>
									</div>
									<img
										src={`/${type}.jpg`}
										alt="Φόντο εισόδου εγγραφής"
										class="absolute inset-0 h-full object-cover -z-50 blur-[2px] transition-transform duration-500 group-hover/select:scale-105"
									/>
								</div>
							))}
						</div>
					</div>
				}
			>
				<div
					id="registrationContainer"
					class="w-full h-full overflow-y-auto pb-20 grid grid-rows-[max-content_max-content_1fr] grid-cols-1 gap-y-4 place-items-center font-dicact"
				>
					<div id="registrationSelect" class="py-6 grid grid-cols-3 gap-x-16 place-items-center">
						{btns.map(([str, type]) => (
							<div
								class={
									"group self-center grid grid-cols-1 border-solid border-2 border-red-800 rounded-md shadow-md shadow-gray-400 transition-colors ease-in-out " +
									(type === formSelected() ? "bg-red-800" : "hover:bg-red-800")
								}
							>
								<button
									class={
										"p-6 text-2xl font-didact font-medium bg-transparent group-hover:text-white transition-colors ease-in-out " +
										(type === formSelected() ? "text-white" : "group-hover:text-white")
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
						class="group/form px-20 py-10 grid grid-cols-2 auto-rows-auto gap-20 shadow-lg shadow-gray-600 rounded-md border-solid border-2 border-red-900"
					>
						<h1 class="col-span-full text-5xl text-red-900 font-anaktoria font-bold w-[75%] justify-self-center text-center drop-shadow-[-2px_1px_1px_rgba(0,0,0,0.15)]">
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
						<button
							class="col-span-full w-max font-didact place-self-center text-[1.75rem] font-medium p-2 px-6 shadow-lg shadow-gray-400 rounded-lg transition-colors ease-in-out bg-green-300 hover:bg-green-400 focus:bg-green-400 group/form-[:is(.animate-shake)]:bg-red-500"
							type="submit"
						>
							Εγγραφή
						</button>
					</form>
				</div>
			</Show>
			<style>
				{`
    @keyframes fadeIn {
		0%{
			opacity: 0.0001;
		}
		10%{
			opacity: 0.0001;
		}
        100%{
            opacity: 1;
        }
    }
	@keyframes fadeOut {
		0%{
			opacity: 1;
		}
		99%{
			opacity: 0.0001;
		}
        100%{
			opacity: 0.0001;
        }
    }
	#registrationSelect,
	#registrationForm {
		opacity: 0.0001;
        animation: fadeIn 0.3s ease-in-out forwards;
    }
	#registrationContainer:is(:not(.remove)) {
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
