import { getPageConfig } from "root/lib/component-utils/get-page-config";
import BaseLayout from "@/layouts/base-layout"
import { PageWithBaseLayoutProps } from "@/types";

const asyncTitle = await new Promise<string>((resolve) => {
  setTimeout(() => {
    resolve("Async page " + new Date().toISOString());
  }, 1000);
})

export const { metadata, contextStylesheets, contextScripts } = getPageConfig({
  metadata: {
    title: asyncTitle,
    description: "This is the about me page of the website",
    image: "public/assets/images/bun-og.png",
    keywords: ["typescript", "framework", "static"],
  },
  components: [BaseLayout]
});;

export default function AboutMePage({ metadata, language }: PageWithBaseLayoutProps) {
  return (
    <BaseLayout.template
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <div class="banner">
        <h1 class="banner__title">Async Page</h1>
        <p>The metadata title is collected asyncronously</p>
        <p><i safe>{metadata.title}</i></p>
      </div>
    </BaseLayout.template>
  );
}
