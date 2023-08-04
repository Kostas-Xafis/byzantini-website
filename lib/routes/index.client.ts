import { APIBooks, APIBooksArgs, APIBooksEndpoints, APIBooksResponse } from "./books.client";
import { APIAuthentication, APIAuthenticationArgs, APIAuthenticationEndpoints, APIAuthenticationResponse } from "./authentication.client";
import { APIPayments, APIPaymentsArgs, APIPaymentsEndpoints, APIPaymentsResponse } from "./payments.client";
import { APIPayoffs, APIPayoffsArgs, APIPayoffsEndpoints, APIPayoffsResponse } from "./payoffs.client";
import { APIWholesalers, APIWholesalersArgs, APIWholesalersEndpoints, APIWholesalersResponse } from "./wholesalers.client";
import { APITeachers, APITeachersArgs, APITeachersEndpoints, APITeachersResponse } from "./teachers.client";
import { APILocations, APILocationsArgs, APILocationsEndpoints, APILocationsResponse } from "./locations.client";
import { APIClassType, APIClassTypeArgs, APIClassTypeEndpoints, APIClassTypeResponse } from "./classtype.client";
import { APISysUsers, APISysUsersArgs, APISysUsersEndpoints, APISysUsersResponse } from "./sysusers.client";

export const API = {
	...APIBooks,
	...APIAuthentication,
	...APIPayments,
	...APIPayoffs,
	...APIWholesalers,
	...APITeachers,
	...APILocations,
	...APIClassType,
	...APISysUsers,
};

export const APIEndpoints = {
	...APIBooksEndpoints,
	...APIAuthenticationEndpoints,
	...APIPaymentsEndpoints,
	...APIPayoffsEndpoints,
	...APIWholesalersEndpoints,
	...APITeachersEndpoints,
	...APILocationsEndpoints,
	...APIClassTypeEndpoints,
	...APISysUsersEndpoints,
};
export type APIArgs = APIBooksArgs &
	APIAuthenticationArgs &
	APIPaymentsArgs &
	APIPayoffsArgs &
	APIWholesalersArgs &
	APITeachersArgs &
	APILocationsArgs &
	APIClassTypeArgs &
	APISysUsersArgs;

export type APIRes = APIBooksResponse &
	APIAuthenticationResponse &
	APIPaymentsResponse &
	APIPayoffsResponse &
	APIWholesalersResponse &
	APITeachersResponse &
	APILocationsResponse &
	APIClassTypeResponse &
	APISysUsersResponse;
