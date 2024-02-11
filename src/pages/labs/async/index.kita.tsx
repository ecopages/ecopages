import { DepsManager, type EcoComponent } from "@eco-pages/core";
import { BaseLayout } from "@/layouts/base-layout";
import type { ErrorBoundaryProps } from "@kitajs/html/error-boundary";

export const metadata = {
  title: "Async Page",
  description: "This is the about me page of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

const LabsAsyncPage: EcoComponent = async () => {
  try {
    const asyncTitle = await new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve("Async page " + new Date().toISOString());
      }, 2000);
    });
    return (
      <BaseLayout>
        <div class="banner">
          <h1 class="banner__title">Async Page</h1>
          <p>The text below is collected asyncronously</p>
          <p>
            <i safe>{asyncTitle}</i>
          </p>
        </div>
      </BaseLayout>
    );
  } catch (error: any) {
    return <div>Error: {error.stack as "safe"}</div>;
  }
};

LabsAsyncPage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});

export default LabsAsyncPage;
