import type { EndpointRoute, DefaultEndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { z_SysUsers, type SysUsers } from "../../types/entities";
import { z } from "zod";

const z_LoginCredentials = z.object({
	email: z.string().email(),
	password: z.string()
});


const get: EndpointRoute<"GET:/sys", null, Pick<SysUsers, "id" | "email" | "privilege">[]> = {
	authentication: true,
	method: "GET",
	path: "/sys",
	hasUrlParams: false,
	func: async req => null as any
};

const getBySid: EndpointRoute<"GET:/sys/sid", null, SysUsers> = {
	authentication: true,
	method: "GET",
	path: "/sys/sid",
	hasUrlParams: false,
	func: async req => null as any
};

const postReq = z_SysUsers.omit({ id: true, session_id: true, session_exp_date: true });
const post: EndpointRoute<"POST:/sys", typeof postReq, { session_id: string }> = {
	authentication: true,
	method: "POST",
	path: "/sys",
	hasUrlParams: false,
	validation: () => postReq,
	func: async req => null as any
};

const del: DefaultEndpointRoute<"DELETE:/sys", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/sys",
	hasUrlParams: false,
	func: async req => null as any
};

const registerSysUser: EndpointRoute<"POST:/sys/register/[link:string]", typeof z_LoginCredentials, { session_id: string }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/[link:string]",
	hasUrlParams: true,
	validation: () => z_LoginCredentials,
	func: async req => null as any
};

const createRegisterLink: EndpointRoute<"POST:/sys/register", null, { link: string }> = {
	authentication: true,
	method: "POST",
	path: "/sys/register",
	hasUrlParams: false,
	func: async req => null as any
};

const validateRegisterLink: EndpointRoute<"POST:/sys/register/validate/[link:string]", null, { isValid: boolean }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/validate/[link:string]",
	hasUrlParams: true,
	func: async req => null as any
}


export const SysUsersRoutes = {
	get,
	getBySid,
	post,
	delete: del,
	registerSysUser,
	createRegisterLink,
	validateRegisterLink
};

export type APISysUsersArgs = APIArguments<"SysUsers", typeof SysUsersRoutes>;

export type APISysUsersResponse = APIResponse<"SysUsers", typeof SysUsersRoutes>;

export const APISysUsersEndpoints: APIEndpointsBuilder<"SysUsers", typeof SysUsersRoutes> = {
	"SysUsers.get": {
		method: "GET",
		path: "/sys",
		endpoint: "SysUsers.get"
	},
	"SysUsers.getBySid": {
		method: "GET",
		path: "/sys/sid",
		endpoint: "SysUsers.getBySid"
	},
	"SysUsers.post": {
		method: "POST",
		path: "/sys",
		endpoint: "SysUsers.post",
		validation: postReq
	},
	"SysUsers.delete": {
		method: "DELETE",
		path: "/sys",
		endpoint: "SysUsers.delete"
	},
	"SysUsers.registerSysUser": {
		method: "POST",
		path: "/sys/register/[link:string]",
		endpoint: "SysUsers.registerSysUser",
		validation: z_LoginCredentials
	},
	"SysUsers.createRegisterLink": {
		method: "POST",
		path: "/sys/register",
		endpoint: "SysUsers.createRegisterLink"
	},
	"SysUsers.validateRegisterLink": {
		method: "POST",
		path: "/sys/register/validate/[link:string]",
		endpoint: "SysUsers.validateRegisterLink"
	}
};

export const APISysUsers: APIBuilder<"SysUsers", typeof SysUsersRoutes> = {
	SysUsers: {
		get: "SysUsers.get",
		getBySid: "SysUsers.getBySid",
		post: "SysUsers.post",
		delete: "SysUsers.delete",
		registerSysUser: "SysUsers.registerSysUser",
		createRegisterLink: "SysUsers.createRegisterLink",
		validateRegisterLink: "SysUsers.validateRegisterLink"
	}
};
