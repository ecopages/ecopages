import { getPageConfig } from "root/lib/component-utils/get-page-config";
import BaseLayout from "@/layouts/base-layout"
import { PageWithBaseLayoutProps } from "@/types";

export const { metadata, contextStylesheets, contextScripts } = getPageConfig({
  metadata: {
    title: "Labs page",
    description: "This is the a page to do experiments",
    image: "public/assets/images/bun-og.png",
    keywords: ["typescript", "framework", "static"],
  },
  components: [BaseLayout]
});

export default function AboutPage({ metadata, language }: PageWithBaseLayoutProps) {
  return (
    <BaseLayout.template
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <h1>Labs</h1>
    </BaseLayout.template>
  );
}
