
export const isDevFromURL = (url: URL) => {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.includes("192.168.2.");
}

export const isOnlineDev = (url: URL) => {
    return url.hostname === "byzantini-website.pages.dev";
}
export const onElementMount = async (target: string, callback: () => any) => {
    let counter = 0;
    while (!document.querySelector(target) && counter++ < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (counter >= 10) return;
    callback();
};
