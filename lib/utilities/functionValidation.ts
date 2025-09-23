export const Function = function () { }.constructor;
export function isFunction(func: any): func is Function {
    return func.constructor === Function;
}
export const AsyncFunction = async function () { }.constructor;
export function isAsyncFunction(func: any): func is (...args: any) => Promise<any> {
    return func.constructor === AsyncFunction;
}
export const GeneratorFunction = function* () { }.constructor;
export function isGeneratorFunction(func: any): func is GeneratorFunction {
    return func.constructor === GeneratorFunction;
}
export const AsyncGeneratorFunction = async function* () { }.constructor;
export function isAsyncGeneratorFunction(func: any): func is AsyncGeneratorFunction {
    return func.constructor === AsyncGeneratorFunction;
}
