import { isAsyncFunction } from "./functionValidation";

export type AsyncQueueProgress = {
	/** Jobs finished so far (failed ones included). */
	done: number;
	total: number;
	/** Jobs that threw (only counted with `progressOnThrow`). */
	failed: number;
};

export type AsyncQueueOptions = {
	/** Concurrency limit (default 1). */
	maxJobs?: number;
	verbose?: boolean;
	/** Legacy hook: called with the completed count after every job (awaited when it is an `async function`). */
	progressCallback?: ((prog: number) => any) | null;
	/** Swallow job errors (the job counts as done, its result is skipped) instead of rejecting. */
	progressOnThrow?: boolean;
	/** Called after every finished job. */
	onProgress?: (progress: AsyncQueueProgress) => void;
	/** Aborting stops scheduling further jobs and rejects at once with the signal's reason (in-flight jobs are left to settle). */
	signal?: AbortSignal;
};

const abortReason = (signal: AbortSignal) => signal.reason ?? new DOMException("The operation was aborted.", "AbortError");

/**
 * Runs `jobs` with at most `maxJobs` in flight and resolves with their results in completion order.
 * Without `progressOnThrow` the first failing job rejects the queue and stops scheduling the rest.
 */
export async function asyncQueue<T>(jobs: (() => Promise<T>)[], args: AsyncQueueOptions = {}): Promise<T[]> {
	const { maxJobs = 1, verbose = false, progressCallback = null, progressOnThrow = false, onProgress, signal } = args;
	const total = jobs.length;
	const workers = Math.max(1, Math.min(maxJobs, total));
	const results: T[] = [];
	let next = 0;
	let done = 0;
	let failed = 0;
	let stopped = false;

	if (signal?.aborted) throw abortReason(signal);
	if (verbose) console.log(`Starting ${total} jobs with ${workers} max jobs`);

	const worker = async () => {
		while (!stopped && next < total) {
			if (signal?.aborted) return;
			const job = jobs[next++];
			try {
				results.push(await job());
			} catch (e) {
				if (!progressOnThrow) {
					stopped = true;
					throw e;
				}
				failed++;
			}
			done++;
			if (stopped || signal?.aborted) return;

			if (progressCallback) {
				isAsyncFunction(progressCallback) ? await progressCallback(done) : progressCallback(done);
			}
			onProgress?.({ done, total, failed });
			if (verbose && (done % workers === 0 || done === total)) {
				console.log(`Completed ${done}/${total} in queue`);
			}
		}
	};

	const run = Promise.all(Array.from({ length: total === 0 ? 0 : workers }, worker));
	if (!signal) {
		await run;
		return results;
	}

	let onAbort!: () => void;
	const aborted = new Promise<never>((_, reject) => {
		onAbort = () => {
			stopped = true;
			reject(abortReason(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
	try {
		await Promise.race([run, aborted]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
	return results;
}
