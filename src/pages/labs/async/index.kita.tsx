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
      <div class="flex flex-col gap-2 p-2 bg-slate-100 border-l-4 border-l-slate-500">
        <h1 class="text-2xl font-bold">Async Page</h1>
        <p>The metadata title is collected async.</p>
        <p>Styles are applied using tailwindcss on the <span class="text-red-500 font-bold">markup</span></p>
      </div>
    </BaseLayout.template>
  );
}
