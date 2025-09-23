import { isAsyncFunction } from "./functionValidation";
import { sleep } from "./sleep";

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
                    isAsyncFunction(progressCallback) ? await progressCallback(jobsCompleted) : progressCallback(jobsCompleted);
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
