import type { ConcatStrings, IsAny, IsNull, ReplaceValue } from "./helpers";
import type {
	ArgumentParts,
	ExpectedArguments,
	HasUrlParams,
	Parts,
} from "./path";
import type { Output, ObjectSchema, ObjectShape } from "valibot";
import type { APIContext } from "astro";

export type AnyObjectSchema = ObjectSchema<ObjectShape, any>;

type IsValibotSchema<T> = T extends (infer K)[]
	? IsValibotSchema<K>
	: T extends AnyObjectSchema
	? true
	: false;

export type HTTPMethods = "GET" | "POST" | "PUT" | "DELETE";

export type EndpointResponse<T> = {
	res:
	| (T extends string
		? {
			type: "message";
			message: string;
		}
		: IsAny<T> extends true
		? {
			type: "message";
			message: string;
		}
		: T extends undefined
		? {
			type: "message";
			message: string;
		}
		: {
			type: "data";
			data: T;
		})
	| {
		type: "error";
		error: any;
	};
};

export type Context<Req = any> = ReplaceValue<
	APIContext,
	"request",
	ReplaceValue<
		APIContext["request"],
		"json",
		() => Promise<Req extends AnyObjectSchema ? Output<Req> : Req>
	>
>;

// Use for typing routes, accessible in the frontend
export type EndpointRoute<URL extends string, Req = null, Res = string> = (IsAny<URL> extends false
	? {
		authentication: boolean;
		method: HTTPMethods;
		path: URL;
		hasUrlParams: HasUrlParams<URL>;
		func: HasUrlParams<URL> extends true
		? (
			req: Req extends null
				? APIContext
				: Context<Req>,
			slug: ExpectedArguments<ArgumentParts<Parts<URL>>>
		) => Promise<EndpointResponse<Res>>
		: (
			req: Req extends null
				? APIContext
				: Context<Req>
		) => Promise<EndpointResponse<Res>>;
	}
	: {
		// For default use case
		authentication: boolean;
		method: HTTPMethods;
		path: string;
		hasUrlParams: boolean;
		func: (req: Context, slug: any) => Promise<any>;
	}) & (IsValibotSchema<Req> extends true
		? { validation: () => Req; }
		: {}) & {
			middleware?: ((req: APIContext) => Promise<Response | undefined>)[];
		};

// export type DefaultEndpointRoute<URL extends string, RequestObject = null> = EndpointRoute<URL, RequestObject>;

// Use for typing routes, accessible in the frontend
export type APIEndpointsBuilder<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[K in keyof Routes as ConcatStrings<Mount, Extract<K, string>, ".">]: Routes[K] extends {
			validation: () => AnyObjectSchema;
		}
		? {
			method: Routes[K]["method"];
			path: Routes[K]["path"];
			endpoint: ConcatStrings<Mount, Extract<K, string>, ".">;
			validation: ReturnType<Routes[K]["validation"]>;
		}
		: {
			method: Routes[K]["method"];
			path: Routes[K]["path"];
			endpoint: ConcatStrings<Mount, Extract<K, string>, ".">;
		};
	};

// Use for an object of routes, accessible in the frontend
export type APIBuilder<
	Mount extends string,
	Routes extends { [k: string]: any; }
> = {
		[m in Mount]: {
			[K in keyof Routes]: ConcatStrings<Mount, Extract<K, string>, ".">;
		};
	};


type ConvertEmptyObjectArgToUndefined<T> = T extends { [k: string]: never; } ? undefined : T;

// Use for typing API Request params in the frontend
export type APIArguments<Mount extends string, Routes extends {
	[k: string]: {
		"func": (...args: any[]) => Promise<any>;
	};
}> =
	{
		[K in keyof Routes as ConcatStrings<Mount, Extract<K, string>, ".">]: ConvertEmptyObjectArgToUndefined<(Parameters<
			Routes[K]["func"]
		>[0]["request"] extends { json: () => Promise<infer T>; }
			? IsNull<T> extends false
			? {
				RequestObject: T;
			}
			: {}
			: {}) &
			(IsNull<Parameters<Routes[K]["func"]>[1]> extends false
				? {
					UrlArgs: Parameters<Routes[K]["func"]>[1];
				}
				: {})>
	};

// Use for typing API Response in frontend
export type APIResponse<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[K in keyof Routes as ConcatStrings<Mount, Extract<K, string>, ".">]:
		Routes[K]["func"] extends (...args: any[]) => Promise<infer T> ? T : undefined;
	};
