import { array, boolean, number, object, string } from "valibot";
import { APIResponse } from "../../lib/routes/index.client.ts";
import { v_Registrations, type Registrations } from "../../types/entities";
import { getJson, randomBoolean, randomItem, randomNumber, expectBody, standardRandomDate, useTestAPI, chain, test, randomMail, randomString } from "../testHelpers.ts";

const label = (str: string) => {
	return "--registrations-- " + str;
};

const classes = [
	"Υπό Κατάταξη",
	"Α' Ετος",
	"Β' Ετος",
	"Γ' Ετος",
	"Δ' Ετος",
	"Ε' Ετος",
	"Α' Ετος Διπλώματος",
	"Β' Ετος Διπλώματος",
	"Α' Προκαταρκτική",
	"Α' Κατωτέρα",
	"Β' Κατωτέρα",
	"Α' Μέση",
	"Β' Μέση",
	"Γ' Μέση",
	"Α' Ανωτέρα",
	"Β' Ανωτέρα",
];

async function registrationsTest() {
	const registration = {
		last_name: "last_name",
		first_name: "first_name",
		am: "123",
		amka: "12345678901",
		fathers_name: "fathers_name",
		telephone: "telephone",
		cellphone: "cellphone",
		email: "koxafis@gmail.com",
		birth_date: randomNumber(1000000000, 9999999999),
		road: "road",
		number: randomNumber(0, 100),
		tk: randomNumber(10000, 99999),
		region: "region",
		registration_year: "2024-2025",
		class_year: randomItem(classes),
		class_id: randomNumber(0, 2),
		teacher_id: randomNumber(0, 50),
		instrument_id: 1,
		date: standardRandomDate().getTime(),
		registration_url: randomString(32),
		pass: randomBoolean(),
	} as Registrations;
	let newRegId: number | null;
	let newRegUrl: string | null;
	await chain([
		label("POST /registrations"), async () => {

			let res = await useTestAPI("Registrations.post", {
				RequestObject: registration,
			});

			let json = await getJson<APIResponse["Registrations.post"]>(res);
			expectBody(json, object({ id: number() }));

			newRegId = json.data.id;
		}],
		[
			label("GET /registrations/:id"), async () => {
				const res = await useTestAPI("Registrations.getById", {
					UrlArgs: { id: newRegId as number }
				});

				const json = await getJson<APIResponse["Registrations.getById"]>(res);
				expectBody(json, v_Registrations);
				newRegUrl = json.data.registration_url || "";
			}],
		[
			label("GET /reregistrations/:url"), async () => {
				const res = await useTestAPI("Registrations.getByReregistrationUrl", {
					UrlArgs: { url: newRegUrl as string }
				});

				const json = await getJson<APIResponse["Registrations.getByReregistrationUrl"]>(res);
				expectBody(json, v_Registrations);
			}],
		[
			label("PUT /registrations"), async () => {
				const registration = {
					id: 503,
					am: "123",
					amka: "12345678901",
					last_name: "last_name",
					first_name: "first_name",
					fathers_name: "fathers_name",
					telephone: "telephone",
					cellphone: "cellphone",
					email: "mail@mail.com",
					birth_date: randomNumber(1000000000, 9999999999),
					road: "road",
					number: randomNumber(0, 100),
					tk: randomNumber(10000, 99999),
					region: "region",
					registration_year: "2024-2025",
					class_year: randomItem(classes),
					class_id: randomNumber(0, 2),
					teacher_id: randomNumber(0, 50),
					instrument_id: 1,
					date: standardRandomDate().getTime(),
					payment_amount: 0,
					total_payment: 0,
					payment_date: null,
					pass: randomBoolean(),
				};
				const res = await useTestAPI("Registrations.update", {
					RequestObject: registration
				});

				const json = await getJson<APIResponse["Registrations.update"]>(res);
				expectBody(json, "Registration updated successfully");
			}],
		[
			label("DELETE /registrations"), async () => {
				const res = await useTestAPI("Registrations.delete", {
					RequestObject: [newRegId as number]
				});

				const json = await getJson<APIResponse["Registrations.delete"]>(res);
				expectBody(json, "Registration deleted successfully");
			}]
	);
}


async function emailRegistrationsTest() {
	let email = randomMail();
	let token;
	await chain([
		label("POST /registrations/email-subscribe"), async () => {
			const res = await useTestAPI("Registrations.emailSubscribe", {
				RequestObject: { email }
			});

			const json = await getJson<APIResponse["Registrations.emailSubscribe"]>(res);
			expectBody(json, object({ subscribed: boolean() }));
		}],
		[
			label("POST /registrations/email-subscribe/token"), async () => {
				const res = await useTestAPI("Registrations.getSubscriptionToken", {
					RequestObject: { email }
				});

				const json = await getJson<APIResponse["Registrations.getSubscriptionToken"]>(res);
				expectBody(json, object({ token: string() }));
				token = json.data.token;
			}],
		[
			label("POST /registrations/email-unsubscribe"), async () => {
				const res = await useTestAPI("Registrations.emailUnsubscribe", {
					RequestObject: { token }
				});

				const json = await getJson<APIResponse["Registrations.emailUnsubscribe"]>(res);
				expectBody(json, object({ isValid: boolean() }));
			}
		]);
}

emailRegistrationsTest();
registrationsTest();


test(label("GET /registrations"), async () => {
	try {
		const res = await useTestAPI("Registrations.get", {
			UrlArgs: { year: 2026 }
		});

		const json = await getJson<APIResponse["Registrations.get"]>(res);
		expectBody(json, array(v_Registrations));
	} catch (err) {
		console.error({ err });
	}
});


test(label("GET /registrations/total"), async () => {
	const res = await useTestAPI("Registrations.getTotal");

	const json = await getJson<APIResponse["Registrations.getTotal"]>(res);
	expectBody(json, object({ total: number() }));
});
