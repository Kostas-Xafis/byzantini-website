type StringType = {
	string: string;
	number: number;
	boolean: boolean;
	true: true;
	false: false;
};

type ExtractName<Param> = Param extends `[${infer ArgName}:${infer _}]` ? ArgName : never;
type ExtractType<Param> = Param extends `[${infer _}:${infer ArgType}]` ? ArgType : never;

//Splits URL to a union of parts
export type Parts<URL> = URL extends `${infer HTTPMethod}:/${infer Path}`
	? Parts<Path>
	: URL extends `${infer A}/${infer B}`
	? (A extends `` ? never : A) | Parts<B>
	: URL;

export type ExtractURLMethod<URL> = URL extends `${infer _}:${infer fullPath}` ? fullPath : never;
export type GetURLMethod<URL> = URL extends `${infer Method}:${infer _}` ? Method : never;
export type HasUrlParams<URL> = URL extends `${infer _}/[${infer _}:${infer _}]${infer _}` ? true : false;
export type ArgumentParts<Parts> = Parts extends `[${infer _}:${infer _}]` ? Parts : never;
export type ExpectedArguments<Parts extends string> = {
	[K in Parts as ExtractName<K>]: ExtractType<K> extends keyof StringType ? StringType[ExtractType<K>] : never;
};

// type CheckArguments<URL, URLArgs> = URL extends `${infer A}/${infer B}`
// 	? URLArgs extends `${infer C}/${infer D}`
// 		? (ExtractType<C> extends `number` ? `/[${ExtractName<C>}:${IsNumber<A>}]` : `/[${ExtractName<C>}:${true}]`) | CheckArguments<B, D>
// 		: true
// 	: ExtractType<URLArgs> extends `number`
// 	? `/[${ExtractName<URLArgs>}:${IsNumber<URL>}]`
// 	: never;

// type Check = ExpectedArguments<Parts<ArrayToString<UnionToArray<CheckArguments<"/Bob/ab123c/123a", "/Bob/[name:string]/[age:number]">>>>>;

// export type ValidateURL<URL, URLArgs> = ArrayToString<UnionToArray<CheckArguments<URL, URLArgs>>> extends `${infer _}false${infer _}`
// 	? false
// 	: true;

// type Check = ValidateURL<"/Bob/123", "/Bob/[age:number]">;

// export type IsNumber<Part> = Part extends `${number}` ? true : false;
