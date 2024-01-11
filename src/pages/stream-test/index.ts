import { html } from "lit";
import { RenderPageStream } from "../../generators/render-page-stream";
import { Navigation } from "@/components/navigation/navigation";

const streamTestPage: RenderPageStream = {
  metadata: {
    title: "Stream",
    description: "Page rendered with stream",
  },
  headContent: [],
  bodyElements: [
    {
      element: Navigation,
      kind: "jsx",
    },
    {
      element: html`<wce-counter counterText="Count" count=${1}></wce-counter>`,
      kind: "lit",
      options: {
        lazy: {
          enabled: true,
          script: "/public/js/components/wce-counter/wce-counter.lit.js",
        },
      },
    },
  ],
};

export default streamTestPage;
