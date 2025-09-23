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

