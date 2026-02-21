import { v_LoginCredentials } from "@_types/entities";
import type { EndpointRoute, } from "@_types/routes";

const authenticateSession: EndpointRoute<"/auth/session", any, { isValid: boolean; }> = {
	authentication: true,
	method: "POST",
	path: "/auth/session",
	hasUrlParams: false,
	validation: undefined,
};

type UserLoginRes =
	| {
		isValid: true;
		session_id: string;
		email: string;
		avatar_url: string | null;
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
	validation: undefined,
};

const getGoogleOAuthState: EndpointRoute<"/auth/google", any, { OAuthUrl: string; }> = {
	authentication: false,
	method: "GET",
	path: "/auth/google",
	hasUrlParams: false,
	validation: undefined,
};

const getGoogleOAuthStateForSignup: EndpointRoute<"/auth/google/signup/[link:string]", any, { OAuthUrl: string; }> = {
	authentication: false,
	method: "GET",
	path: "/auth/google/signup/[link:string]",
	hasUrlParams: true,
	validation: undefined,
};

type OAuthCallbackRes =
	| {
		isValid: true;
		session_id: string;
		email: string;
		avatar_url: string | null;
	}
	| {
		isValid: false;
		error: string;
	};

const oauthCallback: EndpointRoute<"/auth/google/callback", any, OAuthCallbackRes> = {
	authentication: false,
	method: "GET",
	path: "/auth/google/callback",
	hasUrlParams: false,
	validation: undefined,
};


export const AuthenticationRoutes = {
	authenticateSession,
	userLogin,
	userLogout,
	getGoogleOAuthState,
	getGoogleOAuthStateForSignup,
	oauthCallback,
};
