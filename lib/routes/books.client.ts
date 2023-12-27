import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_Books, type Books } from "../../types/entities";
import { omit, pick } from "valibot";

const get: EndpointRoute<"/books", null, Books[]> = {
	authentication: true,
	method: "GET",
	path: "/books",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"/books/id", number[], Books> = {
	authentication: true,
	method: "POST",
	path: "/books/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const postReq = omit(v_Books, ["id"]);
const post: EndpointRoute<"/books", typeof postReq, { insertId: number; }> = {
	authentication: true,
	method: "POST",
	path: "/books",
	hasUrlParams: false,
	validation: () => postReq,
	func: async ctx => null as any
};

const quantityReq = pick(v_Books, ["id", "quantity"]);
const updateQuantity: EndpointRoute<"/books/updateQuantity", typeof quantityReq> = {
	authentication: true,
	method: "PUT",
	path: "/books/updateQuantity",
	hasUrlParams: false,
	validation: () => quantityReq,
	func: async ctx => null as any
};

const del: EndpointRoute<"/books", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/books",
	hasUrlParams: false,
	func: async ctx => null as any
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

export const APIBooksEndpoints: APIEndpointsBuilder<"Books", typeof BooksRoutes> = {
	"Books.get": {
		method: "GET",
		path: "/books",
		endpoint: "Books.get"
	},
	"Books.getById": {
		method: "POST",
		path: "/books/id",
		endpoint: "Books.getById"
	},
	"Books.post": {
		method: "POST",
		path: "/books",
		endpoint: "Books.post",
		validation: postReq
	},
	"Books.updateQuantity": {
		method: "PUT",
		path: "/books/updateQuantity",
		endpoint: "Books.updateQuantity",
		validation: quantityReq
	},
	"Books.delete": {
		method: "DELETE",
		path: "/books",
		endpoint: "Books.delete"
	}
};

export const APIBooks: APIBuilder<"Books", typeof BooksRoutes> = {
	Books: {
		get: "Books.get",
		getById: "Books.getById",
		post: "Books.post",
		updateQuantity: "Books.updateQuantity",
		delete: "Books.delete"
	}
};
