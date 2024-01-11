export function isDevFromURL(url: URL | string, localProd = true): boolean {
	if (typeof url === "string") url = new URL(url);
	// Only wrangler dev use cf plugins like buckets
	if (!localProd) return url.hostname === "127.0.0.1" || url.hostname.includes("192.168.2.");
	else return url.hostname === "localhost";
};

export function isOnlineDev(url: URL | string): boolean {
	if (typeof url === "string") url = new URL(url);
	return url.hostname === 'byzantini-website.pages.dev';
};

export function convertUrlFromArgs(url: string, args: any): string {
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
	return url.match(/^[\p{L}\w\. '$_.+!*()-]+$/gu)?.at(0) === url;
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

export async function onElementMount(target: string, callback: (el: HTMLElement) => any) {
	let counter = 0;
	let el;
	while (!(el = document.querySelector(target)) && counter++ < 40) {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	if (counter >= 40) return;
	callback(el as HTMLElement);
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

export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function removeAccents(str: string): string {
	return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};
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
	maxJobs = 1,
	verb = false
): Promise<T[]> {
	let totalJobs = jobs.length;
	let jobsCompleted = 0;
	let queue: any[];
	if (maxJobs < jobs.length) {
		queue = Array.from(jobs.splice(0, maxJobs - 1));
	} else {
		queue = Array.from(jobs);
		maxJobs = jobs.length;
		jobs = []; // empty the jobs array
	}
	let results: T[] = [];
	console.log(`Starting ${totalJobs} jobs with ${maxJobs} max jobs`);
	while (true) {
		if (jobsCompleted === totalJobs) break;
		while (queue.length === 0 && jobsCompleted !== totalJobs) await sleep(25); // wait for a job to be added to the queue if any are left
		(jobsCompleted < totalJobs) && (async () => {
			let job = queue.shift() as () => Promise<T>; // dequeue the job
			if (!job) return;

			results.push(await job()); // execute the job
			jobsCompleted++;
			verb && (jobsCompleted % maxJobs === 0 || jobsCompleted === totalJobs) &&
				console.log(`Completed ${jobsCompleted}/${totalJobs} in queue`);

			while (queue.length === maxJobs) await sleep(50); // respect the maxJobs limit
			if (jobsCompleted !== totalJobs && jobs.length !== 0) {
				let newJob = jobs.shift() as () => Promise<T>;
				queue.push(newJob);
			}
		})();
	}
	while (jobsCompleted < totalJobs) await sleep(100);
	return results;
};

export class UpdateHandler {
	abortController = new AbortController();
	timeoutFired = false;
	func: Function;
	setFunction(func: Function) {
		this.func = func;
	}
	timer: number;
	timeout(ms = 0): Promise<void> {
		this.timeoutFired = true;
		return new Promise((res, rej) => {
			let tId = setTimeout(() => {
				this.timeoutFired = false;
				this.func.call(null);
				res();
			}, ms || this.timer);
			this.abortController.signal.onabort = () => {
				clearTimeout(tId);
				this.abortController = new AbortController();
				rej(0);
			};
		});
	};
	abort() {
		if (this.timeoutFired) this.abortController.abort();
		this.timeoutFired = false;
	};
	reset(ms = 0, func?: Function, catchAbort = false): Promise<void> {
		this.abort();
		func && (this.func = func);
		if (catchAbort) return this.timeout(ms || this.timer).catch(() => { });
		return this.timeout(ms || this.timer);
	}
	constructor(timer = 0, func = () => { }) {
		this.timer = timer || 1000;
		this.func = func;
	}

	static createInstance(timer = 0, func = () => { }): UpdateHandler {
		return new UpdateHandler(timer, func);
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

export const fileToBlob = async (file?: File | null): Promise<Blob | null> => {
	if (!file || !file.name) return Promise.resolve(null);
	return new Promise((res) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result)
				res(new Blob([reader.result], { type: file.type }));
			else res(null);
		};
		reader.readAsArrayBuffer(file);
	});
};
export function loadScript(src: string, res?: () => boolean): Promise<void> {
	return new Promise(async (resolve, reject) => {
		let script = document.createElement("script");
		script.src = src;
		script.onerror = () => reject();
		script.onload = async () => {
			let counter = 0;
			if (res) {
				while (!res() && counter++ < 20) {
					await sleep(200);
					resolve();
				}
			}
			resolve();
		};
		document.head.appendChild(script);

	});
};
export const loadImage = (src: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		let img = new Image();
		img.onload = () => resolve();
		img.onerror = () => reject();
		img.src = src;
	});
};

export const teacherTitleByGender = (title: 0 | 1 | 2, gender: "M" | "F") => {
	if (gender === "M")
		return title === 0 ? "Καθηγητής" : title === 1 ? "Δάσκαλος" : "Επιμελητής";
	else
		return title === 0 ? "Καθηγήτρια" : title === 1 ? "Δασκάλα" : "Επιμελήτρια";
};

export const imageMIMETypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jfif", "image/jpg"];
