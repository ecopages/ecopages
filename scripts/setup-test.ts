import { $ } from 'bun';

await $`bun run --filter '@ecopages/fixture' build | tee /dev/null`;
