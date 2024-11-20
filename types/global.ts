import type { JSX } from "solid-js";

export type DOMElement = Element | JSX.Element;

export type AnyRecord = Record<string, any>;

export type SitemapItem = {
	loc: string;
	lastmod: string;
	changefreq: string;
	priority: string;
};
