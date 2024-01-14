import { BaseLayout, BaseLayoutProps } from "@/includes/layouts/base-layout.kita";
import { Counter } from "@/components/counter";

type AboutPageProps = Pick<BaseLayoutProps, "metadata"> & Partial<Pick<BaseLayoutProps, "language">>;

export const metadata = {
  title: "About page",
  description: "This is the about page of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

export const contextStylesheets = [Counter.stylesheet];

export const contextScripts = [Counter.script];

export default function AboutPage({ metadata, language }: AboutPageProps) {
  return (
    <BaseLayout
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <h1>About</h1>
      <Counter />
    </BaseLayout>
  );
}
