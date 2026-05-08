     1|'use client';
     2|import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
     3|import { useState, type ReactNode } from 'react';
     4|
     5|export function Providers({ children }: { children: ReactNode }) {
     6|	const [queryClient] = useState(() => new QueryClient({
     7|		defaultOptions: {
     8|			queries: {
     9|				staleTime: 1000 * 60 * 5,
    10|				refetchOnWindowFocus: false,
    11|			},
    12|		},
    13|	}));
    14|
    15|	return (
    16|		<QueryClientProvider client={queryClient}>
    17|			{children}
    18|		</QueryClientProvider>
    19|	);
    20|}
    21|