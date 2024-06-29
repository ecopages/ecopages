import { Logo } from '@/components/logo';
import { Navigation, type NavigationProps } from '@/components/navigation';
import type { EcoComponent } from '@ecopages/core';

export type HeaderProps = {
  navigation: NavigationProps;
};

export const Header: EcoComponent<HeaderProps> = ({ navigation }) => {
  return (
    <header class="header">
      <div class="header__inner">
        <div class="header__inner-left-side">
          <Logo href="/" target="_self" title="Radiant" />
          <p class="version">v 0.1.0</p>
        </div>
        <Navigation {...navigation} />
      </div>
    </header>
  );
};

Header.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./header.css'],
    components: [Navigation, Logo],
  },
};
