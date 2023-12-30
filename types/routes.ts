import type { ConcatStrings, IsAny, IsNull } from "./helpers";
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
	res: T extends string ?
	{
		type: "message";
		message: string;
	}
	: T extends {}
	? {
		type: "data";
		data: T;
	}
	: {
		type: "message";
		message: string;
	};
};
export type EndpointResponseError = {
	res: {
		type: "error";
		error: any;
	};
};


interface ContextRequest<Req extends {}> extends Omit<APIContext["request"], "json"> {
	json: () => Promise<Req extends AnyObjectSchema ? Output<Req> : Req>;
}

export interface Context<Req extends {}> extends APIContext {
	request: ContextRequest<Req>;
}

interface ValidationAttribute<Req> {
	validation: () => Req;
}

// Use for typing routes, accessible in the frontend
export type EndpointRoute<URL extends string, Req = null, Res = string> = (IsAny<URL> extends false
	? {
		authentication: boolean;
		method: HTTPMethods;
		path: URL;
		hasUrlParams: HasUrlParams<URL>;
		func: HasUrlParams<URL> extends true
		? (
			req: Req extends {}
				? Context<Req>
				: APIContext,
			slug: ExpectedArguments<ArgumentParts<Parts<URL>>>
		) => Promise<EndpointResponse<Res> | EndpointResponseError>
		: (
			req: Req extends {}
				? Context<Req>
				: APIContext
		) => Promise<EndpointResponse<Res> | EndpointResponseError>;
		middleware?: ((req: APIContext) => Promise<Response | undefined>)[];
	}
	: {
		// For default use case
		authentication: boolean;
		method: HTTPMethods;
		path: string;
		hasUrlParams: boolean;
		func: (req: Context<any>, slug: any) => Promise<any>;
		middleware?: ((req: APIContext) => Promise<Response | undefined>)[];
	}) & (IsValibotSchema<Req> extends true
		? ValidationAttribute<Req>
		: {});

// export type DefaultEndpointRoute<URL extends string, RequestObject = null> = EndpointRoute<URL, RequestObject>;

// Use for typing routes, accessible in the frontend
export type APIEndpointsBuilder<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[K in keyof Routes as ConcatStrings<Mount, Extract<K, string>, ".">]: {
			method: Routes[K]["method"];
			path: Routes[K]["path"];
			endpoint: ConcatStrings<Mount, Extract<K, string>, ".">;
		} & (Routes[K] extends ValidationAttribute<any> ? {
			validation: ReturnType<Routes[K]["validation"]>;
		} : {});
	};

// Use for an object of routes, accessible in the frontend
export type APIBuilder<Mount extends string, Routes extends {
	[k: string]: EndpointRoute<any, any, any>;
}> = {
		[m in Mount]: {
			[K in keyof Routes]: ConcatStrings<Mount, Extract<K, string>, ".">;
		};
	};

type ConvertEmptyObjectArgToUndefined<T> = T extends { [k: string]: never; } ? undefined : T;

// Use for typing API Request params in the frontend
export type APIArguments<Mount extends string, Routes extends {
	[k: string]: EndpointRoute<any, any, any>;
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
			(Routes[K]["hasUrlParams"] extends true
				? { UrlArgs: Parameters<Routes[K]["func"]>[1]; }
				: {})>
	};

// Use for typing API Response in frontend
export type APIResponse<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[K in keyof Routes as ConcatStrings<Mount, Extract<K, string>, ".">]:
		Routes[K] extends { func: (...args: any[]) => Promise<infer T>; } ? T : undefined;
	};
