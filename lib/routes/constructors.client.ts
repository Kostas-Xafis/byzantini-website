import type { APIBuilder, APIEndpointsBuilder, AnyEndpoint } from "../../types/routes";

export const EndpointsConstructor = <K extends string, T extends Record<string, AnyEndpoint>>(baseRoute: K, routes: T) => {
	const endpoints = {} as { [k: string]: {}; };
	Object.entries(routes).forEach(([key, route]) => {
		endpoints[baseRoute + "." + key] = {
			method: route.method,
			path: route.path,
			endpoint: baseRoute + "." + key,
			hasUrlParams: route.hasUrlParams,
			multipart: ("multipart" in route && route.multipart) || false,
			validation: ("validation" in route && route.validation && route.validation()) || undefined
		};
	});
	return endpoints as APIEndpointsBuilder<K, T> & {};
};

export const APIBuilderConstructor = <K extends string, T extends Record<string, AnyEndpoint>>(baseRoute: K, routes: T) => {
	const api = {} as { [k: string]: {}; };
	Object.keys(routes).forEach((key) => {
		api[key] = baseRoute + "." + key;
	});
	return {
		[baseRoute]: api
	} as APIBuilder<K, T> & {};
};
