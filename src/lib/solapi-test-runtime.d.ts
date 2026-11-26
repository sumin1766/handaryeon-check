// Narrow Bun test API declaration; deliberately avoids Bun globals in the web application's type environment.
declare module "bun:test" {
  export const mock: { module(specifier: string, factory: () => Record<string, unknown>): void };
}