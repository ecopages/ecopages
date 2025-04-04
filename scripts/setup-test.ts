import { $ } from 'bun';
import { bunPostCssLoader } from '../packages/loaders/bun-postcss-loader/src/bun-postcss-loader';

Bun.plugin(bunPostCssLoader());

await $`bun run --filter '@ecopages/fixture' build | tee /dev/null`;
