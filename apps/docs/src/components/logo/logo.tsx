import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type LogoProps = Partial<Pick<HTMLAnchorElement, 'href' | 'target' | 'title'>> & {
	children?: JsxRenderable;
};

export const Logo = eco.component<LogoProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./logo.css'],
	},
	render: ({ children = 'ecopages', href, target, title }) => {
		return (
			<a
				href={href}
				target={target}
				title={title}
				class="flex gap-1 items-center text-2xl font-semibold font-heading"
			>
				<svg height="32" viewBox="0 0 35 42" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path
						d="M8.95038 19.0355C8.73635 19.7972 10.4934 24.8245 18.2298 23.3884C25.3299 22.0704 24.7298 10.8884 18.2298 13.8884C14.2596 15.7208 12.2883 33.409 22.2298 31.8884C29.9216 30.7119 28.75 6.88572 31.434 1.38842C28.4393 4.49823 5.89504 5.06009 2.22981 17.8884C1.27183 21.2414 3.22979 26.8884 8.95036 28.3884L2.22981 38.3884"
						stroke="currentColor"
						stroke-width="4"
						stroke-linecap="round"
					/>
				</svg>

				{children}
			</a>
		);
	},
});
