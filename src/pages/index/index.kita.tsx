import { getPageConfig } from "root/lib/component-utils/get-page-config";
import Counter from "@/components/counter";
import BaseLayout from "@/layouts/base-layout"
import { PageWithBaseLayoutProps } from "@/types";

export const { metadata, contextStylesheets, contextScripts } = getPageConfig({
  metadata: {
    title: "Home page",
    description: "This is the homepage of the website",
    image: "public/assets/images/bun-og.png",
    keywords: ["typescript", "framework", "static"],
  },
  components: [BaseLayout, Counter]
});;

export default function HomePage({ metadata, language }: PageWithBaseLayoutProps) {
  return (
    <BaseLayout.template
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <h1 class="main-title">Home</h1>
      <Counter.template />
    </BaseLayout.template>
  );
}