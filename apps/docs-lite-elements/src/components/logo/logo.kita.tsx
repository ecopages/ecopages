import { DepsManager, type EcoComponent } from '@eco-pages/core';

export type LogoProps = Pick<HTMLAnchorElement, 'href' | 'target' | 'title'>;

export const Logo: EcoComponent<LogoProps> = (props) => {
  return (
    <a class="logo" {...props}>
      Lite Elements
    </a>
  );
};

Logo.dependencies = DepsManager.collect({ importMeta: import.meta });
