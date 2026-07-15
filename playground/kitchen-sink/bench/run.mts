import { fileURLToPath } from 'node:url';
import { run } from 'mitata';
import { shouldRunBench, writeMitataBenchReport, MITATA_BENCH_JSON } from './lib/mitata-report';
import { registerBuildBench } from './build-bench';
import { registerBuildSpeedBench } from './build-speed-bench';
import { registerHeavyBench } from './heavy-bench';
import { registerHmrBench } from './hmr-bench';
import { registerIntegrationBench } from './integration-bench';
import { registerMemorySnapBench } from './memory-snap-bench';
import { registerStaticBuildBench } from './static-build-bench';

const KITCHEN_SINK_DIR = fileURLToPath(new URL('..', import.meta.url));

/** @remarks Lit SSG and other integrations resolve app deps from the kitchen-sink package root. */
if (process.cwd() !== KITCHEN_SINK_DIR) {
	process.chdir(KITCHEN_SINK_DIR);
}

if (!shouldRunBench()) {
	console.error('Set ECOPAGES_BENCH=1 to run the kitchen-sink bundle benchmark.');
	process.exit(1);
}

registerHmrBench();
registerBuildBench();
registerIntegrationBench();
registerHeavyBench();
registerMemorySnapBench();
registerStaticBuildBench();
await registerBuildSpeedBench();

const { benchmarks } = await run({
	format: 'quiet',
	throw: true,
});

const report = writeMitataBenchReport(benchmarks);
console.log(`Wrote ${MITATA_BENCH_JSON} with ${Object.keys(report.scenarios).length} scenarios.`);
