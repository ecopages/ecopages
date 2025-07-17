import type { EcoComponent } from '@ecopages/core';
import { ApiField } from '@/components/api-field/api-field.kita';
import { CodeBlock } from '@/components/code-block/code-block.kita';
import { docsConfig } from '@/data/docs-config';
import { BaseLayout } from '@/layouts/base-layout';

export type DocsLayoutProps = {
  children: JSX.Element;
  class?: string;
};

const DocsNavigation = () => {
  return (
    <nav aria-label="Main Navigation">
      <ul>
        {docsConfig.documents.map((group) => (
          <li>
            <span class="docs-layout__nav-group" safe>
              {group.name}
            </span>
            <ul class="docs-layout__nav-group-list">
              {group.pages.map((page) => (
                <li>
                  <a
                    href={
                      group.subdirectory
                        ? `${docsConfig.settings.rootDir}/${group.subdirectory}/${page.slug}`
                        : `${docsConfig.settings.rootDir}/${page.slug}`
                    }
                    safe
                  >
                    {page.title}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export const DocsLayout: EcoComponent<DocsLayoutProps> = ({ children }) => {
  return (
    <BaseLayout class="docs-layout prose">
      <>
        <radiant-navigation class="docs-layout__aside hidden md:block">
          <DocsNavigation />
        </radiant-navigation>
        <div class="docs-layout__content">{children}</div>
      </>
    </BaseLayout>
  );
};

DocsLayout.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./docs-layout.css'],
    scripts: ['./docs-layout.script.ts'],
    components: [BaseLayout, CodeBlock, ApiField],
  },
};
