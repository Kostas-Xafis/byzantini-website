import { v_LoginCredentials, type SysUsers } from "@_types/entities";
import type { EndpointRoute } from "@_types/routes";

type SysUsersGetById = Pick<SysUsers, "id" | "email" | "privilege">;
const get: EndpointRoute<"/sys", any, SysUsersGetById[]> = {
	authentication: true,
	method: "GET",
	path: "/sys",
	hasUrlParams: false,
	validation: undefined,
};

const getById: EndpointRoute<"/sys/id", number[], SysUsersGetById> = {
	authentication: true,
	method: "POST",
	path: "/sys/id",
	hasUrlParams: false,
	validation: undefined,
};

const getBySid: EndpointRoute<"/sys/sid", any, SysUsersGetById> = {
	authentication: true,
	method: "GET",
	path: "/sys/sid",
	hasUrlParams: false,
	validation: undefined,
};

const del: EndpointRoute<"/sys", number[]> = {
	authentication: true,
	method: "DELETE",
	path: "/sys",
	hasUrlParams: false,
	validation: undefined,
};

const registerSysUser: EndpointRoute<"/sys/register/[link:string]", typeof v_LoginCredentials, { session_id: string; id: number; }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/[link:string]",
	hasUrlParams: true,
	validation: () => v_LoginCredentials,
};

const createRegisterLink: EndpointRoute<"/sys/register", any, { link: string; }> = {
	authentication: true,
	method: "POST",
	path: "/sys/register",
	hasUrlParams: false,
	validation: undefined,
};

const validateRegisterLink: EndpointRoute<"/sys/register/validate/[link:string]", any, { isValid: boolean; }> = {
	authentication: false,
	method: "POST",
	path: "/sys/register/validate/[link:string]",
	hasUrlParams: true,
	validation: undefined,
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
