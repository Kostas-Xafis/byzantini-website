import type { IsAny, OptionalBy } from "./helpers";
import type { ArgumentParts, ExpectedArguments, ExtractURLMethod, GetURLMethod, HasUrlParams, Parts } from "./path";
import type { AnyZodObject, z } from "zod";

type IsZodObject<T> = T extends (infer K)[] ? IsZodObject<K> : T extends AnyZodObject ? true : false;

export type HTTPMethods = "GET" | "POST" | "PUT" | "DELETE";

export type DefaultEndpointResponse = { res: "error"; error: any } | { res: "message"; message: string };

export type EndpointResponse<T> = { res: "data"; data: T };

export type EndpointRoute<URL extends string, Req, Res = DefaultEndpointResponse> = (IsAny<URL> extends false
	? {
			authentication: boolean;
			method: GetURLMethod<URL>;
			path: ExtractURLMethod<URL>;
			hasUrlParams: HasUrlParams<URL>;
			func: HasUrlParams<URL> extends true
				? (
						req: Req extends null
							? Request
							: Omit<Request, "json"> & { json: () => Promise<Req extends AnyZodObject ? z.infer<Req> : Req> },
						slug: ExpectedArguments<ArgumentParts<Parts<URL>>>
				  ) => Promise<DefaultEndpointResponse | EndpointResponse<Res>>
				: (
						req: Req extends null
							? Request
							: Omit<Request, "json"> & { json: () => Promise<Req extends AnyZodObject ? z.infer<Req> : Req> }
				  ) => Promise<DefaultEndpointResponse | EndpointResponse<Res>>;
	  } & (IsZodObject<Req> extends true ? { validation: () => Req extends (infer R)[] ? R : Req } : {})
	: {
			// For default use case
			authentication: boolean;
			method: HTTPMethods;
			path: string;
			hasUrlParams: boolean;
			func: (
				req: Req extends null
					? Request
					: Omit<Request, "json"> & { json: () => Promise<Req extends AnyZodObject ? z.infer<Req> : Req> },
				slug: ExpectedArguments<ArgumentParts<Parts<URL>>>
			) => Promise<DefaultEndpointResponse | EndpointResponse<Res>>;
	  } & (IsZodObject<Req> extends true ? { validation: () => Req extends (infer R)[] ? R : Req } : {})) & {
	middleware?: ((req: Request) => Promise<Response | undefined>)[];
};

export type DefaultEndpointRoute<URL extends string, RequestObject = null> = EndpointRoute<URL, RequestObject>;

// Use for frontend types

type A = EndpointRoute<any, AnyZodObject, any>;

// Use for an type of routes, accessible in the frontend
export type APIEndpointsBuilder<Mount extends string, Routes extends { [k: string]: EndpointRoute<any, any, any> }> = {
	[K in keyof Routes as K extends `${infer k}` ? `${Mount}.${k}` : never]: Routes[K] extends { validation: () => AnyZodObject }
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
export type APIBuilder<Mount extends string, Routes extends { [k: string]: EndpointRoute<any, any, any> }> = {
	[m in Mount]: {
		[K in keyof Routes]: K extends `${infer k}` ? `${m}.${k}` : never;
	};
};

// Use for typing API Request params in the frontend
export type APIArguments<Mount extends string, Routes extends { [k: string]: EndpointRoute<any, any, any> }> = {
	[K in keyof Routes as K extends `${infer k}` ? `${Mount}.${k}` : ""]: OptionalBy<
		OptionalBy<
			{
				RequestObject: Parameters<Routes[K]["func"]>[0] extends { json: () => Promise<infer T> } ? T : never;
				UrlArgs: Parameters<Routes[K]["func"]>[1];
			},
			Parameters<Routes[K]["func"]>[0] extends { json: () => Promise<infer T> } ? (IsAny<T> extends true ? "RequestObject" : "") : ""
		>,
		Parameters<Routes[K]["func"]>[1] extends undefined ? "UrlArgs" : ""
	>;
};

// Use for typing API Response in frontend
export type APIResponse<Mount extends string, Routes extends { [k: string]: EndpointRoute<any, any, any> }> = {
	[K in keyof Routes as K extends `${infer k}` ? `${Mount}.${k}` : ""]: Routes[K]["func"] extends (...args: any[]) => Promise<infer T>
		? T
		: undefined;
};
