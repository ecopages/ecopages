import type { EcoComponent } from '@ecopages/core';

export type LogoProps = Pick<HTMLAnchorElement, 'href' | 'target' | 'title'>;

export const Logo: EcoComponent<LogoProps> = (props) => {
  return (
    <a class="logo" {...props}>
      Radiant
    </a>
  );
};

Logo.config = { importMeta: import.meta, dependencies: { stylesheets: ['./logo.css'] } };
