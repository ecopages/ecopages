import type { EcoComponent } from '@ecopages/core';

export type LogoProps = Pick<HTMLAnchorElement, 'href' | 'target' | 'title'>;

export const Logo: EcoComponent<LogoProps> = (props) => {
	return (
		<a class="logo" {...props}>
			Ecopages
		</a>
	);
};

Logo.config = {
	dependencies: {
		stylesheets: ['./logo.css'],
	},
};
