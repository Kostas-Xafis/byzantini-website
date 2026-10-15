import type { SysUsers as FullSysUser } from "@_types/entities";
import { createAPIResource, type APIResourceStore } from "@hooks/createAPIResource.solid";
import { useAPIClient } from "@hooks/useAPIClient.solid";
import { useCacheMutations } from "@hooks/useCacheMutations.solid";
import { API, type APIResponse } from "@routes/index.client";
import { SelectedRows } from "@lib/hooks/useSelectedRows.solid";
import { ROLES, ROLE_LABELS, type Role } from "@lib/auth/roles";
import type { ExtendedFormData } from "@utilities/forms";
import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { Props as InputProps } from "../input/Input.solid";
import Spinner from "../other/Spinner.solid";
import { createAlert, pushAlert } from "./Alert.solid";
import Table, { type ColumnType } from "./table/Table.solid";
import { ActionEnum, ActionIcon, type EmptyAction } from "./table/TableControlTypes";
import { type Action } from "./table/TableControls.solid";
import { useCurrentUser } from "./currentUser";
import { Badge, cardClass, hintClass, secondaryButtonClass } from "./Panel.solid";

const PREFIX = "sysusers";

type SysUsers = Pick<FullSysUser, "id" | "email" | "role">;

/** «λήγει σε 5 ώρες» / «λήγει σε 20 λεπτά». */
function expiresIn(expiresAt: number, now = Date.now()) {
	const minutes = Math.max(1, Math.round((expiresAt - now) / 60_000));
	if (minutes < 60) return `λήγει σε ${minutes} ${minutes === 1 ? "λεπτό" : "λεπτά"}`;
	const hours = Math.round(minutes / 60);
	return `λήγει σε ${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;
}

/**
 * «Εκκρεμείς προσκλήσεις»: invites not used yet (open to every admin, like inviting). «Επαναποστολή» emails a
 * new link with another 24 hours (the old link stops working); «Ακύρωση» kills the link at once.
 */
function PendingInvites(props: { invites: APIResponse["SysUsers.getInvites"]; onChange: () => void }) {
	const apiHook = useAPIClient();
	const [busy, setBusy] = createSignal<string | null>(null);
	const run = async (email: string, action: () => Promise<boolean>) => {
		setBusy(email);
		try {
			if (await action()) props.onChange();
		} catch (error) {
			pushAlert(createAlert("error", error instanceof Error ? error.message : "Σφάλμα"));
		} finally {
			setBusy(null);
		}
	};
	const resend = (email: string) =>
		run(email, async () => {
			const res = await apiHook(API.SysUsers.resendInvite, { RequestObject: { email } });
			if (!("data" in res)) return false;
			pushAlert(createAlert("success", `Η πρόσκληση στάλθηκε ξανά στο ${email}`));
			return true;
		});
	const revoke = (email: string) =>
		run(email, async () => {
			if (!window.confirm(`Ακύρωση της πρόσκλησης του ${email}; Ο σύνδεσμος που έλαβε θα πάψει να ισχύει.`)) return false;
			await apiHook(API.SysUsers.revokeInvite, { RequestObject: { email } });
			pushAlert(createAlert("success", "Η πρόσκληση ακυρώθηκε"));
			return true;
		});

	return (
		<section class={`${cardClass} w-[90%] max-sm:w-[92.5%] mb-2 p-4 grid gap-3 font-didact`} aria-labelledby="pending-invites-title">
			<div class="flex items-center gap-2">
				<i class="fa-solid fa-envelope-open-text text-brand dark:text-red-200" aria-hidden="true"></i>
				<h2 id="pending-invites-title" class="font-anaktoria text-2xl leading-tight">
					Εκκρεμείς προσκλήσεις
				</h2>
				<Badge>{props.invites.length}</Badge>
			</div>
			<ul class="grid gap-2 max-h-[30vh] overflow-y-auto">
				<For each={props.invites}>
					{(invite) => (
						<li class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface-muted px-3 py-2">
							<div class="grid min-w-0 flex-[1_1_14rem]">
								<span class="truncate font-bold">{invite.email}</span>
								<span class={`${hintClass} [overflow-wrap:anywhere]`}>
									{expiresIn(invite.expires_at)}
									<Show when={invite.invited_by}> · από {invite.invited_by}</Show>
								</span>
							</div>
							<div class="flex gap-2">
								<button type="button" class={secondaryButtonClass} disabled={busy() !== null} onClick={() => resend(invite.email)}>
									<i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
									Επαναποστολή
								</button>
								<button type="button" class={secondaryButtonClass} disabled={busy() !== null} onClick={() => revoke(invite.email)}>
									<i class="fa-solid fa-xmark" aria-hidden="true"></i>
									Ακύρωση
								</button>
							</div>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}

const sysusersToTable = (sysusers: SysUsers[]): SysUsers[] => {
	return sysusers.map((u) => [u.id, u.email, ROLE_LABELS[u.role] ?? u.role] as unknown as SysUsers);
};

export default function SysUsersTable() {
	const selectedItems = new SelectedRows().useSelectedRows();
	const [store, setStore] = createStore<APIResourceStore>({});
	const apiHook = useAPIClient(setStore);
	const setSysUserHydrate = useCacheMutations({
		setStore,
		mutations: [
			{
				srcEndpoint: API.SysUsers.getById,
				destEndpoint: API.SysUsers.get,
			},
		],
	});
	createAPIResource(API.SysUsers.get, undefined, { cache: setStore });
	createAPIResource(API.SysUsers.getBySid, undefined, { cache: setStore });
	const [invites, { refetch: refetchInvites }] = createAPIResource(API.SysUsers.getInvites);
	// Who may delete admins or change roles (lib/auth/roles.ts); the routes enforce the same.
	const me = useCurrentUser();

	const columnNames: ColumnType<SysUsers> = {
		id: { type: "number", name: "Id", size: 4 },
		email: { type: "string", name: "Email", size: 30 },
		role: { type: "string", name: "Ρόλος", size: 16 },
	};

	const shapedData = createMemo(() => {
		const sysusers = store[API.SysUsers.get];
		return Array.isArray(sysusers) ? sysusersToTable(sysusers as SysUsers[]) : [];
	});

	const onAdd = createMemo((): Action | EmptyAction => {
		const submit = async function (formData: ExtendedFormData<{ invite_email: string }>) {
			const inviteEmail = formData.string("invite_email").trim();
			if (!inviteEmail) throw new Error("Συμπληρώστε έγκυρο email");

			const res = await apiHook(API.SysUsers.createRegisterLink, {
				RequestObject: { email: inviteEmail },
			});
			if (!("data" in res ? res.data : res.message)) return;
			pushAlert(createAlert("success", "Το email πρόσκλησης στάλθηκε επιτυχώς!"));
			void refetchInvites();
		};
		return {
			inputs: {
				email: {
					name: "invite_email",
					label: "Email νέου διαχειριστή",
					type: "email",
					iconClasses: "fa-solid fa-envelope",
					required: true,
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Αποστολή",
			headerText: "Αποστολή πρόσκλησης εγγραφής",
			type: ActionEnum.ADD,
			icon: ActionIcon.ADD_USER,
		};
	});

	const onDelete = createMemo((): Action | EmptyAction => {
		const deleteModal = {
			type: ActionEnum.DELETE,
			icon: ActionIcon.DELETE_USER,
		};
		const sysusers = store[API.SysUsers.get];
		const self = store[API.SysUsers.getBySid];
		if (!sysusers || selectedItems.length < 1 || !self) return deleteModal;

		if (!me()?.permissions.deleteAdmins) return deleteModal;
		// Only a sysadmin deletes a sysadmin (the route also keeps at least one).
		const selected = sysusers.filter((user) => selectedItems.includes(user.id));
		if (self.role !== "sysadmin" && selected.some((user) => user.role === "sysadmin")) return deleteModal;

		const submit = async function () {
			const ids = selectedItems.map((i) => (sysusers.find((p) => p.id === i) as SysUsers).id);
			const res = await apiHook(API.SysUsers.delete, { RequestObject: ids });
			if (!("data" in res ? res.data : res.message)) return;
			setSysUserHydrate({ action: ActionEnum.DELETE, ids });
			if (ids.length === 1) {
				pushAlert(createAlert("success", "Ο διαχειριστής διαγράφηκε επιτυχώς!"));
			} else {
				pushAlert(createAlert("success", "Οι διαχειριστές διαγράφηκαν επιτυχώς!"));
			}
		};
		return {
			inputs: {},
			onSubmit: submit,
			submitText: "Διαγραφή",
			headerText: "Διαγραφή Διαχειριστή/ών",
			...deleteModal,
		};
	});
	const onRole = createMemo((): Action | EmptyAction => {
		const roleModal = {
			type: ActionEnum.MODIFY,
			icon: ActionIcon.MODIFY,
		};
		const sysusers = store[API.SysUsers.get];
		const self = store[API.SysUsers.getBySid];
		if (!sysusers || !self || selectedItems.length !== 1 || selectedItems[0] === self.id) return roleModal;
		const user = sysusers.find((u) => u.id === selectedItems[0]);
		if (!user) return roleModal;

		const submit = async function (formData: ExtendedFormData<{ role: Role }>) {
			const role = formData.string("role") as Role;
			const res = await apiHook(API.SysUsers.setRole, { RequestObject: { id: user.id, role } });
			if (!("data" in res)) return;
			setSysUserHydrate({ action: ActionEnum.MODIFY, id: user.id, isMultiple: false });
			pushAlert(createAlert("success", `${user.email}: ${ROLE_LABELS[role]}`));
		};
		return {
			inputs: {
				role: {
					name: "role",
					label: "Ρόλος",
					type: "select",
					iconClasses: "fa-solid fa-user-shield",
					selectList: ROLES.map((role) => ROLE_LABELS[role]),
					valueList: [...ROLES],
					value: user.role,
					required: true,
				} as InputProps,
			},
			onSubmit: submit,
			submitText: "Αποθήκευση",
			headerText: `Ρόλος του ${user.email}`,
			...roleModal,
		};
	});

	return (
		<Show
			when={store[API.SysUsers.get] !== undefined && store[API.SysUsers.getBySid] !== undefined && me() !== undefined}
			fallback={<Spinner classes="max-sm:h-[100svh]" />}>
			<Table
				prefix={PREFIX}
				data={shapedData}
				columns={columnNames}
				structure={[
					{
						position: "top",
						prefix: PREFIX,
						// Invites are open to every admin (always as Γραμματεία); deleting and changing roles are not.
						controlGroups: [
							{
								controls: [onAdd, ...(me()!.permissions.manageRoles ? [onRole] : []), ...(me()!.permissions.deleteAdmins ? [onDelete] : [])],
							},
						],
					},
					// Only while there are invites to manage: the bottom row then takes room from the table.
					...(invites.error || !invites()?.length
						? []
						: [
								{
									position: "bottom" as const,
									prefix: PREFIX,
									controlGroups: [
										{ type: "custom" as const, children: <PendingInvites invites={invites()!} onChange={() => void refetchInvites()} /> },
									],
								},
							]),
				]}
			/>
		</Show>
	);
}
