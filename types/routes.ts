import type { APIContext } from "astro";
import type { ObjectSchema, ObjectShape, Output } from "valibot";
import type { ConcatStrings, IsAny, RemoveNullishFields, RemovePartial } from "./helpers";
import type { ExpectedArguments, HasUrlParams } from "./path";

export type HTTPMethods = "GET" | "POST" | "PUT" | "DELETE";
export type AnyObjectSchema = ObjectSchema<ObjectShape, any>;
export type EndpointResponse<T = string> = {
	res: T extends {}
	? T extends string ? {
		type: "message";
		message: string;
	}
	: {
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
export type DefaultEndpointResponse<T = any> = EndpointResponse<T> | EndpointResponseError;

interface ContextRequest<Req> extends Omit<APIContext["request"], "json"> {
	json: () => Promise<Req extends AnyObjectSchema ? Output<Req> : Req>;
}
export interface Context<Req> extends APIContext {
	request: ContextRequest<Req>;
}

type IsValibotSchema<T> = T extends (infer K)[]
	? IsValibotSchema<K>
	: T extends AnyObjectSchema
	? true
	: false;

type DefaultEndpointRoute<Req = AnyObjectSchema> = {
	// For default use case
	authentication: boolean;
	method: HTTPMethods;
	path: string;
	hasUrlParams: boolean;
	func?: (arg: { ctx: Context<any>, slug: any; }) => Promise<DefaultEndpointResponse<any>>;
	middleware?: ((req: APIContext) => Promise<Response | undefined>)[];
	validation?: IsValibotSchema<Req> extends true ? () => Req : undefined;
};

// Use for typing routes, accessible in the backend
export type EndpointRoute<URL extends string, Req = any, Res = string> = (IsAny<URL> extends false
	? {
		authentication: boolean;
		method: HTTPMethods;
		path: URL;
		hasUrlParams: HasUrlParams<URL>;
		func?: (arg: { ctx: Context<Req>; slug: ExpectedArguments<URL>; }) => Promise<DefaultEndpointResponse<Res>>;
		middleware?: ((req: APIContext) => Promise<Response | undefined>)[];
		validation: IsValibotSchema<Req> extends true ? () => Req : undefined;
	} : DefaultEndpointRoute<Req>);

export type AnyEndpoint = EndpointRoute<any, any> | EndpointRoute<any, AnyObjectSchema>;


// Use for typing routes, accessible in the frontend
export type APIEndpointsBuilder<
	Mount extends string,
	Routes extends Record<string, AnyEndpoint>
> = {
		[K in keyof Routes as ConcatStrings<Mount, K & string, ".">]: {
			method: Routes[K]["method"];
			path: Routes[K]["path"];
			endpoint: ConcatStrings<Mount, K & string, ".">;
			hasUrlParams: Routes[K]["hasUrlParams"];
			validation: Routes[K] extends { validation: () => AnyObjectSchema; } ? AnyObjectSchema : undefined;
		}
	};

// Use for an object of routes, accessible in the frontend
export type APIBuilder<Mount extends string, Routes extends Record<string, any>> = {
	[m in Mount]: {
		[K in keyof Routes]: ConcatStrings<Mount, K & string, ".">;
	};
};

// type ConvertEmptyObjectArgToUndefined<T> = T extends { [k: string]: never; } ? undefined : T;

// Use for typing API Request params in the frontend
export type APIArguments<Mount extends string, Routes extends Record<string, AnyEndpoint>> =
	{
		[K in keyof Routes as ConcatStrings<Mount, K & string, ".">]: RemoveNullishFields<{
			RequestObject: Parameters<
				RemovePartial<Routes[K], "func">["func"]
			>[0]["ctx"]["request"] extends { json: () => Promise<infer T>; }
			? IsAny<T> extends false
			? T
			: undefined
			: undefined;
			UrlArgs: Routes[K]["hasUrlParams"] extends true ? Parameters<RemovePartial<Routes[K], "func">["func"]>[0]["slug"] : undefined;
		}>;
	};



type ExtractData<T extends DefaultEndpointResponse<{}>> = Extract<T, EndpointResponse<{}>>["res"]["data"];
// Use for typing API Response in frontend
export type APIResponse<
	Mount extends string,
	Routes extends Record<string, AnyEndpoint>
> = {
		[K in keyof Routes as ConcatStrings<Mount, K & string, ".">]:
		RemovePartial<Routes[K], "func">["func"] extends (...args: any) => Promise<infer T> ? T extends DefaultEndpointResponse ? ExtractData<T> : string : string;
	};
