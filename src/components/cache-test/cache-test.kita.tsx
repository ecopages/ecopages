import { collectComponentDependencies, type EcoComponent } from "@eco-pages/core";

export type CacheTestProps = {
  extraText?: string;
};

export const CacheTest: EcoComponent<CacheTestProps> = ({ extraText }) => {
  return (
    <div class="cache-test">
      <h1>Cache Test {extraText}</h1>
    </div>
  );
};

CacheTest.dependencies = collectComponentDependencies({ importMeta: import.meta });
