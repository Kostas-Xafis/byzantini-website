export const isDevFromURL = (url: URL) => {
	return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.includes("192.168.2.");
}

export const isOnlineDev = (url: URL) => {
	return url.hostname === "byzantini-website.pages.dev";
}
export const onElementMount = async (target: string, callback: () => any) => {
	let counter = 0;
	while (!document.querySelector(target) && counter++ < 40) {
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	if (counter >= 10) return;
	callback();
};

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const removeAccents = (str: string) => {
	return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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
}

export const asyncQueue = async <T>(jobs: (() => Promise<T>)[], maxJobs = 1, verb = false) => {
	let totalJobs = jobs.length;
	let jobsCompleted = 0;
	let queue = maxJobs < jobs.length ? Array.from(jobs.splice(0, maxJobs - 1)) : Array.from(jobs);
	let results: T[] = [];
	while (jobsCompleted < totalJobs) {
		while (!queue.length) await sleep(25);
		(async () => {
			let job = queue.shift() as () => Promise<T>;
			if (!job) return;
			results.push(await job());
			jobsCompleted++;
			verb && console.log(`Completed ${jobsCompleted}/${totalJobs} in queue`);
			while (queue.length === maxJobs) await sleep(50);
			if (jobsCompleted !== jobs.length && queue.length !== maxJobs) {
				let newJob = jobs.shift() as () => Promise<T>;
				queue.push(newJob);
			}
		})();
	}
	while (jobsCompleted < totalJobs) await sleep(100);
	return results;
}


export class UpdateHandler {
	abortController = new AbortController();
	timeoutFired = false;
	func: Function;
	timer: number;
	timeout = (ms = 0) => {
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
	abort = () => {
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
		'iPad Simulator',
		'iPhone Simulator',
		'iPod Simulator',
		'iPad',
		'iPhone',
		'iPod'
	];
	// @ts-ignore
	return iOSPlatforms.includes(navigator.platform) || iOSPlatforms.includes(navigator["userAgentData"]?.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
}

