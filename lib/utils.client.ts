
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

export class UpdateHandler {
    abortController = new AbortController();
    timeoutFired = false;
    func: Function = () => { };
    timer = 0;
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
    reset(ms = 0) {
        this.abort();
        return this.timeout(ms || this.timer);
    }
    constructor(timer = 0, func = () => { }) {
        this.timer = timer;
        this.func = func;
    }
}