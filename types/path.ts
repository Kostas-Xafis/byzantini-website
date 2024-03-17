type StringToType = {
	string: string;
	number: number;
	boolean: boolean;
	true: true;
	false: false;
};

type InferToNum<T extends number> = T;
type ToDigit<T extends number | string> = T extends number ? T : T extends `${InferToNum<infer N>}` ? N : never;

type GetLiteral<Literal> = Literal extends `"${infer Str}"`
	? Str
	: Literal extends `${infer Num}`
	? ToDigit<Num>
	: never;

type ExtractLiteral<Param> =
	Param extends `${infer Literal} | ${infer Next}`
	? GetLiteral<Literal> | ExtractLiteral<Next>
	: Param extends `${infer Literal}`
	? GetLiteral<Literal> : never;

type ExtractName<Slug> = Slug extends `[${infer SlugName}:${infer _}]` ? SlugName : never;
type ExtractType<Slug> = Slug extends `[${infer _}:${infer SlugType}]` ? SlugType : never;

type ExtractArgumentParts<Path extends string> =
	Path extends `${infer _}[${infer Name}:${infer Type}]${infer Next}` ? `[${Name}:${Type}]` | ExtractArgumentParts<Next> : never;
;
export type ExpectedArguments<URL extends string> = {
	[K in ExtractArgumentParts<URL> as ExtractName<K>]:
	ExtractType<K> extends keyof StringToType
	? StringToType[ExtractType<K>]
	: ExtractLiteral<ExtractType<K>>;
};

export type HasUrlParams<URL> = URL extends `${infer _}/[${infer _}:${infer _}]${infer _}` ? true : false;
