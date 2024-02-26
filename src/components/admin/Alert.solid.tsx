import { onCleanup, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { BatchedExecution, randomHex, sleep } from "../../../lib/utils.client";

export type Alert = {
	message: string;
	type: "error" | "success" | "warning" | "info";
};

type UniqueAlert = Alert & { id: string };

export default function AlertStack() {
	const batchedAlertRemove = new BatchedExecution<UniqueAlert>(500);
	const batchedAlertAdd = new BatchedExecution<UniqueAlert>(500);
	const [alerts, setAlerts] = createStore<UniqueAlert[]>([]);
	// If the array operation is not push, we dont want to animate the last element
	const [arrayOperation, setArrayOperation] = createSignal<"push" | "remove" | "">("", {
		equals: false,
	});

	// Add a live update for functionality later!!! probably with a window event listener

	batchedAlertRemove.execute((alerts) => {
		alerts.forEach((alert) => {
			const alertEl = document.querySelector(
				`[data-alert-id="${alert.id}"]`
			) as HTMLElement | null;
			if (!alertEl) return;
			alertEl.classList.remove("fadeInRightAnim", "slideInBottomAnim");
			void alertEl.offsetWidth;
			alertEl.classList.add("fadeOutLeftAnim");
		});
		setTimeout(() => {
			setAlerts((prevAlerts) => {
				return prevAlerts.filter(
					(pAlert) => alerts.findIndex((alert) => pAlert.id === alert.id) === -1
				);
			});
			setArrayOperation("remove");
		}, 500);
	});
	batchedAlertAdd.execute(async (new_alerts) => {
		for (let alert of new_alerts) {
			setAlerts([...alerts, alert]);
			await sleep(100);
		}
		for (let alert of new_alerts) {
			if (alert.type === "info" || alert.type === "success") {
				setTimeout(() => removeAlert(alert), 3000 + 1000 * alerts.length);
			}
		}
		setArrayOperation("push");
	});

	const handleAlert = (e: CustomEvent<Alert>) => {
		batchedAlertAdd.add({ ...e.detail, id: randomHex(5) } as UniqueAlert);
	};

	const removeAlert = (alert: UniqueAlert) => {
		batchedAlertRemove.add(alert);
	};

	window.addEventListener("push_alert", handleAlert);
	onCleanup(() => {
		window.removeEventListener("push_alert", handleAlert);
	});

	return (
		<div class="fixed bottom-8 right-8 flex flex-col gap-y-2 z-[9999] transition-[height]">
			{alerts.map((alert, idx) => {
				return (
					<div
						class={
							"flex flex-row gap-x-2 justify-between items-center shadow-md shadow-gray-400 px-3 py-2 rounded-md text-white" +
							(alert.type === "error" ? " bg-red-900" : "") +
							(alert.type === "warning" ? " bg-[#df8920]" : "") +
							(alert.type === "success" ? " bg-[#0da51f]" : "") +
							(alert.type === "info" ? " bg-[#0661e0]" : "") +
							((arrayOperation() === "push" &&
								(idx === alerts.length - 1
									? " fadeInRightAnim"
									: " slideInBottomAnim duration-50")) ||
								"")
						}
						data-alert-id={alert.id}>
						<p class="text-lg max-w-[25ch] min-w-0 text-white">{alert.message}</p>
						{alert.type === "error" || alert.type === "warning" ? (
							<button class="bg-slate-500 p-2" onClick={() => removeAlert(alert)}>
								Dismiss
							</button>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
