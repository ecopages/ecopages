import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { DiscoveryCard } from '@/components/dependency-discovery/card.react';

export default eco.page<{}, ReactNode>({ render: () => <main><DiscoveryCard /></main> });
