import { ICON_STROKE, iconContent, type IconName } from "@lib/icons";
import { splitProps, type JSX } from "solid-js";

export type IconProps = Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "class"> & {
	name: IconName;
	class?: string;
	/** Accessible name; without it the icon is decorative (`aria-hidden`). */
	title?: string;
	/** Width and height; default `1em`. */
	size?: number | string;
	/** Rotate continuously (stops under reduced motion). */
	spin?: boolean;
};

/**
 * An icon of the site's set (lib/icons.ts). Decorative by default; give it a `title` when it carries meaning
 * on its own. The attributes mirror `iconAttributes` (written out so every prop stays reactive).
 */
export default function Icon(props: IconProps) {
	const [own, rest] = splitProps(props, ["name", "class", "title", "size", "spin"]);
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={own.size ?? "1em"}
			height={own.size ?? "1em"}
			fill="none"
			stroke="currentColor"
			stroke-width={ICON_STROKE}
			stroke-linecap="round"
			stroke-linejoin="round"
			class={"icon" + (own.class ? " " + own.class : "") + (own.spin ? " animate-spin motion-reduce:animate-none" : "")}
			role={own.title ? "img" : undefined}
			aria-hidden={own.title ? undefined : "true"}
			{...rest}
			innerHTML={iconContent(own.name, own.title)}
		/>
	);
}
