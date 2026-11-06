import type { JsxRenderable } from '@ecopages/jsx';
import { RuiChip } from '@ecopages/radiant-ui/chip';
import { Burger } from '@/components/burger';
import { Logo } from '@/components/logo/logo';
import { Navigation, type NavigationProps } from '@/components/navigation';
import { frameworkVersion } from '@/lib/framework-version';
import './header.css';

export type HeaderProps = {
	navigation: NavigationProps;
	showBurger?: boolean;
};

export function Header({ navigation, showBurger = false }: HeaderProps): JsxRenderable {
	return (
		<header class="header">
			<div class="header__inner">
				<div class="header__inner-left">
					{showBurger ? <Burger class="md:hidden" /> : null}
					<Logo href="/" target="_self" title="Ecopages" />
					<RuiChip variant="default" class="max-md:hidden">
						{frameworkVersion}
					</RuiChip>
				</div>
				<Navigation {...navigation} />
			</div>
		</header>
	);
}
