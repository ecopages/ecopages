import { BaseLayout } from "@/layouts/base-layout";
import type { EcoComponent } from "root/lib/eco-pages.types";
import { collectComponentDependencies } from "root/lib/component-utils/collect-component-dependencies";

const asyncTitle = await new Promise<string>((resolve) => {
  setTimeout(() => {
    resolve("Async page " + new Date().toISOString());
  }, 5);
});

export const metadata = {
  title: asyncTitle,
  description: "This is the about me page of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

const LabsAsyncPage: EcoComponent = () => {
  return (
    <BaseLayout>
      <div class="banner">
        <h1 class="banner__title">Async Page</h1>
        <p>The metadata title is collected asyncronously</p>
        <p>
          <i safe>{metadata.title}</i>
        </p>
      </div>
    </BaseLayout>
  );
};

LabsAsyncPage.dependencies = collectComponentDependencies({
  importMeta: import.meta,
  components: [BaseLayout],
});

export default LabsAsyncPage;
