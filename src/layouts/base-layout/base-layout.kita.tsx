import { Html } from "root/lib/global/kita";
import { Navigation } from "@/components/navigation";
import { collectComponentDependencies } from "root/lib/component-utils/collect-component-dependencies";
import type { EcoComponent } from "root/lib/eco-pages.types";

export type BaseLayoutProps = {
  children: Html.Children;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children }) => {
  return (
    <body>
      <Navigation
        items={[
          { label: "Home", url: "/" },
          { label: "Labs", url: "/labs" },
          { label: "Async", url: "/labs/async" },
        ]}
      />
      <main>{children}</main>
    </body>
  );
};

BaseLayout.dependencies = collectComponentDependencies({
  importMeta: import.meta,
  components: [Navigation],
});
