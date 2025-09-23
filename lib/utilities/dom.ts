import { sleep } from "./sleep";

export const download = (file: Blob, name: string) => {
    let a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
};

export async function onElementMount<T = HTMLElement>(target: string, callback: (el: T) => any) {
    let counter = 0;
    let el;
    while (!(el = document.querySelector(target)) && counter++ < 40) {
        await sleep(40);
    }
    if (counter >= 40) return;
    callback(el as T);
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


type AnimTimelineStep = { time?: number, anim: () => void; } | (() => void);
export class AnimTimeline {
    steps: AnimTimelineStep[] = [];
    startTime = 0;
    running = false;
    abortController = new AbortController();

    constructor() { }

    step(s: AnimTimelineStep) {
        if (typeof s === "function") {
            this.steps.push(s);
        } else {
            this.steps.push({ time: s.time || 0, anim: s.anim });
        }
        return this;
    }

    async start() {
        if (this.startTime != 0) await sleep(this.startTime);

        this.running = true;
        this.startTime = performance.now();
        for (let i = 0; i < this.steps.length; i++) {
            if (this.abortController.signal.aborted) break;

            const s = this.steps[i];
            if (typeof s === "function") {
                s();
            } else if (s.time && s.time != 0) {
                await sleep(s.time);
                s.anim();
            }
            void document.body.offsetHeight;
        }
        this.running = false;
    }

    abort() {
        this.abortController.abort();
    }
}

