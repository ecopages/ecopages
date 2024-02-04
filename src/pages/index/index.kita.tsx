// import { Counter } from "@/components/counter";
import { BaseLayout } from "@/layouts/base-layout";
import type { EcoComponent } from "root/lib/eco-pages.types";
import { collectComponentDependencies } from "root/lib/component-utils/collect-component-dependencies";
import { importFresh } from "root/lib/scripts/build/utils/cache";
const { Counter } = await importFresh("@/components/counter");

export const metadata = {
  title: "Home page",
  description: "This is the homepage of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout>
      <>
        <h1 class="main-title">Home</h1>
        <Counter />
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = collectComponentDependencies({
  importMeta: import.meta,
  components: [BaseLayout, Counter],
});

export default HomePage;
