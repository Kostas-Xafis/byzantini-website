import type { AnyEndpoint, HTTPMethods } from "../../types/routes";
import { AnnouncementsServerRoutes } from "./announcement.server";
import { AuthenticationServerRoutes } from "./authentication.server";
import { BooksServerRoutes } from "./books.server";
import { ClassTypeServerRoutes } from "./instruments.server";
import { LocationsServerRoutes } from "./locations.server";
import { PaymentsServerRoutes } from "./payments.server";
import { PayoffsServerRoutes } from "./payoffs.server";
import { RegistrationsServerRoutes } from "./registrations.server";
import { ReplicationServerRoutes } from "./replication.server";
import { SysUsersServerRoutes } from "./sysusers.server";
import { TeachersServerRoutes } from "./teachers.server";
import { WholesalersServerRoutes } from "./wholesalers.server";

import type { RemovePartial } from "../../types/helpers";
import { requestValidation } from "../middleware/requestValidation";
import { authentication } from "../utils.auth";
import { SchemaServerRoutes } from "./schema.server";
import { unionHas, unionStringToSet } from "../utils.server";

const raw_routes =
	[BooksServerRoutes,
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
		ReplicationServerRoutes,
		SchemaServerRoutes];

function getAllRoutes() {
	const allRoutes = raw_routes.map(routes => Object.values(routes)).flat() as (RemovePartial<AnyEndpoint, "func">)[];

	allRoutes.forEach(route => {
		route.middleware = [];
		if (route.authentication) route.middleware.push(async (req) => {
			let isAuthenticated = await authentication(req);
			if (!isAuthenticated) return new Response("Unauthorized", { status: 401 });
		});
		if (route.validation) {
			route.middleware.push(requestValidation(route.validation));
		}
	});

	return {
		GET: allRoutes.filter(route => route.method === "GET"),
		POST: allRoutes.filter(route => route.method === "POST"),
		PUT: allRoutes.filter(route => route.method === "PUT"),
		DELETE: allRoutes.filter(route => route.method === "DELETE")
	};
};

const routes = getAllRoutes();

export const matchRoute = (urlSlug: string[], method: HTTPMethods) => {
	// Iterate through the routes and find the one that matches the url slug
	routeLoop: for (const route of routes[method]) {
		const routePath = route.path.split("/").slice(1) as string[];

		// If the route and url slug have different lengths, they can't match
		if (routePath.length !== urlSlug.length) continue;

		routeCheckLoop:
		for (let i = 0; i < routePath.length; i++) {
			const routePart = routePath[i];
			if (routePart === urlSlug[i]) continue;

			if (routePart.startsWith("[")) {
				if ((routePart.includes("number") && !isNaN(Number(urlSlug[i]))) || routePart.includes("string")) {
					continue;
				}
				if (routePart.includes("|")) {
					const value = urlSlug[i];
					const unionArr = unionStringToSet(routePart.slice(1, -1).split(":")[1]);
					if (unionHas(unionArr, value)) continue;
				}
			}
			continue routeLoop;
		}
		return route;
	}
	return null;
};
