/**
 * Entity types — derived from the zod schemas in `lib/api/schemas.ts`, the
 * single source of entity shapes. They are the schemas' OUTPUT types (after
 * transforms: loose 0/1 booleans become `boolean`, nullable optional strings
 * become `string | undefined`), i.e. what the app reads from the API.
 *
 * Type-only imports keep zod and the schemas out of every client bundle that
 * imports these names.
 */
import type { z } from "astro/zod";
import type {
	z_AnnouncementImages,
	z_Announcements,
	z_Books,
	z_ClassType,
	z_EmailSubscriptions,
	z_Instruments,
	z_JoinedEnrollments,
	z_Locations,
	z_Payments,
	z_Payoffs,
	z_PupilEnrollments,
	z_PupilRegistrationForm,
	z_PupilSearchResult,
	z_Pupils,
	z_QueryLogs,
	z_SysUserIdentity,
	z_SysUserRegisterLink,
	z_SysUserSession,
	z_SysUsers,
	z_TeacherClassesResponse,
	z_TeacherInstruments,
	z_TeacherLocations,
	z_Teachers,
	z_Wholesalers,
} from "@lib/api/schemas";

export type Insert = { insertId: number };

export type Books = z.infer<typeof z_Books>;

export type Payments = z.infer<typeof z_Payments>;

export type Payoffs = z.infer<typeof z_Payoffs>;

export type Wholesalers = z.infer<typeof z_Wholesalers>;

export type SysUsers = z.infer<typeof z_SysUsers>;

export type SysUserRegisterLink = z.infer<typeof z_SysUserRegisterLink>;
export type SysUserSession = z.infer<typeof z_SysUserSession>;
export type SysUserIdentity = z.infer<typeof z_SysUserIdentity>;

export type Teachers = z.infer<typeof z_Teachers>;

export type SimpleTeacher = Omit<Teachers, "picture" | "cv">;

export type TeacherLocations = z.infer<typeof z_TeacherLocations>;

/** The row as read back (`registration_number` NULL → undefined), hence the response schema. */
export type TeacherClasses = z.infer<typeof z_TeacherClassesResponse>;

export type ClassType = z.infer<typeof z_ClassType>;

export type Locations = z.infer<typeof z_Locations>;

export type Instruments = z.infer<typeof z_Instruments>;

export type TeacherInstruments = z.infer<typeof z_TeacherInstruments>;

/** The public registration form's payload (`Pupils.post`) — see `z_PupilRegistrationForm`. */
export type PupilRegistrationForm = z.infer<typeof z_PupilRegistrationForm>;

/**
 * Pupil register (Μαθητολόγιο) — replaces the person half of `registrations`
 * (migration 0002_pupils.sql).
 *
 * `am` is NULL when the pupil has no usable ΑΜ: either a true orphan (no ΑΜ at
 * all, see `orphan_code`) or a row split off a shared ΑΜ (see `split_from_am`).
 * `registration_url` is permanent — the links already emailed to students keep
 * working forever.
 */
export type Pupils = z.infer<typeof z_Pupils>;

/** One year / music type / instrument of a pupil's history. */
export type PupilEnrollments = z.infer<typeof z_PupilEnrollments>;

/**
 * Joined row returned by the enrollment listing routes: the enrollment plus its
 * pupil's identity, in the exact shape the admin table, the Excel/PDF exports
 * and the PDF worker expect (a superset of the old `registrations` row).
 *
 * `am` is a STRING here on purpose: the legacy contract (and every export) wants
 * '706'. Orphans have no ΑΜ, so `orphan_code` ('000-Ο1') stands in for it.
 */
export type JoinedEnrollments = z.infer<typeof z_JoinedEnrollments>;

/** Search result row: enough for the Μαθητολόγιο list without the history. */
export type PupilSearchResult = z.infer<typeof z_PupilSearchResult>;

export type EmailSubscriptions = z.infer<typeof z_EmailSubscriptions>;

export type Announcements = z.infer<typeof z_Announcements>;

//! Later on rename the priority column to id
export type AnnouncementImages = z.infer<typeof z_AnnouncementImages>;

// Dev mode only
export type QueryLogs = z.infer<typeof z_QueryLogs>;
