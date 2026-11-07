import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/image-processor/types';
import '@ecopages/jsx/jsx-runtime';

// #region locals
declare module '@ecopages/core' {
	interface RequestLocals {
		session?: { user: string } | null;
	}
}
// #endregion locals
