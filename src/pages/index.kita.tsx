import { DepsManager, type EcoComponent } from "@eco-pages/core";
import { BaseLayout } from "@/layouts/base-layout";
import { Counter } from "@/components/counter";
import { LiteCounter } from "@/components/lite-counter";
import { ScriptInjector } from "@/components/script-injector";

export const metadata = {
  title: "Home page",
  description: "This is the homepage of the website",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static"],
};

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <>
        <h1 class="main-title">Home</h1>
        <ScriptInjector
          on:interaction="mouseenter,focusin"
          scripts={DepsManager.extract(Counter, "scripts").join()}
        >
          <Counter />
        </ScriptInjector>
        <ScriptInjector
          on:interaction="mouseenter,focusin"
          scripts={DepsManager.extract(LiteCounter, "scripts").join()}
        >
          <LiteCounter count={5} />
        </ScriptInjector>
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [
    BaseLayout,
    DepsManager.filter(Counter, "stylesheets"),
    DepsManager.filter(LiteCounter, "stylesheets"),
  ],
});

export default HomePage;
