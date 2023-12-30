import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_LoginCredentials } from "../../types/entities";

const authenticateSession: EndpointRoute<"/auth/session", null, { isValid: boolean; }> = {
	authentication: true,
	method: "POST",
	path: "/auth/session",
	hasUrlParams: false,
	func: async ctx => null as any
};

type UserLoginRes = {
	isValid: true;
	session_id: string;
} | {
	isValid: false;
};


const userLogin: EndpointRoute<"/auth/login", typeof v_LoginCredentials, UserLoginRes> = {
	authentication: false,
	method: "POST",
	path: "/auth/login",
	hasUrlParams: false,
	validation: () => v_LoginCredentials,
	func: async ctx => null as any
};


const userLogout: EndpointRoute<"/auth/logout", { sid: string; }, string> = {
	authentication: true,
	method: "POST",
	path: "/auth/logout",
	hasUrlParams: false,
	func: async ctx => null as any
};

export const AuthenticationRoutes = {
	authenticateSession,
	userLogin,
	userLogout,
};

export type APIAuthenticationArgs = APIArguments<"Authentication", typeof AuthenticationRoutes>;

export type APIAuthenticationResponse = APIResponse<"Authentication", typeof AuthenticationRoutes>;

export const APIAuthenticationEndpoints: APIEndpointsBuilder<"Authentication", typeof AuthenticationRoutes> = {
	"Authentication.authenticateSession": {
		method: "POST",
		path: "/auth/session",
		endpoint: "Authentication.authenticateSession"
	},
	"Authentication.userLogin": {
		method: "POST",
		path: "/auth/login",
		endpoint: "Authentication.userLogin",
		validation: v_LoginCredentials
	},
	"Authentication.userLogout": {
		method: "POST",
		path: "/auth/logout",
		endpoint: "Authentication.userLogout"
	}
};

export const APIAuthentication: APIBuilder<"Authentication", typeof AuthenticationRoutes> = {
	Authentication: {
		authenticateSession: "Authentication.authenticateSession",
		userLogin: "Authentication.userLogin",
		userLogout: "Authentication.userLogout"
	}
};
