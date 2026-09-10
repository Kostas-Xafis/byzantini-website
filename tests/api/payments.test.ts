import { v_Books, v_Payments } from "@_types/entities";
import { Random as R } from "@lib/random.ts";
import { type APIResponse } from "@lib/routes/index.client.ts";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { array, number, object } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers.ts";

/**
 * `Payments.post` requires the full z_Payments row minus id/amount/date, so
 * book_id is mandatory — and the route REFUSES a book with no stock left
 * ("Το βιβλίο δεν είναι διαθέσιμο") while decrementing `books.sold` on success.
 *
 * The old payload picked a random id in [32, 52]; 5 of those books are already
 * sold out and 49 does not exist, so the suite failed ~30% of the time — and
 * every successful run permanently consumed a copy, so the failure was
 * inevitable over time. `sold` can only be increased through the API
 * (`Books.updateQuantity` sets `quantity`), so the counter is reset straight in
 * the local dev database before and after this file runs.
 */
const BOOK_ID = 34;
const BOOK_AMOUNT = 1;

const D1_STATE_DIR = path.resolve(import.meta.dir, "../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function withLocalDb<T>(fn: (db: Database) => T): T | null {
	if (!existsSync(D1_STATE_DIR)) return null;
	const files = readdirSync(D1_STATE_DIR)
		.filter((name) => name.endsWith(".sqlite") && !name.startsWith("metadata"))
		.map((name) => path.join(D1_STATE_DIR, name))
		.filter((file) => statSync(file).size > 0);
	if (files.length === 0) return null;
	const db = new Database(files[0]!);
	try {
		return fn(db);
	} finally {
		db.close();
	}
}

/** Puts the book back to full stock so repeated runs stay idempotent. */
const resetBookStock = () =>
	withLocalDb((db) => db.run("UPDATE books SET sold = 0 WHERE id = ?", [BOOK_ID]));

function paymentsTest() {
	const payment = {
		student_name: "John Doe",
		book_id: BOOK_ID,
		book_amount: BOOK_AMOUNT,
	};
	let newPaymentId: number | null = null;

	beforeAll(() => {
		resetBookStock();
	});
	afterAll(() => {
		resetBookStock();
	});

	test("--payments-- #1", async () => {
		const res = await useTestAPI("Payments.post", {
			RequestObject: payment,
		});

		const json = await getJson<APIResponse["Payments.post"]>(res);
		expectBody(json, object({ insertId: number() }));

		newPaymentId = json.data.insertId;
		// Fail loudly here rather than letting every later test cascade.
		expect(newPaymentId).toBeGreaterThan(0);
	});
	test("--payments-- #2", async () => {
		const res = await useTestAPI("Payments.getById", {
			RequestObject: [newPaymentId as number],
		});

		const json = await getJson<APIResponse["Payments.getById"]>(res);
		expectBody(json, array(v_Payments));
	});
	test("--payments-- #3", async () => {
		let res = await useTestAPI("Books.getById", {
			RequestObject: [payment.book_id as number],
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
	});
	test("--payments-- #4", async () => {
		const res = await useTestAPI("Payments.complete", {
			RequestObject: [newPaymentId as number],
		});

		const json = await getJson<APIResponse["Payments.complete"]>(res);
		expectBody(json, "Completed payment successfully");
	});
	test("--payments-- #5", async () => {
		const res = await useTestAPI("Payments.delete", {
			RequestObject: [newPaymentId as number],
		});

		const json = await getJson<APIResponse["Payments.delete"]>(res);
		expectBody(json, "Deleted payment successfully");
	});
	test("--payments-- #6 restores the stock the payment consumed", async () => {
		// Payments.post increments books.sold and Payments.delete does NOT undo
		// it, so without this the suite would drain the book one run at a time.
		const before = withLocalDb((db) => db.query("SELECT sold FROM books WHERE id = ?").get(BOOK_ID) as { sold: number } | null);
		expect(before).not.toBeNull();

		resetBookStock();

		const after = withLocalDb((db) => db.query("SELECT sold FROM books WHERE id = ?").get(BOOK_ID) as { sold: number } | null);
		expect(after!.sold).toBe(0);

		// the book itself is still a valid, in-stock book
		const res = await useTestAPI("Books.getById", { RequestObject: [BOOK_ID] });
		const json = await getJson<APIResponse["Books.getById"]>(res);
		expectBody(json, v_Books);
		expect(json.data.quantity - json.data.sold).toBeGreaterThan(0);
	});
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
