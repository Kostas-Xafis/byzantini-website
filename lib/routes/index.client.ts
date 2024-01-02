import { APIBooks, type APIBooksArgs, APIBooksEndpoints, type APIBooksResponse } from "./books.client";
import { APIAuthentication, type APIAuthenticationArgs, APIAuthenticationEndpoints, type APIAuthenticationResponse } from "./authentication.client";
import { APIPayments, type APIPaymentsArgs, APIPaymentsEndpoints, type APIPaymentsResponse } from "./payments.client";
import { APIPayoffs, type APIPayoffsArgs, APIPayoffsEndpoints, type APIPayoffsResponse } from "./payoffs.client";
import { APIWholesalers, type APIWholesalersArgs, APIWholesalersEndpoints, type APIWholesalersResponse } from "./wholesalers.client";
import { APITeachers, type APITeachersArgs, APITeachersEndpoints, type APITeachersResponse } from "./teachers.client";
import { APILocations, type APILocationsArgs, APILocationsEndpoints, type APILocationsResponse } from "./locations.client";
import { APIInstruments, type APIInstrumentsArgs, APIInstrumentsEndpoints, type APIInstrumentsResponse } from "./instruments.client";
import { APISysUsers, type APISysUsersArgs, APISysUsersEndpoints, type APISysUsersResponse } from "./sysusers.client";
import { APIRegistrations, type APIRegistrationsArgs, APIRegistrationsEndpoints, type APIRegistrationsResponse } from "./registrations.client";
import { APIAnnouncements, type APIAnnouncementsArgs, APIAnnouncementsEndpoints, type APIAnnouncementsResponse } from "./announcements.client";

export const API = {
	...APIBooks,
	...APIAuthentication,
	...APIPayments,
	...APIPayoffs,
	...APIWholesalers,
	...APITeachers,
	...APILocations,
	...APIInstruments,
	...APISysUsers,
	...APIRegistrations,
	...APIAnnouncements,
};

export const APIEndpoints = {
	...APIBooksEndpoints,
	...APIAuthenticationEndpoints,
	...APIPaymentsEndpoints,
	...APIPayoffsEndpoints,
	...APIWholesalersEndpoints,
	...APITeachersEndpoints,
	...APILocationsEndpoints,
	...APIInstrumentsEndpoints,
	...APISysUsersEndpoints,
	...APIRegistrationsEndpoints,
	...APIAnnouncementsEndpoints,
};

export type APIEndpointNames = typeof APIEndpoints;

export interface APIArgs extends APIBooksArgs,
	APIAuthenticationArgs,
	APIPaymentsArgs,
	APIPayoffsArgs,
	APIWholesalersArgs,
	APITeachersArgs,
	APILocationsArgs,
	APIInstrumentsArgs,
	APISysUsersArgs,
	APIRegistrationsArgs,
	APIAnnouncementsArgs { }

export interface APIResponse extends APIBooksResponse,
	APIAuthenticationResponse,
	APIPaymentsResponse,
	APIPayoffsResponse,
	APIWholesalersResponse,
	APITeachersResponse,
	APILocationsResponse,
	APIInstrumentsResponse,
	APISysUsersResponse,
	APIRegistrationsResponse,
	APIAnnouncementsResponse { }
