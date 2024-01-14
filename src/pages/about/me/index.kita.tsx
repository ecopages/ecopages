
import { BaseLayout, BaseLayoutProps } from "@/includes/layouts/base-layout.kita";
import { Counter } from "@/components/counter";

type AboutMePageProps = Pick<BaseLayoutProps, "metadata"> & Partial<Pick<BaseLayoutProps, "language">>;

export const metadata = {
  title: "About me page",
  description: "This is the about me page of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

export const contextStylesheets = [Counter.stylesheet];

export const contextScripts = [Counter.script];

export default function AboutMePage({ metadata, language }: AboutMePageProps) {
  return (
    <BaseLayout
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <h1>Me</h1>
      <Counter />
    </BaseLayout>
  );
}
