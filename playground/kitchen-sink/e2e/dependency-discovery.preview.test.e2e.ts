import { test } from '@playwright/test';
import { registerDependencyDiscoveryTests } from './dependency-discovery-tests';

registerDependencyDiscoveryTests(test);
