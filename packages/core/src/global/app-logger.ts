import { Logger } from '@ecopages/logger';

const debug = process.env.ECOPAGES_LOGGER_DEBUG === 'true';
export const appLogger = new Logger('[@ecopages/core]', { debug });
