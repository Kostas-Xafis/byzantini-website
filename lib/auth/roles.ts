/**
 * Admin roles and what each may do (client-safe: the server enforces these, the UI uses the same table
 * to hide what the signed-in admin cannot use). Stored in `sys_users.role` (migration 0008).
 *
 * - `sysadmin` — the maintainer: everything, including the query logs and changing roles.
 * - `owner` — the school's owner: the fee catalog and deleting admins.
 * - `secretary` — the secretariat: everything else. Every new account (invite) starts here.
 *
 * Anything not listed under PERMISSIONS is open to every signed-in admin.
 */
export const ROLES = ["sysadmin", "owner", "secretary"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
	/** «Καταγραφή Ερωτημάτων» (QueryLogs.*). */
	queryLogs: ["sysadmin"],
	/** «Κατάλογος διδάκτρων» in the settings (FeeCatalog.*). */
	feeCatalog: ["sysadmin", "owner"],
	/** Deleting admin accounts, own included (SysUsers.delete). */
	deleteAdmins: ["sysadmin", "owner"],
	/** Changing an admin's role (SysUsers.setRole). */
	manageRoles: ["sysadmin"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

export const can = (role: Role | null | undefined, permission: Permission): boolean => !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role);

/** Every permission as a boolean map, for `Authentication.me`. */
export const permissionsOf = (role: Role) =>
	Object.fromEntries((Object.keys(PERMISSIONS) as Permission[]).map((permission) => [permission, can(role, permission)])) as Record<Permission, boolean>;

export const ROLE_LABELS: Record<Role, string> = {
	sysadmin: "Διαχειριστής συστήματος",
	owner: "Ιδιοκτήτης",
	secretary: "Γραμματεία",
};
