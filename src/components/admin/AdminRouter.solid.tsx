import type { Permission } from "@lib/auth/roles";
import { Route, Router } from "@solidjs/router";
import { Show, type Component } from "solid-js";
import { useCurrentUser } from "./currentUser";
import AccountPage from "./AccountPage.solid.tsx";
import ActivityPage from "./ActivityPage.solid.tsx";
import AdminPage from "./AdminPage.solid.tsx";
import AnnouncementsTable from "./AnnouncementsTable.solid.tsx";
import BooksTable from "./BooksTable.solid.tsx";
import LocationsTable from "./LocationsTable.solid.tsx";
import PaymentsTable from "./PaymentsTable.solid.tsx";
import PayoffsTable from "./PayoffsTable.solid.tsx";
import PupilsPage from "./PupilsPage.solid.tsx";
import QueryLogsTable from "./QueryLogsTable.solid.tsx";
import RegistrationsTable from "./RegistrationsTable.solid.tsx";
import SettingsPage from "./SettingsPage.solid";
import SysUsersTable from "./SysUsersTable.solid.tsx";
import TeachersTable from "./TeachersTable.solid.tsx";
import TotalsTable from "./TotalsTable.solid.tsx";

/**
 * A page only some roles may open (lib/auth/roles.ts). The nav already hides its link and the API refuses
 * its data; this covers a typed or bookmarked URL with a clear message instead of an error toast.
 */
const restricted = (permission: Permission, Page: Component) => () => {
	const user = useCurrentUser();
	return (
		<Show when={user()}>
			<Show
				when={user()!.permissions[permission]}
				fallback={
					<div class="grid h-full place-items-center p-8 text-center text-ink">
						<div class="grid gap-2">
							<i class="fa-solid fa-lock text-3xl text-accent-ink" aria-hidden="true"></i>
							<p class="text-lg font-bold">Δεν έχετε πρόσβαση σε αυτή τη σελίδα.</p>
						</div>
					</div>
				}>
				<Page />
			</Show>
		</Show>
	);
};

export default function AdminRouter() {
	return (
		<>
			<Router root={AdminPage}>
				<Route path="/admin" component={TotalsTable} />
				<Route path="/admin/registrations" component={RegistrationsTable} />
				<Route path="/admin/pupils" component={PupilsPage} />
				<Route path="/admin/books" component={BooksTable} />
				<Route path="/admin/payments" component={PaymentsTable} />
				<Route path="/admin/payoffs" component={PayoffsTable} />
				<Route path="/admin/teachers" component={TeachersTable} />
				<Route path="/admin/locations" component={LocationsTable} />
				<Route path="/admin/announcements" component={AnnouncementsTable} />
				<Route path="/admin/account" component={AccountPage} />
				<Route path="/admin/sysusers" component={SysUsersTable} />
				<Route path="/admin/activity" component={restricted("activityLog", ActivityPage)} />
				<Route path="/admin/query-logs" component={restricted("queryLogs", QueryLogsTable)} />
				<Route path="/admin/settings" component={SettingsPage} />
				<Route
					path="/admin/*"
					component={() => {
						if (window.location.pathname === "/admin/logout") {
							window.location.pathname = "/404";
						}
						return <></>;
					}}
				/>
			</Router>
		</>
	);
}
