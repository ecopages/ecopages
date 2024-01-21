import { Html } from "root/lib/global/kita";
import { Navigation } from "@/components/navigation";
import { getComponentDependencies } from "root/lib/component-utils/get-component-config";
import type { EcoComponent } from "@/types";

export type BaseLayoutProps = {
  children: JSX.Element;
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

BaseLayout.dependencies = getComponentDependencies({
  importMeta: import.meta,
  components: [Navigation],
});
