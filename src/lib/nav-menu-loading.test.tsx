import { mock } from "bun:test";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";

mock.module("./nav-menu.functions", () => ({ saveNavMenuConfigServer: async () => { throw new Error("No writes in tests"); } }));
mock.module("./secure-db", () => ({ sdb: {} }));
const { useNavMenuConfig, writeNavMenuCopy, readNavMenuCopy } = await import("./nav-menu-config");

describe("menu loading safety", () => {
  test("failed server read uses only that season's copy and disables editing", () => {
    const store = new Map<string, string>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    } } });
    const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
    try {
      writeNavMenuCopy("test-season", { order: ["/settings", "/"], hidden: ["/registry"] });
      const query = client.getQueryCache().build(client, { queryKey: ["nav_menu_config", "test-season"] });
      query.setState({ status: "error", error: new Error("offline"), fetchStatus: "idle" });
      let observed: ReturnType<typeof useNavMenuConfig> | undefined;
      function Probe() { observed = useNavMenuConfig("test-season"); return null; }
      renderToString(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
      assert.ok(observed);
      assert.equal(observed.isError, true);
      assert.equal(observed.serverReady, false);
      assert.deepEqual(observed.data?.hidden, ["/registry"]);
      assert.equal(observed.data?.order[0], "/settings");
      assert.equal(readNavMenuCopy("other-season"), undefined);
      assert.equal(query.options.retry, 2);
    } finally {
      client.clear();
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});