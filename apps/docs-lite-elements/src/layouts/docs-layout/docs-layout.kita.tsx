import { docsConfig } from '@/docs/config';
import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent } from '@eco-pages/core';

export type DocsLayoutProps = {
  children: Html.Children;
  class?: string;
};

export const DocsLayout: EcoComponent<DocsLayoutProps> = ({ children }) => {
  return (
    <BaseLayout class="docs-layout prose">
      <aside class="docs-layout__aside">
        <nav>
          <ul>
            {docsConfig.map((group) => (
              <li>
                <span class="docs-layout__nav-group" safe>
                  {group.name}
                </span>
                <ul class="ml-4 mt-2 mb-8">
                  {group.pages.map((page) => (
                    <li>
                      <a safe href={page.path}>
                        {page.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div class="docs-layout__content">{children}</div>
    </BaseLayout>
  );
};

DocsLayout.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});
