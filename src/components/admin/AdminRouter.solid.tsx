import { Route, Router } from "@solidjs/router";
import AdminNav from "./AdminNav.solid.tsx";
import RegistrationsTable from "./RegistrationsTable.solid.tsx";
import BooksTable from "./BooksTable.solid.tsx";
import PaymentsTable from "./PaymentsTable.solid.tsx";
import PayoffsTable from "./PayoffsTable.solid.tsx";
import TeachersTable from "./TeachersTable.solid.tsx";
import TotalsTable from "./TotalsTable.solid.tsx";
import LocationsTable from "./LocationsTable.solid.tsx";
import AnnouncementsTable from "./AnnouncementsTable.solid.tsx";
import SysUsersTable from "./SysUsersTable.solid.tsx";
import AdminPage from "./AdminPage.solid.tsx";

export default function AdminRouter() {
	return (
		<>
			<Router root={AdminPage}>
				<Route path="/admin" component={TotalsTable} />
				<Route path="/admin/registrations" component={RegistrationsTable} />
				<Route path="/admin/books" component={BooksTable} />
				<Route path="/admin/payments" component={PaymentsTable} />
				<Route path="/admin/payoffs" component={PayoffsTable} />
				<Route path="/admin/teachers" component={TeachersTable} />
				<Route path="/admin/locations" component={LocationsTable} />
				<Route path="/admin/announcements" component={AnnouncementsTable} />
				<Route path="/admin/sysusers" component={SysUsersTable} />
			</Router>
		</>
	);
}
