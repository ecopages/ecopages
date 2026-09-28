import { fileURLToPath } from 'node:url';

/** Absolute path to `@ecopages/radiant/client/install-hydrator` from this integration package. */
export const RADIANT_INSTALL_HYDRATOR_FILEPATH = fileURLToPath(
	import.meta.resolve('@ecopages/radiant/client/install-hydrator'),
);
