import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import type { SysUser } from "../../types/entities";
import { z } from "zod";

const z_LoginCredentials = z.object({
	email: z.string().email(),
	password: z.string()
});

const authenticateSession: EndpointRoute<"POST:/auth/session", null, { isValid: boolean }> = {
	authentication: true,
	method: "POST",
	path: "/auth/session",
	hasUrlParams: false,
	func: async req => null as any
};

const userLogin: EndpointRoute<"POST:/auth/login", typeof z_LoginCredentials, { isValid: boolean; session_id?: string }> = {
	authentication: false,
	method: "POST",
	path: "/auth/login",
	hasUrlParams: false,
	validation: () => z_LoginCredentials,
	func: async req => null as any
};
const registerSysUser: EndpointRoute<"POST:/sys/register/[link:string]", typeof z_LoginCredentials, Pick<SysUser, "session_id">> = {
	authentication: true,
	method: "POST",
	path: "/sys/register/[link:string]",
	hasUrlParams: true,
	validation: () => z_LoginCredentials,
	func: async req => null as any
};
const createRegisterLink: EndpointRoute<"POST:/sys/register", null, string> = {
	authentication: true,
	method: "POST",
	path: "/sys/register",
	hasUrlParams: false,
	func: async req => null as any
};

export const routes = {
	authenticateSession,
	userLogin,
	registerSysUser,
	createRegisterLink
};

export type APIAuthenticationArgs = APIArguments<"Authentication", typeof routes>;

export type APIAuthenticationResponse = APIResponse<"Authentication", typeof routes>;

export const APIAuthenticationEndpoints: APIEndpointsBuilder<"Authentication", typeof routes> = {
	"Authentication.authenticateSession": {
		method: "POST",
		path: "/auth/session",
		endpoint: "Authentication.authenticateSession"
	},
	"Authentication.userLogin": {
		method: "POST",
		path: "/auth/login",
		endpoint: "Authentication.userLogin",
		validation: z_LoginCredentials
	},
	"Authentication.createRegisterLink": {
		method: "POST",
		path: "/sys/register",
		endpoint: "Authentication.createRegisterLink"
	},
	"Authentication.registerSysUser": {
		method: "POST",
		path: "/sys/register/[link:string]",
		endpoint: "Authentication.registerSysUser",
		validation: z_LoginCredentials
	}
};

export const APIAuthentication: APIBuilder<"Authentication", typeof routes> = {
	Authentication: {
		authenticateSession: "Authentication.authenticateSession",
		createRegisterLink: "Authentication.createRegisterLink",
		registerSysUser: "Authentication.registerSysUser",
		userLogin: "Authentication.userLogin"
	}
};
