import { Html } from "@elysiajs/html";
import { LitRenderer } from "../../components/lit-string-renderer";
import { html } from "lit";
import { BaseLayout, BaseLayoutProps } from "../../includes/layouts/base.layout";
import { createStylesheets } from "macros/stylesheets.macro"  with { type: 'macro' };

export const metadata = {
  title: "Home page",
  description: "This is the homepage of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["elysia", "javascript", "framework"],
}
const stylesheets = await createStylesheets({ paths: ['@/src/pages/index/index.styles.css'] });

export default function HomePage({
  headContent,
  metadata,
  language
}: Pick<BaseLayoutProps, 'metadata'> & Partial<Pick<BaseLayoutProps, 'headContent' | 'language'>>) {
  return (
    <BaseLayout metadata={metadata} headContent={headContent} language={language} stylesheets={stylesheets}>
      <h1 class="main-title">Home</h1>
      <LitRenderer on:visible import="/public/js/components/wce-counter/wce-counter.lit.js"
        element={html`<wce-counter></wce-counter>`}
      />
    </BaseLayout>
  )
}