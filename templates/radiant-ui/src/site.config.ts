/**
 * The one file to edit first.
 *
 * Everything here is content, not code: the layout reads it to build the header
 * and footer, and the pages read it for copy. Change these values and the whole
 * site follows — no component edits needed.
 */

export type SiteNavLink = {
	label: string;
	href: string;
};

export type SiteFooterLink = SiteNavLink & {
	external?: boolean;
};

export type SiteFooterColumn = {
	title: string;
	links: SiteFooterLink[];
};

export const site: {
	name: string;
	description: string;
	nav: SiteNavLink[];
	footer: { columns: SiteFooterColumn[]; legal: string };
} = {
	name: 'Ecopages',
	/** Used as the default meta description and in the footer. */
	description: 'A static-first foundation for expressive pages and islands of interactivity.',

	/** Primary navigation, shown in the header bar and its compact panel. */
	nav: [
		{ label: 'Components', href: '/components' },
		{ label: 'Forms', href: '/forms' },
		{ label: 'Dashboard', href: '/dashboard' },
		{ label: 'Docs', href: '/about' },
	],

	footer: {
		columns: [
			{
				title: 'Product',
				links: [
					{ label: 'Components', href: '/components' },
					{ label: 'Forms', href: '/forms' },
					{ label: 'Dashboard', href: '/dashboard' },
				],
			},
			{
				title: 'Learn',
				links: [
					{ label: 'Introduction', href: '/about' },
					{ label: 'Image pipeline', href: '/image' },
				],
			},
			{
				title: 'Community',
				links: [
					{ label: 'Ecopages', href: 'https://ecopages.app', external: true },
					{ label: 'Radiant UI', href: 'https://radiant-ui.ecopages.app', external: true },
					{ label: 'GitHub', href: 'https://github.com/ecopages/ecopages', external: true },
				],
			},
		],
		legal: `© ${new Date().getFullYear()} Ecopages. MIT licensed.`,
	},
};
