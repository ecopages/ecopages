import { Html, collectComponentDependencies, type EcoComponent } from "@eco-pages/core";
import { Navigation } from "@/components/navigation";

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
