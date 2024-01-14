import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { getContentType, getSafePath } from "./src/utilities/server";
import { DIST_FOLDER } from "./eco.constants";
import { hmr } from "@gtrabanco/elysia-hmr-html";
import compressible from "compressible";

export const app = new Elysia()
  .use(
    hmr({
      prefixToWatch: DIST_FOLDER,
    })
  )
  .use(staticPlugin({ alwaysStatic: true, assets: DIST_FOLDER }))
  .get("*", async ({ request }) => {
    const url = new URL(request.url);
    const safePath = getSafePath(url.pathname);
    const contentType = getContentType(safePath);

    const shouldCompress = contentType.includes("javascript") || contentType.includes("css");
    const fileName = shouldCompress ? `${safePath}.gz` : safePath;

    const file = Bun.file(DIST_FOLDER + fileName);

    if (!file.exists) return new Response("404", { status: 404 });

    const headers: {
      [key: string]: string;
    } = {
      "Content-Type": contentType,
    }

    if (shouldCompress) {
      headers["Content-Encoding"] = "gzip";
    }

    const arrbuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrbuf);


    return new Response(buffer, { headers });
  })
  .onError(({ code }) => {
    if (code === "NOT_FOUND") return "Route not found :(";
  })
  .listen(process.env.PORT || 3000);

console.log(`🌿 Server is running at ${app.server?.hostname}:${app.server?.port}`);
