import { DepsManager, Html, type EcoComponent, type Error404TemplateProps } from "@eco-pages/core";
import HtmlTemplate from "./html.kita";
import { BaseLayout } from "@/layouts/base-layout";

const Error404: EcoComponent<Error404TemplateProps> = ({
  message,
  stack,
  ...htmlTemplateProps
}) => {
  return (
    <HtmlTemplate {...htmlTemplateProps}>
      <BaseLayout>
        <div class="error404">
          <h1>404 - Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </div>
      </BaseLayout>
    </HtmlTemplate>
  );
};

Error404.dependencies = DepsManager.import({
  importMeta: import.meta,
  stylesheets: ["./error404.css"],
  components: [BaseLayout],
});

export default Error404;
