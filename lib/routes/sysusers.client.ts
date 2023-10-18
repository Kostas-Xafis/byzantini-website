import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_LoginCredentials, type SysUsers } from "../../types/entities";

const get: EndpointRoute<"GET:/sys", null, Pick<SysUsers, "id" | "email" | "privilege">[]> = {
	authentication: true,
	method: "GET",
	path: "/sys",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getById: EndpointRoute<"POST:/sys/id", number[], SysUsers> = {
	authentication: true,
	method: "POST",
	path: "/sys/id",
	hasUrlParams: false,
	func: async ctx => null as any
};

const getBySid: EndpointRoute<"GET:/sys/sid", null, SysUsers> = {
	authentication: true,
	method: "GET",
	path: "/sys/sid",
	hasUrlParams: false,
	func: async ctx => null as any
};

const del: EndpointRoute<"DELETE:/sys", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/sys",
	hasUrlParams: false,
	func: async ctx => null as any
};

const registerSysUser: EndpointRoute<"POST:/sys/register/[link:string]", typeof v_LoginCredentials, { session_id: string; }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/[link:string]",
	hasUrlParams: true,
	validation: () => v_LoginCredentials,
	func: async ctx => null as any
};

const createRegisterLink: EndpointRoute<"POST:/sys/register", null, { link: string; }> = {
	authentication: true,
	method: "POST",
	path: "/sys/register",
	hasUrlParams: false,
	func: async ctx => null as any
};

const validateRegisterLink: EndpointRoute<"POST:/sys/register/validate/[link:string]", null, { isValid: boolean; }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/validate/[link:string]",
	hasUrlParams: true,
	func: async ctx => null as any
};


export const SysUsersRoutes = {
	get,
	getById,
	getBySid,
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
	"SysUsers.getById": {
		method: "POST",
		path: "/sys/id",
		endpoint: "SysUsers.getById"
	},
	"SysUsers.getBySid": {
		method: "GET",
		path: "/sys/sid",
		endpoint: "SysUsers.getBySid"
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
		validation: v_LoginCredentials
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
		getById: "SysUsers.getById",
		getBySid: "SysUsers.getBySid",
		delete: "SysUsers.delete",
		registerSysUser: "SysUsers.registerSysUser",
		createRegisterLink: "SysUsers.createRegisterLink",
		validateRegisterLink: "SysUsers.validateRegisterLink"
	}
};
