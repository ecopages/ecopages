import { test } from '../../app-fixture';
import { registerReactAppTests } from './react-production-start.e2e-shared';

test.describe('A React app under `ecopages dev`', () => {
	registerReactAppTests(test, { rendersRequests: true });
});
