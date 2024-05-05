import { hydrateRoot } from 'react-dom/client';
import reactNode from './test';

hydrateRoot(document, reactNode({}));
