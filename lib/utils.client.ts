export function isDevFromURL(url: URL | string, localProd = false) {
	if (typeof url === "string") url = new URL(url);
	// Only wrangler dev use cf plugins like buckets
	if (localProd) return url.hostname === "localhost";
	return (
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname.includes("192.168.2.")
	);
};

export function isOnlineDev(url: URL | string) {
	if (typeof url === "string") url = new URL(url);
	return url.hostname === 'byzantini-website.pages.dev';
};

export function convertUrlFromArgs(url: string, args: any) {
	let newUrl = url.slice();
	url.split("/")
		.filter(part => part.startsWith("["))
		.forEach(part => {
			const [name, _] = part.slice(1, -1).split(":");
			newUrl = newUrl.replace(part, args[name]);
		});
	return newUrl;
};
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
export function getCookie(cname: string) {
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
	if (counter >= 10) return;
	callback(el as HTMLElement);
};

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

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function removeAccents(str: string) {
	return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export function mappedValue(value: number, min = 0, max = 1, outMin = 0, outMax = 1) {
	if (min === max) return outMin;
	if (outMin === outMax) return outMin;
	if (value >= max) return outMax;
	if (value <= min) return outMin;
	let range = max - min;
	let outRange = outMax - outMin;

	value = value > max ? max : value < min ? min : value;
	let normalized = (value - min) / range;

	return normalized * outRange + outMin;
};

export async function asyncQueue<T>(
	jobs: (() => Promise<T>)[],
	maxJobs = 1,
	verb = false
) {
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
			verb &&
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
	timeout(ms = 0) {
		this.timeoutFired = true;
		return new Promise((res, rej) => {
			let tId = setTimeout(() => {
				this.timeoutFired = false;
				this.func.call(null);
				res(null);
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
	reset(ms = 0, func?: Function, catchAbort = false) {
		this.abort();
		func && (this.func = func);
		if (catchAbort) return this.timeout(ms || this.timer).catch(() => { });
		return this.timeout(ms || this.timer);
	}
	constructor(timer = 0, func = () => { }) {
		this.timer = timer || 1000;
		this.func = func;
	}

	static createInstance(timer = 0, func = () => { }) {
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

export const fileToBlob = async (file: File): Promise<Blob | null> => {
	if (!file.name) return null;
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
export function loadScript(src: string, res: () => boolean) {
	return new Promise(async (resolve, reject) => {
		let script = document.createElement("script");
		script.src = src;
		script.onerror = () => reject(null);
		document.head.appendChild(script);
		while (!res()) {
			await sleep(50);
			resolve(null);
		}
	});
};
export const loadImage = (src: string) => {
	return new Promise((resolve, reject) => {
		let img = new Image();
		img.onload = () => resolve(null);
		img.onerror = () => reject(null);
		img.src = src;
	});
};

export const teacherTitleByGender = (title: 0 | 1 | 2, gender: "M" | "F") => {
	if (gender === "M")
		return title === 0 ? "Καθηγητής" : title === 1 ? "Δάσκαλος" : "Επιμελητής";
	else
		return title === 0 ? "Καθηγήτρια" : title === 1 ? "Δασκάλα" : "Επιμελήτρια";
};
