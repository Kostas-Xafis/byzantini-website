import type { AnyEndpoint, AnyObjectSchema, HTTPMethods } from "../../types/routes";
import { AuthenticationServerRoutes, authentication } from "./authentication.server";
import { BooksServerRoutes } from "./books.server";
import { PaymentsServerRoutes } from "./payments.server";
import { PayoffsServerRoutes } from "./payoffs.server";
import { WholesalersServerRoutes } from "./wholesalers.server";
import { TeachersServerRoutes } from "./teachers.server";
import { LocationsServerRoutes } from "./locations.server";
import { ClassTypeServerRoutes } from "./instruments.server";
import { SysUsersServerRoutes } from "./sysusers.server";
import { RegistrationsServerRoutes } from "./registrations.server";
import { AnnouncementsServerRoutes } from "./announcement.server";

import { requestValidation } from "../middleware/requestValidation";
import type { RemovePartial } from "../../types/helpers";

const routes = (function () {
	const allRoutes = (function (...routesArr: any[]) {
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
		RegistrationsServerRoutes,
		AnnouncementsServerRoutes,
	).flat() as (RemovePartial<AnyEndpoint, "func">)[];
	allRoutes.forEach(route => {
		route.middleware = [];
		if (route.authentication) route.middleware?.push(async (ctx) => {
			let isAuthenticated = await authentication(ctx);
			if (!isAuthenticated) return new Response("Unauthorized", { status: 401 });
		});
		if ("validation" in route && route.validation) {
			route.middleware?.push(requestValidation(route.validation as (() => AnyObjectSchema)));
		}
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
