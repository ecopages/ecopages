import { Burger } from '@/components/burger';
import { Logo } from '@/components/logo/logo';
import { Navigation, type NavigationProps } from '@/components/navigation';
import type { EcoComponent } from '@ecopages/core';
import rootJson from '../../../../../package.json';

export type HeaderProps = {
	navigation: NavigationProps;
	showBurger?: boolean;
};

export const Header: EcoComponent<HeaderProps> = ({ navigation, showBurger = false }) => {
	return (
		<header class="header">
			<div class="header__inner">
				<div class="header__inner-left">
					{showBurger ? <Burger class="md:hidden" /> : null}
					<Logo href="/" target="_self" title="Radiant" />
					<p class="version">v {rootJson.version}</p>
				</div>
				<Navigation {...navigation} />
			</div>
		</header>
	);
};

Header.config = {
	dependencies: {
		stylesheets: ['./header.css'],
		components: [Navigation, Logo, Burger],
	},
};
