import type { EcoComponent } from '@ecopages/core';
import { type BundledLanguage, type BundledTheme, codeToHtml } from 'shiki';

export const CodeBlock: EcoComponent<{
  children?: string;
  htmlString?: string;
  lang?: BundledLanguage;
  theme?: BundledTheme;
}> = async ({ children, htmlString, lang = 'typescript', theme = 'dracula' }) => {
  const safeHtml = await codeToHtml(children || htmlString || '', {
    lang,
    theme,
  });

  return <div class="code-block">{safeHtml}</div>;
};

CodeBlock.config = { importMeta: import.meta, dependencies: { stylesheets: ['./code-block.css'] } };
