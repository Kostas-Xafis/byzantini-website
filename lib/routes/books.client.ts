import { omit, pick } from "valibot";
import { v_Books, type Books } from "../../types/entities";
import type { APIArguments, APIResponse, EndpointRoute } from "../../types/routes";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";

const get: EndpointRoute<"/books", null, Books[]> = {
	authentication: true,
	method: "GET",
	path: "/books",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/books/id", number[], Books> = {
	authentication: true,
	method: "POST",
	path: "/books/id",
	hasUrlParams: false,
};

const postReq = omit(v_Books, ["id"]);
const post: EndpointRoute<"/books", typeof postReq, { insertId: number; }> = {
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
};

export const BooksRoutes = {
	get,
	getById,
	post,
	updateQuantity,
	delete: del
};

export type APIBooksArgs = APIArguments<"Books", typeof BooksRoutes>;

export type APIBooksResponse = APIResponse<"Books", typeof BooksRoutes>;

export const APIBooksEndpoints = EndpointsConstructor("Books", BooksRoutes);

export const APIBooks = APIBuilderConstructor("Books", BooksRoutes);
