import { type APIArguments, type APIResponse as APIRes } from "@_types/routes";
import { AnnouncementsRoutes } from "./announcements.client";
import { AuthenticationRoutes } from "./authentication.client";
import { BooksRoutes } from "./books.client";
import { APIBuilderConstructor, EndpointsConstructor } from "./constructors.client";
import { InstrumentsRoutes } from "./instruments.client";
import { LocationsRoutes } from "./locations.client";
import { PaymentsRoutes } from "./payments.client";
import { PayoffsRoutes } from "./payoffs.client";
import { RegistrationsRoutes } from "./registrations.client";
import { SchemaRoutes } from "./schema.client";
import { SettingsBackupRoutes } from "./settingsBackup.client";
import { SysUsersRoutes } from "./sysusers.client";
import { TeachersRoutes } from "./teachers.client";
import { WholesalersRoutes } from "./wholesalers.client";

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
	Schema = "Schema",
	SettingsBackup = "SettingsBackup",
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
	...APIBuilderConstructor(BaseRoutes.Schema, SchemaRoutes),
	...APIBuilderConstructor(BaseRoutes.SettingsBackup, SettingsBackupRoutes),
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
	...EndpointsConstructor(BaseRoutes.Schema, SchemaRoutes),
	...EndpointsConstructor(BaseRoutes.SettingsBackup, SettingsBackupRoutes),
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
	APIArguments<BaseRoutes.Announcements, typeof AnnouncementsRoutes>,
	APIArguments<BaseRoutes.Schema, typeof SchemaRoutes>,
	APIArguments<BaseRoutes.SettingsBackup, typeof SettingsBackupRoutes> { }

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
	APIRes<BaseRoutes.Announcements, typeof AnnouncementsRoutes>,
	APIRes<BaseRoutes.Schema, typeof SchemaRoutes>,
	APIRes<BaseRoutes.SettingsBackup, typeof SettingsBackupRoutes> { }
