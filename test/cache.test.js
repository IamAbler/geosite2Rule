import assert from "node:assert/strict";
import test from "node:test";
import { dailyCachePolicy, getSourceMetadata, nextDailyRefreshAt, putResult, putSourceMetadata } from "../src/cache.js";

const DAY_MS = 24 * 60 * 60 * 1000;

test("daily freshness ends at 09:00 China Standard Time", () => {
  const before = Date.UTC(2026, 8, 27, 0, 59, 59, 500);
  const refreshAt = Date.UTC(2026, 8, 27, 1);
  assert.equal(nextDailyRefreshAt(before), refreshAt);
  assert.equal(dailyCachePolicy(before).maxAge, 1);
  assert.equal(nextDailyRefreshAt(refreshAt), refreshAt + DAY_MS);
  assert.equal(nextDailyRefreshAt(refreshAt + 1), refreshAt + DAY_MS);
  assert.equal(dailyCachePolicy(before, refreshAt - 1000).maxAge, 0);
  assert.match(dailyCachePolicy(before).header,
    /^public, max-age=1, stale-while-revalidate=86400, stale-if-error=86400$/);
});

test("KV source metadata becomes stale exactly at the daily refresh boundary", async () => {
  const checkedAt = Date.UTC(2026, 8, 27, 0, 30);
  const freshUntil = nextDailyRefreshAt(checkedAt);
  const metadata = { sha256: "a".repeat(64), checkedAt, freshUntil };
  let now = freshUntil - 1;
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const kv = { async get() { return metadata; } };
    assert.deepEqual(await getSourceMetadata(kv, "source:test"), metadata);
    now = freshUntil;
    assert.equal(await getSourceMetadata(kv, "source:test"), null);
    metadata.freshUntil = freshUntil + 1;
    assert.equal(await getSourceMetadata(kv, "source:test"), null);
  } finally {
    Date.now = originalNow;
  }
});

test("KV metadata and D1 results persist the scheduled refresh timestamp", async () => {
  const checkedAt = Date.UTC(2026, 8, 27, 0, 30);
  const expiresAt = nextDailyRefreshAt(checkedAt);
  let savedMetadata;
  const originalNow = Date.now;
  Date.now = () => checkedAt;
  try {
    const sha = await putSourceMetadata({ async put(_key, value, options) {
      savedMetadata = { value: JSON.parse(value), options };
    } }, "source:test", new TextEncoder().encode("dat"), "yesterday");
    assert.equal(savedMetadata.value.sha256, sha);
    assert.equal(savedMetadata.value.checkedAt, checkedAt);
    assert.equal(savedMetadata.value.freshUntil, expiresAt);
    assert.equal(savedMetadata.options.expirationTtl, 30 * 24 * 60 * 60);

    const bound = [];
    const db = {
      prepare(sql) {
        return {
          bind(...args) {
            bound.push({ sql, args });
            return { async run() { return {}; } };
          }
        };
      },
      async batch(statements) { bound.push(...statements); }
    };
    await putResult(db, "v4:test", new Response("payload"), expiresAt);
    assert.equal(bound[0].args[4], expiresAt);
  } finally {
    Date.now = originalNow;
  }
});
