import { array, length, number, object, pick } from "valibot";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { type Payoffs, v_Payoffs } from "@_types/entities";
import { expectBody, getJson, useTestAPI } from "../testHelpers";
import { test } from "bun:test";

const SimplePayoff = pick(v_Payoffs, ["id", "wholesaler_id", "amount"]);

function payoffsTest() {
	const wholesaler = {
		name: "Sample Wholesaler",
		address: R.string(20, "a-Z"),
		contact: "John Doe",
		phone: R.string(10, "0-9"),
		email: R.email(),
	};
	let newWholesalerId: number | null;
	let newPayoff: Payoffs | null;
	const bookPrice = R.int(10, 100);
	const booksQuantity = R.int(1, 50);
	const book = {
		title: "Sample Book",
		wholesale_price: bookPrice,
		price: R.int(bookPrice, 200),
		quantity: booksQuantity,
		sold: R.int(0, booksQuantity),
	};

	test("--payoffs-- #1", async () => {
		const res = await useTestAPI("Wholesalers.post", {
			RequestObject: wholesaler,
		});

		const json = await getJson<APIResponse["Wholesalers.post"]>(res);
		expectBody(json, object({ insertId: number() }));

		newWholesalerId = json.data.insertId;
	});
	test("--payoffs-- #2", async () => {
		if (!newWholesalerId) {
			throw new Error("Wholesaler not found");
		}
		const res = await useTestAPI("Books.post", {
			RequestObject: { ...book, wholesaler_id: newWholesalerId },
		});

		const json = await getJson<APIResponse["Books.post"]>(res);
		expectBody(json, object({ insertId: number() }));
	});
	test("--payoffs-- #3", async () => {
		const res = await useTestAPI("Payoffs.get");
		const json = await getJson<APIResponse["Payoffs.get"]>(res);
		expectBody(json, array(SimplePayoff));
		newPayoff = json.data.find((p) => p.wholesaler_id === newWholesalerId) as Payoffs;
	});
	test("--payoffs-- #4", async () => {
		if (!newPayoff) {
			throw new Error("Payoff not found");
		}
		const res = await useTestAPI("Payoffs.getById", {
			RequestObject: [newPayoff?.id],
		});

		const json = await getJson<APIResponse["Payoffs.getById"]>(res);
		expectBody(json, array(SimplePayoff, [length(1)]));
	});
	test("--payoffs-- #5", async () => {
		const res = await useTestAPI("Payoffs.getTotal");

		const json = await getJson<APIResponse["Payoffs.getTotal"]>(res);
		expectBody(json, object({ total: number() }));
	});
	test("--payoffs-- #6", async () => {
		if (!newPayoff) {
			throw new Error("Payoff not found");
		}
		const updatedPayoff = {
			id: newPayoff.id,
			amount: newPayoff.amount - 1,
		};

		const res = await useTestAPI("Payoffs.updateAmount", {
			RequestObject: updatedPayoff,
		});

		const json = await getJson<APIResponse["Payoffs.updateAmount"]>(res);
		expectBody(json, "Updated payoff amount successfully");
	});
	test("--payoffs-- #7", async () => {
		if (!newPayoff) {
			throw new Error("Payoff not found");
		}
		const res = await useTestAPI("Payoffs.complete", {
			RequestObject: [newPayoff.id],
		});

		const json = await getJson<APIResponse["Payoffs.complete"]>(res);
		expectBody(json, "Payoffs completed");
	});
}

payoffsTest();

test("GET /payoffs", async () => {
	const res = await useTestAPI("Payoffs.get");

	const json = await getJson<APIResponse["Payoffs.get"]>(res);
	expectBody(json, array(v_Payoffs));
});
