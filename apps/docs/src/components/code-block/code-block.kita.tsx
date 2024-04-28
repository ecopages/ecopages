import type { EcoComponent } from '@eco-pages/core';
import { type BundledLanguage, type BundledTheme, codeToHtml } from 'shiki';

export const CodeBlock: EcoComponent<{ children: string; lang?: BundledLanguage; theme?: BundledTheme }> = async ({
  children,
  lang = 'typescript',
  theme = 'vitesse-dark',
}) => {
  const safeHtml = await codeToHtml(children, {
    lang,
    theme,
  });

  return (
    <div class="my-8 rounded-md [&_pre.shiki]:col-span-4 [&_pre.shiki]:col-start-2 [&_pre.shiki]:whitespace-pre-wrap [&_pre.shiki]:p-4 [&_pre.shiki]:rounded-md">
      {safeHtml}
    </div>
  );
};
