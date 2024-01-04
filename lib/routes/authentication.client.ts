import type { EndpointRoute, APIArguments, APIResponse } from "../../types/routes";
import { v_LoginCredentials } from "../../types/entities";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";

const authenticateSession: EndpointRoute<"/auth/session", null, { isValid: boolean; }> = {
	authentication: true,
	method: "POST",
	path: "/auth/session",
	hasUrlParams: false,
};

type UserLoginRes =
	| {
		isValid: true;
		session_id: string;
	}
	| {
		isValid: false;
	};

const userLogin: EndpointRoute<"/auth/login", typeof v_LoginCredentials, UserLoginRes> = {
	authentication: false,
	method: "POST",
	path: "/auth/login",
	hasUrlParams: false,
	validation: () => v_LoginCredentials,
};

const userLogout: EndpointRoute<"/auth/logout", { sid: string; }, string> = {
	authentication: true,
	method: "POST",
	path: "/auth/logout",
	hasUrlParams: false,
};

export const AuthenticationRoutes = {
	authenticateSession,
	userLogin,
	userLogout,
};

export type APIAuthenticationArgs = APIArguments<"Authentication", typeof AuthenticationRoutes>;

export type APIAuthenticationResponse = APIResponse<"Authentication", typeof AuthenticationRoutes>;

export const APIAuthenticationEndpoints = EndpointsConstructor(
	"Authentication",
	AuthenticationRoutes
);

export const APIAuthentication = APIBuilderConstructor("Authentication", AuthenticationRoutes);
