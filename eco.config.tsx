export async function makeRoutes({ baseUrl }: { baseUrl: string }) {
  const { default: HomePage, metadata: homepageMetadata } = await import("@/pages/index/index.page")
  const { BaseLayout } = await import("@/includes/layouts/base.layout")

  return [
    {
      path: "/",
      html: <HomePage metadata={homepageMetadata} />
    },
    {
      path: "/about",
      html: <BaseLayout metadata={{
        title: "About page",
        description: "This is the about page of the website",
        image: baseUrl + "public/assets/images/bun-og.png",
        keywords: ["typescript", "framework", "static"],
      }}
      >
        <div class="main-title">About page</div>
      </BaseLayout>
    },
    {
      path: "/contact",
      html: <BaseLayout metadata={{
        title: "Contact page",
        description: "This is the contact page of the website",
        image: baseUrl + "public/assets/images/bun-og.png",
        keywords: ["typescript", "framework", "static"],
      }}>
        <div>Contact page</div>
      </BaseLayout>
    }
  ]
}

