import { getContextDependencies } from "root/lib/component-utils/get-context-dependencies";
import BaseLayout from "@/layouts/base-layout"
import { PageWithBaseLayoutProps } from "@/types";

export const metadata = {
  title: "About page",
  description: "This is the about page of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

const { contextStylesheets, contextScripts } = getContextDependencies([BaseLayout]);

export default function AboutPage({ metadata, language }: PageWithBaseLayoutProps) {
  return (
    <BaseLayout.template
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <h1>About</h1>
    </BaseLayout.template>
  );
}
