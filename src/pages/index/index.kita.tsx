import { Counter } from "@/components/counter";
import { BaseLayout, BaseLayoutProps } from "../../includes/layouts/base-layout.kita";

type HomePageProps = Pick<BaseLayoutProps, "metadata"> & Partial<Pick<BaseLayoutProps, "language">>;

export const metadata = {
  title: "Home page",
  description: "This is the homepage of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

export const contextStylesheets = [Counter.stylesheet];

export const contextScripts = [Counter.script];

export default function HomePage({ metadata, language }: HomePageProps) {
  return (
    <BaseLayout
      metadata={metadata}
      language={language}
      stylesheets={contextStylesheets}
      scripts={contextScripts}
    >
      <h1 class="main-title">Home</h1>
      <Counter />
    </BaseLayout>
  );
}
