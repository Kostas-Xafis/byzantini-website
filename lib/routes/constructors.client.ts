import type { APIBuilder, APIEndpointsBuilder, AnyEndpoint } from "@_types/routes";

export const EndpointsConstructor = <K extends string, T extends Record<string, AnyEndpoint>>(baseRoute: K, routes: T, raw: boolean = false) => {
	const endpoints = {} as { [k: string]: any; };
	Object.entries(routes).forEach(([key, route]) => {
		const fullKey = baseRoute + "." + key;
		endpoints[fullKey] = {
			method: route.method,
			path: route.path,
			endpoint: fullKey,
			hasUrlParams: route.hasUrlParams,
			multipart: ("multipart" in route && route.multipart) || false,
			validation: ("validation" in route && route.validation && route.validation()) || undefined
		};
		if (raw) {
			endpoints[fullKey].func = route.func;
		}
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
