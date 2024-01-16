import { getPageConfig } from "root/lib/component-utils/get-page-config";
import BaseLayout from "@/layouts/base-layout";
import { PageWithBaseLayoutProps } from "@/types";

export const { metadata, contextStylesheets, contextScripts } = getPageConfig({
  metadata: {
    title: "Labs page",
    description: "This is the a page to do experiments",
    image: "public/assets/images/bun-og.png",
    keywords: ["typescript", "framework", "static"],
  },
  components: [BaseLayout],
});

export default function LabsPage({ metadata, language }: PageWithBaseLayoutProps) {
  return (
    <BaseLayout.template
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <div class="banner">
        <h1 class="banner__title inline-flex items-center gap-4">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
          </span>
          Labs Page
        </h1>
        <p>
          in this page styles are applied using tailwindcss on the{" "}
          <span class="text-red-500 font-bold">markup</span>.
        </p>
        <p>Please note the preferred way is to use it following the scaffolding pattern using "my-component.styles.css" and the "@apply" directive.</p>
      </div>
    </BaseLayout.template>
  );
}
