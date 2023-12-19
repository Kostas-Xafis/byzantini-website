import type { IsAny, IsNull, PartialBy, ReplaceValue } from "./helpers";
import type {
	ArgumentParts,
	ExpectedArguments,
	ExtractURLMethod,
	GetURLMethod,
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

export type Context = ReplaceValue<
	APIContext,
	"request",
	ReplaceValue<
		APIContext["request"],
		"json",
		() => Promise<any extends AnyObjectSchema ? Output<AnyObjectSchema> : any>
	>
>;

// Use for typing routes, accessible in the frontend
export type EndpointRoute<URL extends string, Req = null, Res = string> = (IsAny<URL> extends false
	? {
		authentication: boolean;
		method: GetURLMethod<URL>;
		path: ExtractURLMethod<URL>;
		hasUrlParams: HasUrlParams<URL>;
		func: HasUrlParams<URL> extends true
		? (
			req: Req extends null
				? APIContext
				: ReplaceValue<
					APIContext,
					"request",
					ReplaceValue<
						APIContext["request"],
						"json",
						() => Promise<
							Req extends AnyObjectSchema ? Output<Req> : Req
						>
					>
				>,
			slug: ExpectedArguments<ArgumentParts<Parts<URL>>>
		) => Promise<EndpointResponse<Res>>
		: (
			req: Req extends null
				? APIContext
				: ReplaceValue<
					APIContext,
					"request",
					ReplaceValue<
						APIContext["request"],
						"json",
						() => Promise<
							Req extends AnyObjectSchema ? Output<Req> : Req
						>
					>
				>
		) => Promise<EndpointResponse<Res>>;
	} & (IsValibotSchema<Req> extends true
		? { validation: () => Req extends (infer R)[] ? R : Req; }
		: {})
	: {
		// For default use case
		authentication: boolean;
		method: HTTPMethods;
		path: string;
		hasUrlParams: boolean;
		func: (
			req: Req extends null
				? APIContext
				: ReplaceValue<
					APIContext,
					"request",
					ReplaceValue<
						APIContext["request"],
						"json",
						() => Promise<Req extends AnyObjectSchema ? Output<Req> : Req>
					>
				>,
			slug: ExpectedArguments<ArgumentParts<Parts<URL>>>
		) => Promise<EndpointResponse<Res>>;
	} & (IsValibotSchema<Req> extends true
		? { validation: () => Req extends (infer R)[] ? R : Req; }
		: {})) & {
			middleware?: ((req: APIContext) => Promise<Response | undefined>)[];
		};

// export type DefaultEndpointRoute<URL extends string, RequestObject = null> = EndpointRoute<URL, RequestObject>;

// Use for typing routes, accessible in the frontend
export type APIEndpointsBuilder<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[K in keyof Routes as K extends `${infer k}` ? `${Mount}.${k}` : never]: Routes[K] extends {
			validation: () => AnyObjectSchema;
		}
		? {
			method: Routes[K]["method"];
			path: Routes[K]["path"];
			endpoint: K extends `${infer k}` ? `${Mount}.${k}` : never;
			validation: ReturnType<Routes[K]["validation"]>;
		}
		: {
			method: Routes[K]["method"];
			path: Routes[K]["path"];
			endpoint: K extends `${infer k}` ? `${Mount}.${k}` : never;
		};
	};

// Use for an object of routes, accessible in the frontend
export type APIBuilder<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[m in Mount]: {
			[K in keyof Routes]: K extends `${infer k}` ? `${m}.${k}` : never;
		};
	};

// Use for typing API Request params in the frontend
export type APIArguments<Mount extends string, Routes extends {
	[k: string]: EndpointRoute<any, any, any>;
}> =
	{
		[K in keyof Routes as K extends `${infer k}` ? `${Mount}.${k}` : ""]: (Parameters<
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
			: {})
	};

// Use for typing API Response in frontend
export type APIResponse<
	Mount extends string,
	Routes extends { [k: string]: EndpointRoute<any, any, any>; }
> = {
		[K in keyof Routes as K extends `${infer k}`
		? `${Mount}.${k}`
		: ""]: Routes[K]["func"] extends (...args: any[]) => Promise<infer T> ? T : undefined;
	};

let a: HasUrlParams<"GET:/registrations"> = false;
