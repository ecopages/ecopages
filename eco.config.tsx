
// import '@/components/wce-counter/wce-counter.lit'

export async function makeRoutes({ baseUrl }: { baseUrl: string }) {

  await import('@/components/wce-counter/wce-counter.lit')
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
        keywords: ["elysia", "javascript", "framework"],
      }}
        stylesheets={[`.main-title { color: red; font-size: 5rem; }`]}
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
        keywords: ["elysia", "javascript", "framework"],
      }}>
        <div>Contact page</div>
      </BaseLayout>
    }
  ]

}