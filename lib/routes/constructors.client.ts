import type { APIBuilder, APIEndpointsBuilder, AnyEndpoint } from "../../types/routes";

export const EndpointsConstructor = <T extends Record<string, AnyEndpoint>, K extends string>(baseRoute: K, routes: T) => {
	const endpoints = {} as { [k: string]: {}; };
	Object.entries(routes).forEach(([key, route]) => {
		endpoints[baseRoute + "." + key] = {
			method: route.method,
			path: route.path,
			endpoint: baseRoute + "." + key,
			validation: ("validation" in route && route.validation()) || undefined
		};
	});
	return endpoints as APIEndpointsBuilder<K, T> & {};
};

export const APIBuilderConstructor = <T extends Record<string, AnyEndpoint>, K extends string>(baseRoute: K, routes: T) => {
	const api = {} as { [k: string]: {}; };
	Object.entries(routes).forEach(([key, route]) => {
		api[key] = baseRoute + "." + key;
	});
	return {
		[baseRoute]: api
	} as APIBuilder<K, T> & {};
};
