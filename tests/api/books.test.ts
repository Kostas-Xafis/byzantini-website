import { v_Books } from "@_types/entities";
import { Random as R } from "@lib/random";
import { type APIResponse } from "@lib/routes/index.client";
import { chain, test } from "tests/TestChain";
import { array, number, object } from "valibot";
import { expectBody, getJson, useTestAPI } from "../testHelpers";

function booksTest() {
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

	chain("--books--",
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
			const updatedBook = {
				id: newBookId as number,
				quantity: book.quantity + 10
			};
			const res = await useTestAPI("Books.updateQuantity", {
				RequestObject: updatedBook,
			});

			const json = await getJson<APIResponse["Books.updateQuantity"]>(res);
			expectBody(json, "Quantity updated successfully");
		},
		async () => {
			const res = await useTestAPI("Books.delete", {
				RequestObject: [newBookId as number]
			});

			const json = await getJson<APIResponse["Books.delete"]>(res);
			expectBody(json, "Book deleted successfully");
		}
	);
}

booksTest();

test("--books--", async () => {
	const res = await useTestAPI("Books.get");

	const json = await getJson<APIResponse["Books.get"]>(res);
	expectBody(json, array(v_Books));
});
