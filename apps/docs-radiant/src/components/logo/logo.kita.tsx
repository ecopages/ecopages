import { DepsManager, type EcoComponent } from '@ecopages/core';

export type LogoProps = Pick<HTMLAnchorElement, 'href' | 'target' | 'title'>;

export const Logo: EcoComponent<LogoProps> = (props) => {
  return (
    <a class="logo" {...props}>
      Radiant
    </a>
  );
};

Logo.dependencies = DepsManager.collect({ importMeta: import.meta });
