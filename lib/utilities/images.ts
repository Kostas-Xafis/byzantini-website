const imageCache = new Map<string, HTMLImageElement>();
export const loadImage = (src: string, keep?: boolean): Promise<void> => {
    if (keep && imageCache.has(src)) {
        return new Promise((resolve) => {
            imageCache.get(src)!.onload = () => resolve();
        });
    }
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = src;
        keep && imageCache.set(src, img);
    });
};
