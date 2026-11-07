import { path } from '@ecopages/file-system/path';

/** Absolute path to `@ecopages/radiant/client/install-hydrator` from this integration package. */
export const RADIANT_INSTALL_HYDRATOR_FILEPATH = path.fromFileUrl(
	import.meta.resolve('@ecopages/radiant/client/install-hydrator'),
);
