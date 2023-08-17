import type { EndpointRoute, APIBuilder, APIArguments, APIResponse, APIEndpointsBuilder } from "../../types/routes";
import { v_LoginCredentials } from "../../types/entities";

const authenticateSession: EndpointRoute<"POST:/auth/session", null, { isValid: boolean }> = {
	authentication: true,
	method: "POST",
	path: "/auth/session",
	hasUrlParams: false,
	func: async req => null as any
};

const userLogin: EndpointRoute<"POST:/auth/login", typeof v_LoginCredentials, { isValid: boolean; session_id?: string }> = {
	authentication: false,
	method: "POST",
	path: "/auth/login",
	hasUrlParams: false,
	validation: () => v_LoginCredentials,
	func: async req => null as any
};

export const AuthenticationRoutes = {
	authenticateSession,
	userLogin,
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
	}
};

export const APIAuthentication: APIBuilder<"Authentication", typeof AuthenticationRoutes> = {
	Authentication: {
		authenticateSession: "Authentication.authenticateSession",
		userLogin: "Authentication.userLogin"
	}
};
