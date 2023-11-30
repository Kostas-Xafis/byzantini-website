//FROM https://catchts.com/union-array

// credits goes to https://stackoverflow.com/a/50375286
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// Converts union to overloaded function
type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>;

type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never;

type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

export type UnionToArray<T, A extends unknown[] = []> = IsUnion<T> extends true
	? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
	: [T, ...A];

export type ConcatStrings<A, B, Separator = ""> = A extends `${infer _A}`
	? B extends `${infer _B}`
	? Separator extends `${infer _S}`
	? `${_A}${_S}${_B}`
	: never
	: never
	: never;
export type ArrayToString<Arr, Separator = ""> = Arr extends [infer A, ...infer B]
	? B extends []
	? A
	: ConcatStrings<A, ArrayToString<B, Separator>, Separator>
	: never;

export type IsAny<T> = 0 extends 1 & T ? true : false;

export type PartialBy<T, K> = K extends keyof T
	? Omit<T, K> & {
		[Key in K]?: T[Key];
	}
	: T;

export type RequiredBy<T, K> = K extends keyof T
	? Omit<T, K> & {
		// NonNullable is used to remove undefined from the type that is automatically passed when using the optional operator (?)
		[Key in K]: NonNullable<T[Key]>;
	}
	: T;

export type IsArray<T> = T extends Array<any> ? true : false;

export type IncludesString<T, S extends string> = ArrayToString<UnionToArray<T>> extends `${infer _A}${S}${infer _B}` ? true : false;


// type InUnion<T, U> = T extends U ? true : false;


// // For each kv pair, assign the kv pair as the value of the key to separate the object into a "union" of objects
// type ObjectSplit<T extends Record<any, any>> = { [K in keyof T]: Pick<T, K> };

// // Convert the union of objects into an array of the unique kv pair objects
// type ObjectSplitToArray<T extends Record<any, any>> = ObjectSplit<T> extends infer K ? UnionToArray<K[keyof K]> : never;

// // Recursively convert the array of kv pair objects into an array of the values
// type ObjectArrToTypedArray<Arr extends Record<any, any>[], Res extends unknown[] = []> = Arr extends [infer A, ...infer B]
// 	? B extends []
// 	? [...Res, A[keyof A]]
// 	: B extends any[]
// 	? ObjectArrToTypedArray<B, [...Res, A[keyof A]]>
// 	: never
// 	: never;

// export type ObjectValues<T extends Record<any, any>> = ObjectArrToTypedArray<ObjectSplitToArray<T>>;

export type ReplaceName<T extends Record<any, any>, Replaced extends keyof T, Replacement extends string | number | symbol, Value = any> =
	IsAny<Value> extends false ? Omit<T, Replaced> & {
		[P in Replacement]: Value
	} : {
		[P in keyof T as P extends Replaced ? Replacement : P]: T[P];
	};

export type ReplaceValue<T extends Record<any, any>, Replaced extends keyof T, Value extends any> = Omit<T, Replaced> & {
	[P in Replaced]: Value
};
