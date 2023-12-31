type StringToType = {
	string: string;
	number: number;
	boolean: boolean;
	true: true;
	false: false;
};

type ExtractName<Param> = Param extends `[${infer ArgName}:${infer _}]` ? ArgName : never;
type ExtractType<Param> = Param extends `[${infer _}:${infer ArgType}]` ? ArgType : never;

//Splits URL to a union of parts
// export type Parts<URL> = URL extends `${infer HTTPMethod}:/${infer Path}`
// 	? Parts<Path>
// 	: URL extends `${infer A}/${infer B}`
// 	? (A extends `` ? never : A) | Parts<B>
// 	: URL;

// export type ExtractURLMethod<URL> = URL extends `${infer _}:${infer fullPath}` ? fullPath : URL;
// export type GetURLMethod<URL> = URL extends `${infer Method}:${infer _}` ? Method : never;
export type HasUrlParams<URL> = URL extends `${infer _}/[${infer _}:${infer _}]${infer _}` ? true : false;
export type ArgumentParts<Parts> = Parts extends `[${infer _}:${infer _}]` ? Parts : never;

// export type Parts<URL extends string> = URL extends `${infer PA}/${infer PB}`
// 	? PA | Parts<PB> : URL extends `` ? never : URL;
// export type ExpectedArguments<Parts extends string> = {
// 	[K in Parts as ExtractName<K>]: ExtractType<K> extends keyof StringToType ? StringToType[ExtractType<K>] : never;
// };

type ExtractArgumentParts<Path extends string> =
	Path extends `${infer _}[${infer Name}:${infer Type}]${infer nextPath}` ? `[${Name}:${Type}]` | ExtractArgumentParts<nextPath> : never;
;
export type ExpectedArguments<URL extends string> = {
	[K in ExtractArgumentParts<URL> as ExtractName<K>]: ExtractType<K> extends keyof StringToType ? StringToType[ExtractType<K>] : never;
};

// type BOB = ExpectedArguments<ArgumentParts<Parts<"/teachers/file/[id:number]/[name:string]">>>;
// type BOB2 = ExpectedArguments2<"/teachers/file/[id:number]/[name:string]">;


// type BOB = Parts<"/teachers/file/[id:number]">;

// type kyle = Parts2<"/teachers/file/[id:number]">;
