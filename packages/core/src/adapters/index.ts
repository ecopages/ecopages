// Abstract adapters
export * from './abstract/server-adapter.ts';
export * from './abstract/application-adapter.ts';
export * from './abstract/router-adapter.ts';

// Bun adapters
export * from './bun/server-adapter.ts';
export * from './bun/create-app.ts';
export * from './bun/router-adapter.ts';

// Re-export application creation function
import { createApp } from './bun/create-app.ts';

// Default export for the current runtime (Bun)
export const createApplication = createApp;
