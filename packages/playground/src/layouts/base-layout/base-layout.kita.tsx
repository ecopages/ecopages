import { Html, DepsManager, type EcoComponent } from "@eco-pages/core";
import { Navigation } from "@/components/navigation";

export type BaseLayoutProps = {
  children: Html.Children;
  class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
  return (
    <body>
      <Navigation
        items={[
          { label: "Home", url: "/" },
          { label: "Tailwind", url: "/labs/tailwind" },
          { label: "Async", url: "/labs/async" },
          { label: "Lite", url: "/labs/lite-context" },
        ]}
      />
      <main class={className}>{children}</main>
    </body>
  );
};

BaseLayout.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [Navigation],
});
