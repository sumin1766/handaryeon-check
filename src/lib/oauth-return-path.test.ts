import { test } from "node:test";
import assert from "node:assert/strict";
import { oauthReturnPath } from "./oauth-return-path";
test("preserves authorization query and fragment", () => {
  assert.equal(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#confirm"), "/.lovable/oauth/consent?authorization_id=abc#confirm");
});
test("rejects external and malformed return paths", () => {
  for (const path of ["//outside.invalid", "/\\outside.invalid", "https://outside.invalid", "/x\n", null]) assert.equal(oauthReturnPath(path), "/");
});