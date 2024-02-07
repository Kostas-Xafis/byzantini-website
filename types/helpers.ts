//FROM https://catchts.com/union-array

// credits goes to https://stackoverflow.com/a/50375286
// type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// Converts union to overloaded function
// type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>;

// type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never;

// type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

// export type UnionToArray<T, A extends unknown[] = []> = IsUnion<T> extends true
// 	? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
// 	: [T, ...A];

// export type ArrayToString<Arr, Separator extends string = ""> = Arr extends [infer A, ...infer B]
// 	? B extends []
// 	? A
// 	: ConcatStrings<Extract<A, string>, ArrayToString<Extract<B, string[]>, Separator>, Separator>

// 	: never;

// export type RequiredBy<T, K> = K extends keyof T
// 	? Omit<T, K> & {
// 		// NonNullable is used to remove undefined from the type that is automatically passed when using the optional operator (?)
// 		[Key in K]: NonNullable<T[Key]>;
// 	}
// 	: T;

// export type IsArray<T> = T extends Array<any> ? true : false;

// export type IncludesString<T, S extends string> = ArrayToString<UnionToArray<T>> extends `${infer _A}${S}${infer _B}` ? true : false;

// type InUnion<T, U> = T extends U ? true : false;


// For each kv pair, assign the kv pair as the value of the key to separate the object into a "union" of objects
// type ObjectSplit<T extends Record<string, any>> = { [K in keyof T]: Pick<T, K> };

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

// export type ReplaceValue<T extends Record<any, any>, Replaced extends keyof T, Value extends any> = Omit<T, Replaced> & {
// 	[P in Replaced]: Value
// };


export type ConcatStrings<A extends string, B extends string, Separator extends string = ""> = `${A}${Separator}${B}`;
export type IsAny<T> = 0 extends 1 & T ? true : false;

export type PartialBy<Obj, OKey> = OKey extends keyof Obj
	? Omit<Obj, OKey> & {
		[Key in OKey]?: Obj[Key];
	}
	: Obj;
export type RemovePartial<T extends Record<string, any>, KeyUnion extends keyof T> = Omit<T, KeyUnion> & {
	[K in KeyUnion]-?: Exclude<T[K], undefined>;
};
export type IsNull<T> = TypeGuard<T> extends true ? false : true;

export type ReplaceName<T extends Record<any, any>, Replaced extends keyof T, Replacement extends string | number | symbol, Value = any> =
	Omit<T, Replaced> & {
		[K in Replacement]: Value;
	};
export type ObjectValuesToUnion<T extends Record<any, any>> = T[keyof T];

type IsOptional<T, U extends keyof T> = Pick<T, U> extends {
	[K in U]-?: T[K]
} ? false : true;

type GetUndefinedFields<T extends Record<string, any>> = keyof T extends `${infer K}`
	? K extends keyof T
	? IsOptional<T, K> extends false
	? IsNull<T[K]> extends true
	? K
	: never
	: never
	: never
	: never;

export type RemoveNullishFields<T extends Record<string, any>> =
	{
		[K in keyof Omit<T, GetUndefinedFields<T>>]: T[K];
	} & {};



type TypeGuard<T> = [T] extends [{}] ? ([T] extends [never] ? false : true) : false;

// let t1: TypeGuard<any> = true;
// let t2: TypeGuard<string> = true;
// let t3: TypeGuard<number> = true;
// let t4: TypeGuard<bigint> = true;
// let t5: TypeGuard<true> = true;
// let t6: TypeGuard<{}> = true;
// let t7: TypeGuard<[]> = true;
// let t8: TypeGuard<Symbol> = true;
// let t9: TypeGuard<undefined> = false;
// let t10: TypeGuard<null> = false;
// let t11: TypeGuard<never> = false;
// let t12: TypeGuard<unknown> = false;

// let t13: TypeGuard<any[]> = true;
// let t14: TypeGuard<(...args: any) => any> = true;
// let t15: TypeGuard<(...args: any[]) => any[]> = true;

// interface TestTypeGuardI { }
// enum TestTypeGuardE { }
// class TestTypeGuardC { }
// let t16: TypeGuard<TestTypeGuardI> = true;
// let t17: TypeGuard<TestTypeGuardE> = true;
// let t18: TypeGuard<TestTypeGuardC> = true;
