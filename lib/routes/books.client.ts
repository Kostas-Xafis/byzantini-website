import { omit, pick } from "valibot";
import { v_Books, type Books, type Insert } from "../../types/entities";
import type { EndpointRoute } from "../../types/routes";

const get: EndpointRoute<"/books", any, Books[]> = {
	authentication: true,
	method: "GET",
	path: "/books",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/books/id", number[], Books> = {
	authentication: true,
	method: "POST",
	path: "/books/id",
	hasUrlParams: false,
	validation: undefined,
};

const postReq = omit(v_Books, ["id"]);
const post: EndpointRoute<"/books", typeof postReq, Insert> = {
	authentication: true,
	method: "POST",
	path: "/books",
	hasUrlParams: false,
	validation: () => postReq,
};

const quantityReq = pick(v_Books, ["id", "quantity"]);
const updateQuantity: EndpointRoute<"/books/updateQuantity", typeof quantityReq> = {
	authentication: true,
	method: "PUT",
	path: "/books/updateQuantity",
	hasUrlParams: false,
	validation: () => quantityReq,
};

const del: EndpointRoute<"/books", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/books",
	hasUrlParams: false,
	validation: undefined,
};

export const BooksRoutes = {
	get,
	getById,
	post,
	updateQuantity,
	delete: del
};
