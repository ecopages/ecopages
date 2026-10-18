import { Logger } from '@ecopages/logger';
import { isEcopagesEnvEnabled } from '../env.ts';

const debug = isEcopagesEnvEnabled('ECOPAGES_LOGGER_DEBUG');
export const appLogger = new Logger('[@ecopages/core]', { debug });
