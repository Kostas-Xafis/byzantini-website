import { v_Books, v_Payments } from "@_types/entities";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { chain, test } from "tests/TestChain";
import { array, number, object } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers.ts";

function paymentsTest() {
	const payment = {
		student_name: "John Doe",
		book_id: R.int(32, 52),
		book_amount: 1,
	};
	let newPaymentId: number | null;

	chain("--payments--",
		async () => {
			const res = await useTestAPI("Payments.post", {
				RequestObject: payment,
			});

			const json = await getJson<APIResponse["Payments.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newPaymentId = json.data.insertId;
		},
		async () => {
			const res = await useTestAPI("Payments.getById", {
				RequestObject: [newPaymentId as number]
			});

			const json = await getJson<APIResponse["Payments.getById"]>(res);
			expectBody(json, array(v_Payments));
		},
		async () => {
			let res = await useTestAPI("Books.getById", {
				RequestObject: [payment.book_id as number]
			});
			let json: any = await getJson<APIResponse["Books.getById"]>(res);
			expectBody(json, v_Books);

			const updatedPayment = {
				id: newPaymentId as number,
				amount: json.data.price * payment.book_amount - 1,
			};

			res = await useTestAPI("Payments.updatePayment", {
				RequestObject: updatedPayment,
			});

			json = await getJson<APIResponse["Payments.updatePayment"]>(res);
			expectBody(json, "Updated payment successfully");
		},
		async () => {
			const res = await useTestAPI("Payments.complete", {
				RequestObject: [newPaymentId as number]
			});

			const json = await getJson<APIResponse["Payments.complete"]>(res);
			expectBody(json, "Completed payment successfully");
		},
		async () => {
			const res = await useTestAPI("Payments.delete", {
				RequestObject: [newPaymentId as number]
			});

			const json = await getJson<APIResponse["Payments.delete"]>(res);
			expectBody(json, "Deleted payment successfully");
		}
	);
}

paymentsTest();

test("--payments--", async () => {
	const res = await useTestAPI("Payments.get");

	const json = await getJson<APIResponse["Payments.get"]>(res);
	expectBody(json, array(v_Payments));
});

test("--payments--", async () => {
	const res = await useTestAPI("Payments.getTotal");

	const json = await getJson<APIResponse["Payments.getTotal"]>(res);
	expectBody(json, object({ total: number() }));
});
