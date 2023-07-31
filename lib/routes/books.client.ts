import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { z_Books, type Books } from "../../types/entities";

const get: EndpointRoute<"GET:/books", null, Books[]> = {
	authentication: true,
	method: "GET",
	path: "/books",
	hasUrlParams: false,
	func: async req => null as any
};

const getById: EndpointRoute<"GET:/books/[id:number]", null, Books[]> = {
	authentication: true,
	method: "GET",
	path: "/books/[id:number]",
	hasUrlParams: true,
	func: async req => null as any
};

const postReq = z_Books.omit({ id: true });
const post: EndpointRoute<"POST:/books", typeof postReq> = {
	authentication: true,
	method: "POST",
	path: "/books",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

const quantityReq = z_Books.pick({ id: true, quantity: true });
const updateQuantity: EndpointRoute<"PUT:/books/updateQuantity", typeof quantityReq> = {
	authentication: true,
	method: "PUT",
	path: "/books/updateQuantity",
	hasUrlParams: false,
	validation: () => quantityReq,
	func: async req => null as any
};

const del: DefaultEndpointRoute<"DELETE:/books", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/books",
	hasUrlParams: false,
	func: async req => null as any
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
		method: "GET",
		path: "/books/[id:number]",
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
