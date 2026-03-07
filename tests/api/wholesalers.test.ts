import { v_Books, v_Wholesalers } from "@_types/entities";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { chain, test } from "tests/TestChain";
import { array, number, object } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

function wholesalersTest() {
	const wholesaler = {
		name: "Sample Wholesaler",
		address: "123 Main St",
		contact: "John Doe",
		phone: "123-456-7890",
		email: R.email(),
	};
	let newWholesalerId: number | null;
	const bookPrice = R.int(10, 100);
	const booksQuantity = R.int(1, 50);
	const book = {
		title: "Sample Book",
		wholesaler_id: R.int(14, 19),
		wholesale_price: bookPrice,
		price: R.int(bookPrice, 200),
		quantity: booksQuantity,
		sold: R.int(0, booksQuantity)
	};
	let newBookId: number | null;

	chain("--wholesalers--",
		async () => {
			const res = await useTestAPI("Wholesalers.post", {
				RequestObject: wholesaler,
			});

			const json = await getJson<APIResponse["Wholesalers.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newWholesalerId = json.data.insertId;
		},
		async () => {
			const res = await useTestAPI("Wholesalers.getById", {
				RequestObject: [newWholesalerId as number]
			});

			const json = await getJson<APIResponse["Wholesalers.getById"]>(res);
			expectBody(json, v_Wholesalers);
		},
		async () => {
			const res = await useTestAPI("Books.post", {
				RequestObject: book,
			});

			const json = await getJson<APIResponse["Books.post"]>(res);
			expectBody(json, object({ insertId: number() }));

			newBookId = json.data.insertId;
		},
		async () => {
			const res = await useTestAPI("Books.getById", {
				RequestObject: [newBookId as number]
			});

			const json = await getJson<APIResponse["Books.getById"]>(res);
			expectBody(json, v_Books);
		},
		async () => {
			const res = await useTestAPI("Wholesalers.delete", {
				RequestObject: [newWholesalerId as number]
			});

			const json = await getJson<APIResponse["Wholesalers.delete"]>(res);
			expectBody(json, "Deleted wholesalers successfully");
		}
	);
}

wholesalersTest();

test("--wholesalers--", async () => {
	const res = await useTestAPI("Wholesalers.get");

	const json = await getJson<APIResponse["Wholesalers.get"]>(res);
	expectBody(json, array(v_Wholesalers));
});
