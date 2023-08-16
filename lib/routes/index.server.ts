import type { AnyZodObject } from "zod";
import type { EndpointRoute, HTTPMethods } from "../../types/routes";
import { AuthenticationServerRoutes } from "./authentication.server";
import { BooksServerRoutes } from "./books.server";
import { PaymentsServerRoutes } from "./payments.server";
import { PayoffsServerRoutes } from "./payoffs.server";
import { WholesalersServerRoutes } from "./wholesalers.server";
import { TeachersServerRoutes } from "./teachers.server";
import { LocationsServerRoutes } from "./locations.server";
import { authentication } from "../middleware/authentication";
import { requestValidation } from "../middleware/requestValidation";
import { ClassTypeServerRoutes } from "./instruments.server";
import { SysUsersServerRoutes } from "./sysusers.server";
import { RegistrationsRoutes } from "./registrations.client";
import { RegistrationsServerRoutes } from "./registrations.server";

const routes = (function () {
	const allRoutes = (function (...routesArr) {
		return routesArr.map(routes => Object.values(routes));
	})(
		BooksServerRoutes,
		PaymentsServerRoutes,
		PayoffsServerRoutes,
		WholesalersServerRoutes,
		AuthenticationServerRoutes,
		TeachersServerRoutes,
		LocationsServerRoutes,
		ClassTypeServerRoutes,
		SysUsersServerRoutes,
		RegistrationsServerRoutes
	).flat() as (EndpointRoute<any, AnyZodObject, any> | EndpointRoute<any, any, any>)[];

	allRoutes.forEach(route => {
		route.middleware = [];
		if (route.authentication) route.middleware?.push(authentication);
		if ("validation" in route) route.middleware?.push(requestValidation(route.validation));
	});

	return {
		GET: allRoutes.filter(route => route.method === "GET"),
		POST: allRoutes.filter(route => route.method === "POST"),
		PUT: allRoutes.filter(route => route.method === "PUT"),
		DELETE: allRoutes.filter(route => route.method === "DELETE")
	};
})();

export const matchRoute = (urlSlug: string[], method: HTTPMethods) => {
	routeLoop: for (const route of routes[method]) {
		const routePath = route.path.split("/").slice(1) as string[];
		if (routePath.length !== urlSlug.length) continue;
		for (let i = 0; i < routePath.length; i++) {
			if (routePath[i] === urlSlug[i]) continue;
			else if (
				routePath[i].startsWith("[") &&
				((routePath[i].includes("number") && !isNaN(Number(urlSlug[i]))) || routePath[i].includes("string"))
			)
				continue;
			else continue routeLoop;
		}
		return route;
	}
	return null;
};
