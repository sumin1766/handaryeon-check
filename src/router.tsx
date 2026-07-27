import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Emergency resilience: keep already-loaded screens usable during
        // short backend stalls. Avoid focus-triggered mass refetches because
        // multiple reception desks can otherwise stampede the Data API.
        retry: 10,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: "always",
        staleTime: 120_000,
        gcTime: 60 * 60 * 1000,
        placeholderData: (previousData: unknown) => previousData,
      },
      mutations: {
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
