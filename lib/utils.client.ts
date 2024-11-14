import type { StringTypeToType } from "../types/helpers";
import { Random as R } from "./random";

export function convertToUrlFromArgs(url: string, args: any): string {
	let newUrl = url.slice();
	url.split("/")
		.filter(part => part.startsWith("["))
		.forEach(part => {
			const [name, _] = part.slice(1, -1).split(":");
			newUrl = newUrl.replace(part, args[name]);
		});
	return newUrl;
};
export function isSafeURLPath(url: string): boolean {
	return url.match(/^[\p{L}\w '$_.,+!*()-]+$/gu)?.at(0) === url;
}

// Cookie functions from w3schools
export function setCookie(cname: string, cvalue: string | number | boolean = "", exdays = 0, path = "/") {
	const d = new Date();
	d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
	let expires = "expires=" + d.toUTCString();
	document.cookie = cname + "=" + cvalue + ";" + expires + ";path=" + path;
}
export function deleteCookie(cname: string, path = "/") {
	document.cookie = cname + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=" + path;
}
export function getCookie(cname: string): string {
	let name = cname + "=";
	let ca = document.cookie.split(';');
	for (let i = 0; i < ca.length; i++) {
		let c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return "";
}

export async function onElementMount<T = HTMLElement>(target: string, callback: (el: T) => any) {
	let counter = 0;
	let el;
	while (!(el = document.querySelector(target)) && counter++ < 40) {
		await sleep(40);
	}
	if (counter >= 40) return;
	callback(el as T);
};

export function getParent(el: HTMLElement | null, selector: string, maxHeight = 10): HTMLElement | null {
	if (!el) return null;
	while (!el.matches(selector) && maxHeight-- > 0) {
		el = el.parentElement as HTMLElement;
		if (el === document.body.parentElement) return null;
	}
	if (maxHeight <= 0) return null;
	return el;
}

export function swapElementsWithFade(prev: HTMLElement, curr: HTMLElement, msFadeOut = 300, msFadeIn = 500) {
	prev.classList.add("remove");
	prev.style.setProperty("--msFadeOut", `${msFadeOut}ms`);
	curr.style.setProperty("--msFadeIn", `${msFadeIn}ms`);
	setTimeout(() => {
		prev.classList.add("hidden");
		curr.classList.remove("hidden", "remove");
		curr.classList.add("open");
		setTimeout(() => {
			curr.classList.remove("open");
		}, msFadeIn);
	}, msFadeOut);

};

export function setFocusFixed(e: HTMLElement) {
	e.setAttribute('tabindex', '-1');
	void e.offsetHeight;
	e.focus();
	void e.offsetHeight;
	e.setAttribute('tabindex', "");
}

export const sleep = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

//  String utility functions
export function stringEquals(str1: string, str2: string, caseSensitive = false): boolean {
	return caseSensitive ? str1 === str2 : str1.toLowerCase() === str2.toLowerCase();
}
export function looseStringEquals(str1: string, str2: string): boolean {
	return stringEquals(removeAccents(str1), removeAccents(str2), true);
}
export function looseStringIncludes(str1: string, str2: string): boolean {
	return removeAccents(str1).toLowerCase().includes(removeAccents(str2).toLowerCase());
}
export function removeAccents(str: string): string {
	return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};
export function trimWhitespace(str: string): string {
	return str.replace(/(^\s+|\s+)$/g, "");
}

/**
 * This function maps a value with from [valMin, valMax] to [outMin, outMax]
 */
export function mappedValue(value: number, valMin = 0, valMax = 1, outMin = 0, outMax = 1): number {
	if (valMin === valMax) return outMin;
	if (outMin === outMax) return outMin;
	if (value >= valMax) return outMax;
	if (value <= valMin) return outMin;
	let range = valMax - valMin;
	let outRange = outMax - outMin;

	// Apply a floor and ceiling to the value
	if (value > valMax) {
		value = valMax;
	} else if (value < valMin) {
		value = valMin;
	}
	// First normalization in respect to the input range
	let normalized = (value - valMin) / range;
	// Second normalization in respect to the output range
	return normalized * outRange + outMin;
};

export function getKeyIndex<T extends {}>(key: keyof T, obj: T) {
	let keys = Object.keys(obj);
	return keys.indexOf(key as string);
}

export async function asyncQueue<T>(
	jobs: (() => Promise<T>)[],
	args: {
		maxJobs?: number,
		verbose?: boolean,
		progressCallback?: (prog: number) => any;
		progressOnThrow?: boolean;
	}
): Promise<T[]> {
	let { maxJobs = 1, verbose = false, progressCallback = null, progressOnThrow = false } = args;
	let totalJobs = jobs.length;
	let jobsCompleted = 0;
	let queue: any[];
	let results: T[] = [];

	// If the number of jobs is less than the maxJobs, then we can just execute them all at once
	if (maxJobs < jobs.length) {
		queue = Array.from(jobs.splice(0, maxJobs - 1));
	} else {
		queue = Array.from(jobs);
		maxJobs = jobs.length;
		jobs = []; // empty the jobs array
	}

	if (verbose) {
		console.log(`Starting ${totalJobs} jobs with ${maxJobs} max jobs`);
	}

	while (true) {
		if (jobsCompleted === totalJobs) break;
		while (queue.length === 0 && jobsCompleted !== totalJobs) await sleep(25); // wait for a job to be added to the queue if any are left
		if (jobsCompleted < totalJobs) {
			(async () => {
				let job = queue.shift() as () => Promise<T>; // dequeue the job
				if (!job) return;

				// Execute the job and store the result
				if (progressOnThrow) {
					try {
						results.push(await job());
					} catch (e) {
					} finally {
						jobsCompleted++;
					}
				} else {
					results.push(await job());
					jobsCompleted++;
				}

				// Logging progress
				if (progressCallback) {
					if (progressCallback.constructor.name === "AsyncFunction") {
						await progressCallback(jobsCompleted);
					} else {
						progressCallback(jobsCompleted);
					}
				}
				if (verbose && (jobsCompleted % maxJobs === 0 || jobsCompleted === totalJobs)) {
					console.log(`Completed ${jobsCompleted}/${totalJobs} in queue`);
				}

				while (queue.length === maxJobs) await sleep(25); // respect the maxJobs limit
				if (jobsCompleted !== totalJobs && jobs.length !== 0) {
					let newJob = jobs.shift() as () => Promise<T>;
					queue.push(newJob);
				}
			})();
		}
	}
	while (jobsCompleted < totalJobs) await sleep(100);
	return results;
};

export class UpdateHandler {
	#abortController = new AbortController();
	#initialBackoff = 0;
	#backoff = 0;
	#backoffFactor = 1.5;
	#func: Function | null = null;
	#isTriggered = false;
	#timer: number;

	trigger(ms = 0): Promise<void> {
		this.#isTriggered = true;
		return new Promise((res, rej) => {
			let tId = setTimeout(() => {
				this.#isTriggered = false;
				this.#func?.call(null);
				this.#backoff = this.#initialBackoff;
				res();
			}, (ms || this.#timer) + this.#backoff);
			this.#abortController.signal.onabort = () => {
				clearTimeout(tId);
				this.#abortController = new AbortController();
				rej(0);
			};
		});
	};

	/**
	 * Aborts the timeout if it is not already fired
	 */
	abort() {
		if (this.#isTriggered) this.#abortController.abort();
		this.#isTriggered = false;
	};

	/**
	 * Refires the timeout with the same function and timer or with the new ones
	 * @param ms milliseconds for the new timer
	 * @param func the new function to be called
	 * @param catchAbort if true the promise will resolve even if the timeout is aborted
	 * @returns
	 */
	async reset({ ms = 0, func, catchAbort = false }: { ms?: number, func?: Function, catchAbort?: boolean; } = {}): Promise<void> {
		this.abort();
		func && (this.#func = func);
		this.#backoff *= this.#backoffFactor;
		if (catchAbort) {
			try {
				await this.trigger(ms || this.#timer);
			} catch (e) {
				return;
			}
		};
		return this.trigger(ms || this.#timer);
	}

	constructor({ timer = 0, func = () => { }, backoff = 0 }) {
		this.#timer = timer || 1000;
		this.#func = func;
		this.#initialBackoff = backoff;
		this.#backoff = backoff;
	}

	setFunction(func: Function) {
		this.#func = func;
	}

	getTimer() {
		return this.#timer;
	}
	setTimer(timer: number) {
		this.#timer = timer;
	}

	isTriggered() {
		return this.#isTriggered;
	}
	setTriggered(fired: boolean) {
		this.#isTriggered = fired;
	}

	setBackoff(backoff: number, factor = 1.5) {
		this.#initialBackoff = backoff;
		this.#backoff = backoff;
		this.#backoffFactor = factor;
	}

	static createInstance(timer = 0, func = () => { }, backoff = 0): UpdateHandler {
		return new UpdateHandler({ timer, func, backoff });
	}
}

export class UpdateHandler2 {
	// Private fields
	#abortController = new AbortController();
	#initialBackoff = 0;
	#backoff = 0;
	#backoffFactor = 1.5;
	#func: Function | null = null;
	#isTriggered = false;
	#timer: number;

	constructor({ timer = 1000, func = () => { }, backoff = 0 }) {
		this.#timer = timer;
		this.#func = func;
		this.#initialBackoff = backoff;
		this.#backoff = backoff;
	}

	// Triggers the function after a delay
	trigger(ms = 0): Promise<void> {
		this.#isTriggered = true;
		const delay = ms || this.#timer;

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.#isTriggered = false;
				this.#func?.call(null);
				this.#backoff = this.#initialBackoff;
				resolve();
			}, delay + this.#backoff);

			this.#abortController.signal.onabort = () => {
				clearTimeout(timeoutId);
				this.#abortController = new AbortController();
				reject(0);
			};
		});
	}

	// Aborts the timeout if it is not already fired
	abort() {
		if (this.#isTriggered) {
			this.#abortController.abort();
			this.#isTriggered = false;
		}
	}

	// Resets the timeout and optionally changes the function and timer
	reset({ ms = 0, func, catchAbort = false }: { ms?: number, func?: Function, catchAbort?: boolean; }): Promise<void> {
		this.abort();
		if (func) this.#func = func;
		this.#backoff *= this.#backoffFactor;

		const triggerPromise = this.trigger(ms || this.#timer);
		return catchAbort ? triggerPromise.catch(() => { }) : triggerPromise;
	}

	// Setters and getters
	setFunction(func: Function) {
		this.#func = func;
	}

	getTimer() {
		return this.#timer;
	}

	setTimer(timer: number) {
		this.#timer = timer;
	}

	isTriggered() {
		return this.#isTriggered;
	}

	setTriggered(fired: boolean) {
		this.#isTriggered = fired;
	}

	setBackoff(backoff: number, factor = 1.5) {
		this.#initialBackoff = backoff;
		this.#backoff = backoff;
		this.#backoffFactor = factor;
	}

	// Factory method
	static createInstance(timer = 0, func = () => { }, backoff = 0): UpdateHandler {
		return new UpdateHandler({ timer, func, backoff });
	}
}

export function iOS() {
	let iOSPlatforms = [
		"iOS",
		"iPad Simulator",
		"iPhone Simulator",
		"iPod Simulator",
		"iPad",
		"iPhone",
		"iPod",
	];
	return (
		iOSPlatforms.includes(navigator.platform) ||
		// @ts-ignore
		iOSPlatforms.includes(navigator["userAgentData"]?.platform) ||
		(navigator.userAgent.includes("Mac") && "ontouchend" in document)
	);
}

export const download = (file: Blob, name: string) => {
	let a = document.createElement("a");
	a.href = URL.createObjectURL(file);
	a.download = name;
	a.click();
};

type DateFormatType = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy/mm/dd";
type MultiSelectType = "string" | "number" | "boolean";
type AttributeMatchType = "startsWith" | "endsWith" | "includes";
export class ExtendedFormData<T extends Record<string, any>> extends FormData {
	private form: HTMLFormElement | null = null;

	constructor(formData: HTMLFormElement);
	constructor(formData: FormData | HTMLFormElement) {
		formData instanceof HTMLFormElement ? super(formData) : super();
		if (formData instanceof FormData) {
			formData.forEach((value, key) => {
				this.append(key, value);
			});
		} else this.form = formData;
	}

	get(key: keyof T): FormDataEntryValue | null {
		return super.get(key as string);
	}


	number(key: keyof T): number;
	number(key: keyof T, fallback: number): number;
	number(key: keyof T, fallback?: number): number {
		if (fallback !== undefined) {
			let num = Number(this.get(key as string));
			if (isNaN(num) || num === null || num === 0)
				num = fallback;
			return num;
		}
		return Number(this.get(key as string));
	}

	string(key: keyof T): string;
	string(key: keyof T, fallback: string): string;
	string(key: keyof T, fallback?: string): string {
		if (fallback !== undefined) {
			let str = this.get(key as string);
			if (str === null || str === "")
				str = fallback;
			return str as string;
		}
		return this.get(key as string) as string;
	}

	boolean(key: keyof T): boolean;
	boolean(key: keyof T, fallback: boolean): boolean;
	boolean(key: keyof T, fallback?: boolean): boolean {
		if (fallback !== undefined) {
			let bool = this.get(key as string);
			return bool === null ? fallback : bool === "true";
		}
		return this.get(key as string) === "true";
	}

	date(key: keyof T, format: DateFormatType = "dd/mm/yyyy"): Date {
		let [day, month, year] = (this.get(key as string) as string).split("/");
		if (format === "mm/dd/yyyy") {
			[month, day] = [day, month];
		} else if (format === "yyyy/mm/dd") {
			[year, month] = [month, year];
		}
		return new Date(Number(year), Number(month) - 1, Number(day));
	}

	multiSelect<K extends MultiSelectType, B extends boolean>(key: keyof T, type: K, { single = false as any, isSelected = true }: { single?: B; isSelected?: boolean; } = {}): B extends true ? StringTypeToType<K> : StringTypeToType<K>[] {
		if (!this.form) return [] as any;
		let valArr = [...this.form?.querySelectorAll<HTMLButtonElement>(`button[data-specifier='${key as string}'][data-selected='${isSelected ? "true" : "false"}']`)].map((el) => {
			if (type === "number") return Number(el.dataset.value);
			if (type === "boolean") return el.dataset.value === "1";
			return el.getAttribute("data-value");
		});
		return (single ? valArr[0] : valArr) as any;
	};

	// TODO Remove unnecassary complexity between choosing input or button
	getByName<K extends MultiSelectType, B extends boolean>(key: string, type: K, { cmp = "startsWith", single = false as any, isButton = false }: { cmp?: AttributeMatchType, single?: B; isButton?: boolean; } = {}): B extends true ? StringTypeToType<K> : StringTypeToType<K>[] {
		let inputs;
		if (!this.form || key === "" || !key) return [] as any;
		const equality = cmp === "startsWith" ? "^=" : cmp === "endsWith" ? "$=" : "*=";
		const query = isButton ? `button[data-specifier${equality}'${key}'][data-selected='true']` : `input[name${equality}'${key}']`;
		switch (cmp) {
			case "endsWith":
				inputs = [...this.form.querySelectorAll(query)] as HTMLInputElement[];
				break;
			case "includes":
				inputs = [...this.form.querySelectorAll(query)] as HTMLInputElement[];
				break;
			case "startsWith":
			default:
				inputs = [...this.form.querySelectorAll(query)] as HTMLInputElement[];
		}
		let list;
		if (type === "number") list = inputs.map((el) => Number((isButton ? el.dataset.value : el.value)));
		else if (type === "boolean") list = inputs.map((el) => (isButton ? el.dataset.value : el.value) === "1");
		else list = inputs.map((el) => (isButton ? el.dataset.value : el.value));

		list = list.filter(Boolean);
		return (single ? list[0] : list) as any;
	}
}

export const objToFormData = (obj: Record<string, any>): FormData => {
	let fd = new FormData();
	Object.entries(obj).forEach(([key, value]) => {
		if (value instanceof Object && !(value instanceof Blob)) {
			fd.append(key, "object");
			fd.append(key, JSON.stringify(value));
			return;
		}
		if (typeof value === "number") {
			fd.append(key, "number");
		} else if (typeof value === "boolean") {
			fd.append(key, "boolean");
		} else if (value === null) {
			fd.append(key, "null");
		} else if (value === undefined) {
			fd.append(key, "undefined");
		}
		fd.append(key, value);
	});
	return fd;
};

export async function dynamicImport<T>(src: string, name: string): Promise<T> {
	// @ts-ignore
	if (window[name]) return window[name];
	const module = await import(src);
	// @ts-ignore
	window[name] = module;
	return module;
}

export function loadScript(src: string, res?: () => boolean, force = false): Promise<any> {
	if (!force) {
		if (res && res()) return Promise.resolve(res());
		else if (!res && document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
	}
	return new Promise(async (resolve, reject) => {
		let script = document.createElement("script");
		script.src = src;
		script.onerror = () => reject();
		script.onload = async () => {
			let counter = 0;
			if (res) {
				while (!res() && counter++ < 20) {
					await sleep(200);
					resolve(res());
				}
			}
			resolve(null);
		};
		document.head.appendChild(script);
	});
};

const imageCache = new Map<string, HTMLImageElement>();
export const loadImage = (src: string, keep?: boolean): Promise<void> => {
	if (keep && imageCache.has(src)) {
		return new Promise((resolve) => {
			imageCache.get(src)!.onload = () => resolve();
		});
	}
	return new Promise((resolve, reject) => {
		let img = new Image();
		img.onload = () => resolve();
		img.onerror = () => reject();
		img.src = src;
		keep && imageCache.set(src, img);
	});
};

export const teacherTitleByGender = (title: 0 | 1 | 2, gender: "M" | "F") => {
	if (gender === "M")
		return title === 0 ? "Καθηγητής" : title === 1 ? "Δάσκαλος" : "Επιμελητής";
	else
		return title === 0 ? "Καθηγήτρια" : title === 1 ? "Δασκάλα" : "Επιμελήτρια";
};

export class ExecutionQueue<T> {
	#queue: { executionId: string, task: T; }[] = [];
	#executionNotify: Record<string, () => void> = {};
	isExecuting = false;
	constructor(private interval = 1000, private func: (item: T) => (Promise<any> | any) = () => { }, private isAsync = false) { }
	push(item: T): string {
		const executionId = R.hex(4);
		this.#queue.push({ executionId, task: deepCopy(item) });
		if (this.#queue.length === 1 && !this.isExecuting) this.execute();
		return executionId;
	}
	async execute() {
		this.isExecuting = true;
		while (this.#queue.length) {
			let item = this.#queue.shift();
			if (!item) break;
			const { executionId, task } = item;

			if (this.isAsync || this.func.constructor.name === "AsyncFunction") {
				await this.func(task);
			} else {
				this.func(task);
			}
			if (this.#executionNotify[executionId]) {
				this.#executionNotify[executionId]();
			}
			if (this.interval > 0) {
				await sleep(this.interval);
			}
		}
		this.isExecuting = false;
	}

	setInterval(interval: number) {
		this.interval = interval;
	}

	getInterval() {
		return this.interval;
	}

	async executionEnd(id: string) {
		let end = false;
		this.#executionNotify[id] = () => {
			end = true;
		};
		while (!end) await sleep(25);
		delete this.#executionNotify[id];

		return true;
	}

	getSize() {
		return this.#queue.length;
	}
}

export const GeneratorFunction = async function* (args: any) {
	yield undefined;
}.constructor;

export const Function = function () { }.constructor;

export function isGeneratorFunction(func: any): func is GeneratorFunction {
	return func.constructor === GeneratorFunction;
}

export function isFunction(func: any): func is Function {
	return func.constructor === Function;
}

// Recursive object copy
export const deepCopy = <T>(obj: T): T => {
	if (typeof obj !== "object" || obj === null) return obj;
	if (Array.isArray(obj)) return obj.map(deepCopy) as any;
	return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, deepCopy(v)])) as any;
};


type AnimTimelineStep = { time?: number, anim: () => void; } | (() => void);
export class AnimTimeline {
	steps: AnimTimelineStep[] = [];
	startTime = 0;
	running = false;
	abortController = new AbortController();

	constructor() { }

	step(s: AnimTimelineStep) {
		if (typeof s === "function") {
			this.steps.push(s);
		} else {
			this.steps.push({ time: s.time || 0, anim: s.anim });
		}
		return this;
	}

	async start() {
		if (this.startTime != 0) await sleep(this.startTime);

		this.running = true;
		this.startTime = performance.now();
		for (let i = 0; i < this.steps.length; i++) {
			if (this.abortController.signal.aborted) break;

			const s = this.steps[i];
			if (typeof s === "function") {
				s();
			} else if (s.time && s.time != 0) {
				await sleep(s.time);
				s.anim();
			}
			void document.body.offsetHeight;
		}
		this.running = false;
	}

	abort() {
		this.abortController.abort();
	}
}
