import { sleep } from "./sleep";

export async function dynamicImport<T>(src: string, name: string): Promise<T> {
    // @ts-ignore
    if (window[name]) return window[name];
    const module = await import(/* @vite-ignore */src);
    // @ts-ignore
    window[name] = module;
    return module;
}

export function loadScript(src: string, res?: () => boolean, force = false): Promise<any> {
    if (!force) {
        if (res && res()) return Promise.resolve(res());
        else if (!res && document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    }
    return new Promise(async (resolve, reject) => {
        let script = document.createElement("script");
        script.src = src;
        script.onerror = () => reject();
        script.onload = async () => {
            let counter = 0;
            if (res) {
                while (!res() && counter++ < 20) {
                    await sleep(200);
                    resolve(res());
                }
            }
            resolve(null);
        };
        document.head.appendChild(script);
    });
};
