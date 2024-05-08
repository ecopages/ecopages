import { CodeBlock } from '@/components/code-block/code-block.kita';
import { docsConfig } from '@/data/docs-config';
import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent } from '@eco-pages/core';

export type DocsLayoutProps = {
  children: Html.Children;
  class?: string;
};

const DocsNavigation = () => {
  return (
    <nav>
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
      <aside class="docs-layout__aside">
        <DocsNavigation />
      </aside>
      <div class="docs-layout__content">{children}</div>
    </BaseLayout>
  );
};

DocsLayout.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, CodeBlock],
});
