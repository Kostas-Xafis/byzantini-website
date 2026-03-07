import { Env } from "@env/env";
import { isAsyncFunction } from "@utilities/functionValidation";
import { test as bun_test, } from "bun:test";
import { APIRaw } from "../lib/routes/index.server";
import { Cache } from "./TestCache";
import { TestSignal } from "./TestSignal";

type TestOpts = {
    timeout?: number;
    retry?: number;
    repeats?: number;
};
type TestFunction = (() => (Promise<unknown> | void)) & { opts?: TestOpts; };
type BunTestFunction = () => (Promise<unknown> | void);
type ChainOpts = {
    force?: boolean;
};
type EndpointHash = {
    label: string;
    hash: string;
};
type TestChainLink = {
    label: string;
    func: TestFunction;
    wrapper: BunTestFunction;
    opts?: TestOpts;
    signal: TestSignal;
};

const skip = (label: string, func: BunTestFunction) => bun_test.skip(label, func);
const bunTest = (label: string, func: BunTestFunction, opts: TestOpts = {}) => bun_test(label, func, opts);

const defaultTestOpts: TestOpts = {
    timeout: 10000,
    retry: 0,
    repeats: 0,
};

class TestChainManager {
    private readonly cache: Cache;
    private readonly forceTest: boolean;

    constructor(forceTest = false) {
        this.cache = new Cache();
        this.forceTest = forceTest;
    }

    async chain(chainLabel: string, ...tests: TestFunction[]) {
        if (tests.length === 0) return;

        const forceTests = this.shouldForceChain(chainLabel, tests);
        const links = this.createLinks(chainLabel, tests);

        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const nextSignal = i + 1 < links.length ? links[i + 1].signal : null;
            link.wrapper = this.createLinkWrapper(links, i, nextSignal);
            this.chainCachedTest(link, { force: forceTests });
        }

        links[0].signal.signal();
    }

    test(label: string, func: TestFunction, { force = false }: { force?: boolean; } = {}) {
        const testHash = this.cache.functionHash(func);
        const apiCallHashes = this.apiCallsHash(func);
        const apiCalls = apiCallHashes.map(({ label, hash }) => this.cache.validate(label, hash));

        if (this.forceTest || this.cache.validate(label, testHash) || apiCalls.includes(true) || force === true) {
            bunTest(label, async () => {
                await this.runFunction(func);
                this.cache.set(label, testHash);
                apiCallHashes.forEach(({ label, hash }) => {
                    this.cache.set(label, hash);
                });
                await this.cache.save();
            });
            return;
        }

        skip(label, func);
    }

    private shouldForceChain(chainLabel: string, tests: TestFunction[]): boolean {
        for (const testFunc of tests) {
            const apiCalls = this.apiCallsHash(testFunc);
            const apiCallLabel = this.resolveTestLabel(chainLabel, apiCalls);
            const apiCallHash = apiCalls.map(item => this.cache.validate(apiCallLabel, item.hash));
            if (this.cache.validate(apiCallLabel, this.cache.functionHash(testFunc)) || apiCallHash.includes(true)) {
                return true;
            }
        }
        return false;
    }

    private createLinks(chainLabel: string, tests: TestFunction[]): TestChainLink[] {
        return tests.map((testFunc) => {
            const label = this.resolveTestLabel(chainLabel, this.apiCallsHash(testFunc));
            return {
                label,
                func: testFunc,
                opts: testFunc.opts,
                signal: new TestSignal(),
                wrapper: async () => { }
            };
        });
    }

    private createLinkWrapper(links: TestChainLink[], index: number, nextSignal: TestSignal | null): BunTestFunction {
        return async () => {
            const currentLink = links[index];
            try {
                await currentLink.signal.wait();
                await this.runFunction(currentLink.func);

                this.cache.set(currentLink.label, this.cache.functionHash(currentLink.func));
                this.apiCallsHash(currentLink.func).forEach(({ label, hash }) => {
                    this.cache.set(label, hash);
                });

                nextSignal?.signal();
            } catch (error) {
                links.forEach((link, linkIndex) => {
                    if (linkIndex > index) {
                        link.signal.abort("Test chain aborted");
                    }
                });
                throw error;
            } finally {
                if (index === links.length - 1) {
                    await this.cache.save();
                }
            }
        };
    }

    private async runFunction(func: TestFunction) {
        if (isAsyncFunction(func)) {
            await func();
            return;
        }
        func();
    }

    private chainCachedTest(link: TestChainLink, chainOpts?: ChainOpts) {
        const { force = false } = chainOpts || {};
        const { label, func, wrapper, opts } = link;
        const testHash = this.cache.functionHash(func);

        if (this.forceTest || this.cache.validate(label, testHash) || force === true) {
            bunTest(label, wrapper, { ...defaultTestOpts, ...opts });
            return;
        }

        skip(label, func);
    }

    private resolveTestLabel(chainLabel: string, apiCalls: EndpointHash[]) {
        return chainLabel + " " + apiCalls.map(item => item.label).join("& ");
    }

    private apiCallsHash(func: TestFunction): EndpointHash[] {
        const calls = [...func.toString().matchAll(/(useTestAPI\(\")[\w+.]+/g)]
            .join("")
            .replaceAll("useTestAPI(\"", "")
            .split(",")
            .filter(Boolean);

        return calls.map((endpointName) => {
            const endpoint = APIRaw[endpointName as keyof typeof APIRaw];
            if (!endpoint) {
                throw new Error(`Endpoint ${endpointName} not found in APIRaw.\nPlease use the exact name of the endpoint as defined in APIRaw when calling useTestAPI.`);
            }

            return {
                label: endpoint.method + " " + endpoint.path,
                // @ts-ignore endpoint.func is injected in server route assembly
                hash: this.cache.functionHash(endpoint.func)
            };
        });
    }
}

const { FORCE_TEST = false } = Env.testEnv;
const manager = new TestChainManager(FORCE_TEST);

export const chain = (chainLabel: string, ...tests: TestFunction[]) => manager.chain(chainLabel, ...tests);
export const test = (label: string, func: TestFunction, opts?: { force?: boolean; }) => manager.test(label, func, opts);
