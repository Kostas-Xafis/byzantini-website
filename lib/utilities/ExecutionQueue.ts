import { isAsyncFunction } from "./functionValidation";
import { Random as R } from "../random";
import { deepCopy } from "./objects";
import { sleep } from "./sleep";

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

            if (this.isAsync || isAsyncFunction(this.func)) {
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