// Renders the two inline marks the editorial content may use — **bold** and
// [label](/path/) — to HTML. Everything else is escaped, and only site-relative
// or https links survive, so the copy can never inject markup.

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const LINK_CLASS = "font-semibold text-red-900 underline decoration-red-900/30 underline-offset-[3px] transition-colors hover:decoration-red-900";

export function renderInline(text: string): string {
	return escapeHtml(text)
		.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-red-950">$1</strong>')
		.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
			const external = href.startsWith("https://");
			if (!external && !href.startsWith("/")) return label;
			return `<a href="${href}" class="${LINK_CLASS}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
		});
}

// The same text without marks, for meta tags and JSON-LD.
export const plainInline = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");
