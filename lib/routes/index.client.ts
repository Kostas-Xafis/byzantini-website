import { BooksRoutes } from "./books.client";
import { AuthenticationRoutes } from "./authentication.client";
import { PaymentsRoutes } from "./payments.client";
import { PayoffsRoutes } from "./payoffs.client";
import { WholesalersRoutes } from "./wholesalers.client";
import { TeachersRoutes } from "./teachers.client";
import { LocationsRoutes } from "./locations.client";
import { InstrumentsRoutes } from "./instruments.client";
import { SysUsersRoutes } from "./sysusers.client";
import { RegistrationsRoutes } from "./registrations.client";
import { AnnouncementsRoutes } from "./announcements.client";
import { EndpointsConstructor, APIBuilderConstructor } from "./constructors.client";
import { type APIArguments, type APIResponse as APIRes } from "../../types/routes";

export const enum BaseRoutes {
	Books = "Books",
	Authentication = "Authentication",
	Payments = "Payments",
	Payoffs = "Payoffs",
	Wholesalers = "Wholesalers",
	Teachers = "Teachers",
	Locations = "Locations",
	Instruments = "Instruments",
	SysUsers = "SysUsers",
	Registrations = "Registrations",
	Announcements = "Announcements",
}

export const API = {
	...APIBuilderConstructor(BaseRoutes.Books, BooksRoutes),
	...APIBuilderConstructor(BaseRoutes.Authentication, AuthenticationRoutes),
	...APIBuilderConstructor(BaseRoutes.Payments, PaymentsRoutes),
	...APIBuilderConstructor(BaseRoutes.Payoffs, PayoffsRoutes),
	...APIBuilderConstructor(BaseRoutes.Wholesalers, WholesalersRoutes),
	...APIBuilderConstructor(BaseRoutes.Teachers, TeachersRoutes),
	...APIBuilderConstructor(BaseRoutes.Locations, LocationsRoutes),
	...APIBuilderConstructor(BaseRoutes.Instruments, InstrumentsRoutes),
	...APIBuilderConstructor(BaseRoutes.SysUsers, SysUsersRoutes),
	...APIBuilderConstructor(BaseRoutes.Registrations, RegistrationsRoutes),
	...APIBuilderConstructor(BaseRoutes.Announcements, AnnouncementsRoutes),
};

export const APIEndpoints = {
	...EndpointsConstructor(BaseRoutes.Books, BooksRoutes),
	...EndpointsConstructor(BaseRoutes.Authentication, AuthenticationRoutes),
	...EndpointsConstructor(BaseRoutes.Payments, PaymentsRoutes),
	...EndpointsConstructor(BaseRoutes.Payoffs, PayoffsRoutes),
	...EndpointsConstructor(BaseRoutes.Wholesalers, WholesalersRoutes),
	...EndpointsConstructor(BaseRoutes.Teachers, TeachersRoutes),
	...EndpointsConstructor(BaseRoutes.Locations, LocationsRoutes),
	...EndpointsConstructor(BaseRoutes.Instruments, InstrumentsRoutes),
	...EndpointsConstructor(BaseRoutes.SysUsers, SysUsersRoutes),
	...EndpointsConstructor(BaseRoutes.Registrations, RegistrationsRoutes),
	...EndpointsConstructor(BaseRoutes.Announcements, AnnouncementsRoutes),
};

export type APIEndpointNames = keyof (typeof APIEndpoints); // Union of all the keys in APIEndpoints

export interface APIArgs extends
	APIArguments<BaseRoutes.Books, typeof BooksRoutes>,
	APIArguments<BaseRoutes.Authentication, typeof AuthenticationRoutes>,
	APIArguments<BaseRoutes.Payments, typeof PaymentsRoutes>,
	APIArguments<BaseRoutes.Payoffs, typeof PayoffsRoutes>,
	APIArguments<BaseRoutes.Wholesalers, typeof WholesalersRoutes>,
	APIArguments<BaseRoutes.Teachers, typeof TeachersRoutes>,
	APIArguments<BaseRoutes.Locations, typeof LocationsRoutes>,
	APIArguments<BaseRoutes.Instruments, typeof InstrumentsRoutes>,
	APIArguments<BaseRoutes.SysUsers, typeof SysUsersRoutes>,
	APIArguments<BaseRoutes.Registrations, typeof RegistrationsRoutes>,
	APIArguments<BaseRoutes.Announcements, typeof AnnouncementsRoutes> { }

export interface APIResponse extends
	APIRes<BaseRoutes.Books, typeof BooksRoutes>,
	APIRes<BaseRoutes.Authentication, typeof AuthenticationRoutes>,
	APIRes<BaseRoutes.Payments, typeof PaymentsRoutes>,
	APIRes<BaseRoutes.Payoffs, typeof PayoffsRoutes>,
	APIRes<BaseRoutes.Wholesalers, typeof WholesalersRoutes>,
	APIRes<BaseRoutes.Teachers, typeof TeachersRoutes>,
	APIRes<BaseRoutes.Locations, typeof LocationsRoutes>,
	APIRes<BaseRoutes.Instruments, typeof InstrumentsRoutes>,
	APIRes<BaseRoutes.SysUsers, typeof SysUsersRoutes>,
	APIRes<BaseRoutes.Registrations, typeof RegistrationsRoutes>,
	APIRes<BaseRoutes.Announcements, typeof AnnouncementsRoutes> { }

// import { BooksRoutes } from "./books.client";
// import { AuthenticationRoutes } from "./authentication.client";
// import { PaymentsRoutes } from "./payments.client";
// import { PayoffsRoutes } from "./payoffs.client";
// import { WholesalersRoutes } from "./wholesalers.client";
// import { TeachersRoutes } from "./teachers.client";
// import { LocationsRoutes } from "./locations.client";
// import { InstrumentsRoutes } from "./instruments.client";
// import { SysUsersRoutes } from "./sysusers.client";
// import { RegistrationsRoutes } from "./registrations.client";
// import { AnnouncementsRoutes } from "./announcements.client";
// import { EndpointsConstructor, APIBuilderConstructor } from "./constructors.client";
// import { type APIArguments, type APIResponse as APIRes } from "../../types/routes";
// import type { ObjectValuesToUnion } from "../../types/helpers";

// export const enum BaseRoutes {
// 	Books = "Books",
// 	Authentication = "Authentication",
// 	Payments = "Payments",
// 	Payoffs = "Payoffs",
// 	Wholesalers = "Wholesalers",
// 	Teachers = "Teachers",
// 	Locations = "Locations",
// 	Instruments = "Instruments",
// 	SysUsers = "SysUsers",
// 	Registrations = "Registrations",
// 	Announcements = "Announcements",
// }

// export const API = {
// 	...APIBuilderConstructor(BaseRoutes.Books, BooksRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Authentication, AuthenticationRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Payments, PaymentsRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Payoffs, PayoffsRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Wholesalers, WholesalersRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Teachers, TeachersRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Locations, LocationsRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Instruments, InstrumentsRoutes),
// 	...APIBuilderConstructor(BaseRoutes.SysUsers, SysUsersRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Registrations, RegistrationsRoutes),
// 	...APIBuilderConstructor(BaseRoutes.Announcements, AnnouncementsRoutes),
// };

// export const APIEndpoints = {
// 	...EndpointsConstructor(BaseRoutes.Books, BooksRoutes),
// 	...EndpointsConstructor(BaseRoutes.Authentication, AuthenticationRoutes),
// 	...EndpointsConstructor(BaseRoutes.Payments, PaymentsRoutes),
// 	...EndpointsConstructor(BaseRoutes.Payoffs, PayoffsRoutes),
// 	...EndpointsConstructor(BaseRoutes.Wholesalers, WholesalersRoutes),
// 	...EndpointsConstructor(BaseRoutes.Teachers, TeachersRoutes),
// 	...EndpointsConstructor(BaseRoutes.Locations, LocationsRoutes),
// 	...EndpointsConstructor(BaseRoutes.Instruments, InstrumentsRoutes),
// 	...EndpointsConstructor(BaseRoutes.SysUsers, SysUsersRoutes),
// 	...EndpointsConstructor(BaseRoutes.Registrations, RegistrationsRoutes),
// 	...EndpointsConstructor(BaseRoutes.Announcements, AnnouncementsRoutes),
// };

// export type APIEndpointNames = {
// 	[BaseRoutes.Books]: ObjectValuesToUnion<(typeof API[BaseRoutes.Books])>;
// 	[BaseRoutes.Authentication]: ObjectValuesToUnion<(typeof API[BaseRoutes.Authentication])>;
// 	[BaseRoutes.Payments]: ObjectValuesToUnion<(typeof API[BaseRoutes.Payments])>;
// 	[BaseRoutes.Payoffs]: ObjectValuesToUnion<(typeof API[BaseRoutes.Payoffs])>;
// 	[BaseRoutes.Wholesalers]: ObjectValuesToUnion<(typeof API[BaseRoutes.Wholesalers])>;
// 	[BaseRoutes.Teachers]: ObjectValuesToUnion<(typeof API[BaseRoutes.Teachers])>;
// 	[BaseRoutes.Locations]: ObjectValuesToUnion<(typeof API[BaseRoutes.Locations])>;
// 	[BaseRoutes.Instruments]: ObjectValuesToUnion<(typeof API[BaseRoutes.Instruments])>;
// 	[BaseRoutes.SysUsers]: ObjectValuesToUnion<(typeof API[BaseRoutes.SysUsers])>;
// 	[BaseRoutes.Registrations]: ObjectValuesToUnion<(typeof API[BaseRoutes.Registrations])>;
// 	[BaseRoutes.Announcements]: ObjectValuesToUnion<(typeof API[BaseRoutes.Announcements])>;
// } & {}; // Union of all the keys in APIEndpoints

// export interface APIArgs {
// 	[BaseRoutes.Books]: APIArguments<BaseRoutes.Books, typeof BooksRoutes>,
// 	[BaseRoutes.Authentication]: APIArguments<BaseRoutes.Authentication, typeof AuthenticationRoutes>,
// 	[BaseRoutes.Payments]: APIArguments<BaseRoutes.Payments, typeof PaymentsRoutes>,
// 	[BaseRoutes.Payoffs]: APIArguments<BaseRoutes.Payoffs, typeof PayoffsRoutes>,
// 	[BaseRoutes.Wholesalers]: APIArguments<BaseRoutes.Wholesalers, typeof WholesalersRoutes>,
// 	[BaseRoutes.Teachers]: APIArguments<BaseRoutes.Teachers, typeof TeachersRoutes>,
// 	[BaseRoutes.Locations]: APIArguments<BaseRoutes.Locations, typeof LocationsRoutes>,
// 	[BaseRoutes.Instruments]: APIArguments<BaseRoutes.Instruments, typeof InstrumentsRoutes>,
// 	[BaseRoutes.SysUsers]: APIArguments<BaseRoutes.SysUsers, typeof SysUsersRoutes>,
// 	[BaseRoutes.Registrations]: APIArguments<BaseRoutes.Registrations, typeof RegistrationsRoutes>,
// 	[BaseRoutes.Announcements]: APIArguments<BaseRoutes.Announcements, typeof AnnouncementsRoutes>;
// }

// export type APIArgs2<K extends BaseRoutes, T extends APIEndpointNames[K]> = APIArgs[K];

// export interface APIResponse extends
// 	APIRes<BaseRoutes.Books, typeof BooksRoutes>,
// 	APIRes<BaseRoutes.Authentication, typeof AuthenticationRoutes>,
// 	APIRes<BaseRoutes.Payments, typeof PaymentsRoutes>,
// 	APIRes<BaseRoutes.Payoffs, typeof PayoffsRoutes>,
// 	APIRes<BaseRoutes.Wholesalers, typeof WholesalersRoutes>,
// 	APIRes<BaseRoutes.Teachers, typeof TeachersRoutes>,
// 	APIRes<BaseRoutes.Locations, typeof LocationsRoutes>,
// 	APIRes<BaseRoutes.Instruments, typeof InstrumentsRoutes>,
// 	APIRes<BaseRoutes.SysUsers, typeof SysUsersRoutes>,
// 	APIRes<BaseRoutes.Registrations, typeof RegistrationsRoutes>,
// 	APIRes<BaseRoutes.Announcements, typeof AnnouncementsRoutes> { }
