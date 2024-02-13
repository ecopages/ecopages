import { DepsManager, type EcoComponent } from "@eco-pages/core";
import { BaseLayout } from "@/layouts/base-layout";
import { LitePkgContext } from "@/components/lite-pkg-context";
import { LitePkgConsumer } from "@/components/lite-pkg-consumer";

export const metadata = {
  title: "Lite Element",
  description: "Testing lite element with Kita",
  image: "public/assets/images/bun-og.png",
  keywords: ["typescript", "framework", "static", "lite-element"],
};

const dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, LitePkgContext, LitePkgConsumer],
});

const CONTEXT_ID = "eco-pages";

const LiteElement: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <LitePkgContext contextId={CONTEXT_ID}>
        <>
          <LitePkgConsumer contextId={CONTEXT_ID} />
          <LitePkgConsumer contextId={CONTEXT_ID} />
        </>
      </LitePkgContext>
    </BaseLayout>
  );
};

LiteElement.dependencies = dependencies;

export default LiteElement;
