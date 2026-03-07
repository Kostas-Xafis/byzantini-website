import { file, hash, write } from "bun";

export class Cache {
    private cache: { [key: string]: string; } = {};

    constructor() {
        this.loadCache();
    }

    private async loadCache() {
        try {
            const cacheFile = file("./.cache/tests.json");
            if (await cacheFile.exists()) {
                this.cache = await cacheFile.json() as { [key: string]: string; };
            }
        } catch (err) {
            console.error("Error loading cache:", err);
            this.cache = {};
        }
    }

    get(key: string): string | undefined {
        return this.cache[key];
    }

    getAll(): { [key: string]: string; } {
        return this.cache;
    }

    set(key: string, value: string) {
        this.cache[key] = value;
    }

    validate(key: string, hash: string): boolean {
        return this.cache[key] === hash;
    }

    functionHash(func: Function): string {
        return hash(func.toString()).toString(16);
    }

    async save() {
        try {
            await write("./.cache/tests.json", JSON.stringify(this.cache, null, 2));
        } catch (err) {
            console.error("Error saving cache:", err);
        }
    }
}
