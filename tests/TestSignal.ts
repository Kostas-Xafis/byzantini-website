export class TestSignal {
    #res!: (value: boolean) => void;
    #rej!: (err: unknown) => void;
    #promise: Promise<boolean>;
    constructor() {
        this.#promise = new Promise((res, rej) => {
            this.#res = res;
            this.#rej = rej;
        });
    }
    wait() {
        return this.#promise;
    }
    signal() {
        this.#res(true);
    }
    abort(err: unknown) {
        this.#rej(err);
    }

}
