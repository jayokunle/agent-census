import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonc } from "../src/index.js";

test("parseJsonc: comments and trailing commas, strings untouched", () => {
  const text = `{
    // line comment
    "a": "http://x/*not a comment*/", /* block */
    "b": ["//, ]", 2,], // after
    "c": { "d": "q\\"uote", },
  }`;
  assert.deepEqual(parseJsonc(text), { a: "http://x/*not a comment*/", b: ["//, ]", 2], c: { d: 'q"uote' } });
});

test("parseJsonc: strict JSON unchanged, invalid still throws", () => {
  assert.deepEqual(parseJsonc('{"a":[1,2]}'), { a: [1, 2] });
  assert.throws(() => parseJsonc('{"a":}'));
});
