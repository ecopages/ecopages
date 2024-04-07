import type { PageProps } from "@/eco-pages";

export default function BlogPost({ params, query }: PageProps) {
  return (
    <p safe>
      {JSON.stringify(params || [])} {JSON.stringify(query || [])}
    </p>
  );
}
