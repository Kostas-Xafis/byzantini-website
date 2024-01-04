import { v_LoginCredentials, type SysUsers } from "../../types/entities";
import type { APIArguments, APIResponse, EndpointRoute } from "../../types/routes";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";

const get: EndpointRoute<"/sys", null, Pick<SysUsers, "id" | "email" | "privilege">[]> = {
	authentication: true,
	method: "GET",
	path: "/sys",
	hasUrlParams: false,
};

const getById: EndpointRoute<"/sys/id", number[], SysUsers> = {
	authentication: true,
	method: "POST",
	path: "/sys/id",
	hasUrlParams: false,
};

const getBySid: EndpointRoute<"/sys/sid", null, SysUsers> = {
	authentication: true,
	method: "GET",
	path: "/sys/sid",
	hasUrlParams: false,
};

const del: EndpointRoute<"/sys", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/sys",
	hasUrlParams: false,
};

const registerSysUser: EndpointRoute<"/sys/register/[link:string]", typeof v_LoginCredentials, { session_id: string; }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/[link:string]",
	hasUrlParams: true,
	validation: () => v_LoginCredentials,
};

const createRegisterLink: EndpointRoute<"/sys/register", null, { link: string; }> = {
	authentication: true,
	method: "POST",
	path: "/sys/register",
	hasUrlParams: false,
};

const validateRegisterLink: EndpointRoute<"/sys/register/validate/[link:string]", null, { isValid: boolean; }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/validate/[link:string]",
	hasUrlParams: true,
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

export const APISysUsersEndpoints = EndpointsConstructor("SysUsers", SysUsersRoutes);

export const APISysUsers = APIBuilderConstructor("SysUsers", SysUsersRoutes);
