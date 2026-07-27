import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Resilience: keep the UI usable even when Lovable Cloud's Data API
        // has a transient hiccup. Retry with exponential backoff, and
        // automatically refetch when the tab regains focus or the network
        // reconnects so screens self-heal without a manual refresh.
        retry: 5,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: "always",
        staleTime: 15_000,
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
