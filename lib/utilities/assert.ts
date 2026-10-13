/**
 * Type-level assertion that `obj` carries `prop` — a cheat for when we know better than the type checker
 * (e.g. the `APIArgs` machinery drops nullish members, so `RequestObject`/`UrlArgs` are not statically guaranteed).
 *
 * No runtime check. Kept in a neutral module (no server imports) so both browser and server code can use it.
 */
export function assertOwnProp<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): asserts obj is X & Record<Y, unknown> {}
