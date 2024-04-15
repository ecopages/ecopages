import type { PageProps } from '@eco-pages/core';

export default function IndexPage({ query }: PageProps) {
  return <p safe>Hello, world!{JSON.stringify(query || [])}</p>;
}
