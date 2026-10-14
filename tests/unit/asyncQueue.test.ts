import { describe, expect, test } from "bun:test";
import { asyncQueue } from "@utilities/AsyncQueue";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("asyncQueue", () => {
	test("runs every job with at most maxJobs in flight", async () => {
		let inFlight = 0;
		let peak = 0;
		const jobs = Array.from({ length: 12 }, (_, i) => async () => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await delay(5);
			inFlight--;
			return i;
		});
		const results = await asyncQueue(jobs, { maxJobs: 3 });
		expect(results.sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
		expect(peak).toBe(3);
	});

	test("empty job list resolves to []", async () => {
		expect(await asyncQueue([], { maxJobs: 4 })).toEqual([]);
	});

	test("onProgress and the legacy progressCallback report every finished job", async () => {
		const seen: number[] = [];
		const legacy: number[] = [];
		const jobs = Array.from({ length: 5 }, (_, i) => async () => i);
		await asyncQueue(jobs, { maxJobs: 2, onProgress: ({ done, total }) => seen.push(done * 10 + total), progressCallback: (n) => legacy.push(n) });
		expect(seen).toEqual([15, 25, 35, 45, 55]);
		expect(legacy).toEqual([1, 2, 3, 4, 5]);
	});

	test("progressOnThrow skips failing jobs and counts them", async () => {
		let last = { done: 0, total: 0, failed: 0 };
		const jobs = [async () => 1, async () => Promise.reject(new Error("x")), async () => 3];
		const results = await asyncQueue(jobs, { maxJobs: 2, progressOnThrow: true, onProgress: (p) => (last = p) });
		expect(results.sort()).toEqual([1, 3]);
		expect(last).toEqual({ done: 3, total: 3, failed: 1 });
	});

	test("without progressOnThrow the first error rejects and stops scheduling", async () => {
		let started = 0;
		const jobs = Array.from({ length: 10 }, (_, i) => async () => {
			started++;
			if (i === 1) throw new Error("fail");
			await delay(2);
			return i;
		});
		await expect(asyncQueue(jobs, { maxJobs: 2 })).rejects.toThrow("fail");
		await delay(20);
		expect(started).toBeLessThan(10);
	});

	test("abort rejects at once and schedules nothing more", async () => {
		const controller = new AbortController();
		let started = 0;
		const jobs = Array.from({ length: 20 }, () => async () => {
			started++;
			await delay(10);
			return started;
		});
		const run = asyncQueue(jobs, { maxJobs: 2, signal: controller.signal });
		await delay(15);
		controller.abort();
		await expect(run).rejects.toMatchObject({ name: "AbortError" });
		const startedAtAbort = started;
		await delay(40);
		expect(started).toBe(startedAtAbort);
		expect(started).toBeLessThan(20);
	});

	test("an already aborted signal rejects before running anything", async () => {
		let ran = false;
		await expect(asyncQueue([async () => (ran = true)], { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
		expect(ran).toBe(false);
	});
});
