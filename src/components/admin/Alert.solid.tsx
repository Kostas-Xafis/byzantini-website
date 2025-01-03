import { batch, createSignal, onCleanup } from "solid-js";
import { AnimTimeline, ExecutionQueue } from "../../../lib/utils.client";
import { Random as R } from "../../../lib/random";

//TODO: Refactor all this code to be included in a single class

export type Alert = {
	id: string;
	message: string;
	type: "error" | "success" | "warning" | "info";
	status: "push" | "remove" | "update";
	onDidUpdate?: Function;
	expires?: number;
};

export class AlertClass {
	private static alerts = createSignal<Alert[]>([], { equals: false });

	private alert: Alert = {} as Alert;
	private id = R.hex(5);

	constructor(
		type: Alert["type"],
		message: (Record<any, any> | string | number)[],
		{ expires, onDidUpdate }: { expires?: number; onDidUpdate?: Function } = {}
	) {
		let msg = "";
		message.forEach((m) => {
			if (typeof m === "object") {
				msg += JSON.stringify(m);
			} else {
				msg += m;
			}
		});
		const alert: Alert = {
			id: this.id,
			message: msg,
			type: type,
			status: "push",
			expires: expires || -1,
			onDidUpdate: onDidUpdate,
		};
		AlertClass.alerts[1]((prevAlerts) => [...prevAlerts, alert]);
	}

	setStatus(status: Alert["status"]) {
		AlertClass.alerts[1]((prevAlerts) => {
			prevAlerts.forEach((a) => {
				if (a.id === this.id) {
					a.status = status;
				}
			});
			return prevAlerts;
		});
	}

	static removeAlert(alert: AlertClass) {
		AlertClass.alerts[1]((prevAlerts) => {
			prevAlerts.forEach((a) => {
				if (a.id === alert.id) a.status = "remove";
			});
			return prevAlerts;
		});
	}

	static updateAlert(alert: AlertClass, message: string) {
		AlertClass.alerts[1]((prevAlerts) => {
			prevAlerts.forEach((a) => {
				if (a.id === alert.id) {
					a.message = message;
					a.status = "update";
				}
			});
			return prevAlerts;
		});
	}
}

export function createAlert(
	type: Alert["type"],
	...message: (Record<any, any> | string | number)[]
): Alert {
	let msg = "";
	message.forEach((m) => {
		if (typeof m === "object") {
			msg += JSON.stringify(m);
		} else {
			msg += m;
		}
	});
	return {
		type,
		message: msg,
		id: R.hex(5),
		status: "push",
	};
}

/**
 * Pushes an alert to the alert stack
 * @example pushAlert(createAlert("success", "This is a success message"));
 * pushAlert(createAlert("error", "This is an error message"));
 */
export function pushAlert(alert: Alert) {
	window.dispatchEvent(new CustomEvent("push_alert", { detail: alert }));
	return alert;
}

export function updateAlert(alert: Alert) {
	window.dispatchEvent(new CustomEvent("update_alert", { detail: alert }));
}

export default function AlertStack() {
	const [alerts, setAlerts] = createSignal<Alert[]>([], { equals: false });
	const [arrayOperation, setArrayOperation] = createSignal<Alert["status"]>("push", {
		equals: false,
	});
	const executionQueue = new ExecutionQueue<Alert>(600, (alert) => {
		if (alert.status !== "update" && executionQueue.getInterval() === 10) {
			executionQueue.setInterval(600);
		}
		switch (alert.status) {
			case "push":
				batch(() => {
					alert.expires = Date.now() + 5000;
					setAlerts((prevAlerts) => [...prevAlerts, alert]);
					setArrayOperation("push");
				});
				break;
			case "remove":
				const alertEl = document.querySelector(
					`[data-alert-id="${alert.id}"]`
				) as HTMLElement | null;
				if (!alertEl) return;
				const atl = new AnimTimeline();
				atl.step(() => {
					alertEl.classList.remove("fadeInRightAnim", "slideInBottomAnim", "duration-50");
				})
					.step(() => {
						alertEl.classList.add("fadeOutLeftAnim");
					})
					.step({
						time: 500,
						anim: () => {
							batch(() => {
								setAlerts((prevAlerts) => {
									return prevAlerts.filter((pAlert) => pAlert.id !== alert.id);
								});
								setArrayOperation("remove");
							});
						},
					})
					.start();
				break;
			case "update":
				const alertIdx = alerts().findIndex((a) => a.id === alert.id);
				if (alertIdx === -1) return;
				batch(() => {
					setAlerts((prevAlerts) => {
						prevAlerts[alertIdx].message = alert.message;
						prevAlerts[alertIdx].status = "update";
						if (alert.type === "info" || alert.type === "success") {
							prevAlerts[alertIdx].expires = Date.now() + 10000;
						}
						return prevAlerts;
					});
					setArrayOperation("update");
				});
				alert.onDidUpdate?.();
				executionQueue.setInterval(10); // Instant update
				break;
			default:
				break;
		}
	});
	const handlePushAlert = (e: CustomEvent<Alert>) => {
		executionQueue.push(e.detail);
	};

	const handleRemoveAlert = (alert: Alert) => {
		alert.status = "remove";
		executionQueue.push(alert);
	};
	const handleUpdateAlert = (e: CustomEvent<Alert>) => {
		e.detail.status = "update";
		executionQueue.push(e.detail);
	};

	window.addEventListener("push_alert", handlePushAlert);
	window.addEventListener("update_alert", handleUpdateAlert);
	const removeAlertsIntervalId = setInterval(() => {
		const d = Date.now();
		alerts().forEach((alert) => {
			if (
				alert.status !== "remove" &&
				(alert.type === "info" || alert.type === "success") &&
				alert.expires &&
				alert.expires < d
			) {
				handleRemoveAlert(alert);
			}
		});
	}, 500);
	onCleanup(() => {
		window.removeEventListener("push_alert", handlePushAlert);
		window.removeEventListener("update_alert", handleUpdateAlert);
		clearInterval(removeAlertsIntervalId);
	});

	return (
		<div class="fixed bottom-8 right-8 flex flex-col gap-y-2 z-[9999] transition-[height]">
			{alerts().map((alert, idx) => {
				return (
					<div
						class={
							"flex flex-row gap-x-2 justify-between items-center shadow-md shadow-gray-400 px-3 py-2 rounded-md text-white break-words" +
							(alert.type === "error" ? " bg-red-900" : "") +
							(alert.type === "warning" ? " bg-[#df8920]" : "") +
							(alert.type === "success" ? " bg-[#0da51f]" : "") +
							(alert.type === "info" ? " bg-[#0661e0]" : "") +
							((arrayOperation() === "push" &&
								(idx === alerts().length - 1
									? " fadeInRightAnim"
									: " slideInBottomAnim duration-50")) ||
								"")
						}
						data-alert-id={alert.id}>
						<p class="text-lg max-w-[35ch] min-w-0 text-white">{alert.message}</p>
						{alert.type === "error" || alert.type === "warning" ? (
							<button
								class="p-2 bg-transparent shadow-sm shadow-gray-300 rounded-lg hover:bg-gray-300 transition-all hover:shadow-none duration-200 ease-in-out text-white hover:text-gray-900"
								onClick={() => handleRemoveAlert(alert)}>
								Dismiss
							</button>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
