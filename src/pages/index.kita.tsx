import { collectComponentDependencies, importFresh, type EcoComponent } from "@eco-pages/core";
import { BaseLayout } from "@/layouts/base-layout";
// import { Counter } from "@/components/counter";
import { CacheTest } from "@/components/cache-test";
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
        <CacheTest extraText="Hola" />
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = collectComponentDependencies({
  importMeta: import.meta,
  components: [BaseLayout, Counter, CacheTest],
});

export default HomePage;
