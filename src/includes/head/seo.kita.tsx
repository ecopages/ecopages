export type MetadataProps = {
  title: string;
  description: string;
  image?: string;
  url?: string;
  keywords?: string[];
};

export function SeoHead({
  title,
  description,
  image = "/public/assets/images/bun-og.webp",
  url,
  keywords,
}: MetadataProps) {
  return (
    <>
      <title safe>{title}</title>
      <meta name="description" content={description} />
      {keywords ? ((<meta name="keywords" content={keywords.join(",")} />) as "safe") : null}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {url ? ((<link rel="canonical" href={url} />) as "safe") : null}
    </>
  );
}
