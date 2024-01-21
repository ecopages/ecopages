import { Counter } from "@/components/counter";
import { BaseLayout } from "@/layouts/base-layout";
import type { EcoComponent } from "@/types";
import { getComponentDependencies } from "root/lib/component-utils/get-component-config";

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

HomePage.dependencies = getComponentDependencies({
  importMeta: import.meta,
  components: [BaseLayout, Counter],
});

export default HomePage;
