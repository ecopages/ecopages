import type { PageProps } from "@eco-pages/core";

export default function BlogPost({ params, query }: PageProps) {
  return (
    <div>
      <h1 safe>
        Blog Post {params?.slug} {JSON.stringify(query || [])}
      </h1>
    </div>
  );
}
