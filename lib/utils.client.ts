export const isDevFromURL = (url: URL) => {
	return (
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname.includes("192.168.2.")
	);
};

export const isOnlineDev = (url: URL) => {
	return url.hostname === 'byzantini-website.pages.dev';
};
export const onElementMount = async (target: string, callback: (el: HTMLElement) => any) => {
	let counter = 0;
	let el;
	while (!(el = document.querySelector(target)) && counter++ < 40) {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	if (counter >= 10) return;
	callback(el as HTMLElement);
};

export const swapElementsWithFade = (prev: HTMLElement, curr: HTMLElement, msFadeOut = 300, msFadeIn = 500) => {
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

export const loadImage = (src: string) => {
	return new Promise((resolve, reject) => {
		let img = new Image();
		img.onload = () => resolve(null);
		img.onerror = () => reject(null);
		img.src = src;
	});
};

export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

export const removeAccents = (str: string) => {
	return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

export const mappedValue = (value: number, min = 0, max = 1, outMin = 0, outMax = 1) => {
	if (min === max) return outMin;
	if (outMin === outMax) return outMin;
	if (value >= max) return outMax;
	if (value <= min) return outMin;
	let range = max - min;
	let outRange = outMax - outMin;
	let normalized = (value - min) / range;

	return normalized * outRange + outMin;
};

export const loadScript = (src: string, res: () => boolean) => {
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

export const asyncQueue = async <T>(
	jobs: (() => Promise<T>)[],
	maxJobs = 1,
	verb = false
) => {
	let totalJobs = jobs.length;
	let jobsCompleted = 0;
	let queue =
		maxJobs < jobs.length
			? Array.from(jobs.splice(0, maxJobs - 1))
			: Array.from(jobs);
	let results: T[] = [];
	while (jobsCompleted < totalJobs) {
		while (!queue.length) await sleep(25);
		(async () => {
			let job = queue.shift() as () => Promise<T>;
			if (!job) return;
			results.push(await job());
			jobsCompleted++;
			verb &&
				console.log(`Completed ${jobsCompleted}/${totalJobs} in queue`);
			while (queue.length === maxJobs) await sleep(50); // wait for a job to finish
			if (jobsCompleted !== totalJobs && queue.length !== maxJobs) {
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
