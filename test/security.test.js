import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { nextDailyRefreshAt } from "../src/cache.js";

const encoder = new TextEncoder();

function varint(number) {
  const bytes = [];
  while (number > 127) {
    bytes.push((number & 127) | 128);
    number >>>= 7;
  }
  bytes.push(number);
  return bytes;
}

function field(number, value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return [number * 8 + 2, ...varint(bytes.length), ...bytes];
}

function siteData(type = 2, value = "example.org") {
  const domain = [8, type, ...field(2, value)];
  const category = [...field(1, "test"), ...field(2, domain)];
  return new Uint8Array(field(1, category));
}

function siteDataWithCategories() {
  const category = (name, value) => [...field(1, name), ...field(2, [8, 2, ...field(2, value)])];
  return new Uint8Array([...field(1, category("test", "example.org")),
    ...field(1, category("other", "other.org"))]);
}

function ipData(inverse = false) {
  const cidr = [...field(1, Uint8Array.of(1, 2, 3, 0)), 16, 24];
  const country = [...field(1, "cn"), ...field(2, cidr), ...(inverse ? [24, 1] : [])];
  return new Uint8Array(field(1, country));
}

async function request(path, fetcher, env = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return fetcher(url, options);
  };
  try {
    const pending = [];
    const response = await worker.fetch(new Request(`https://worker.test${path}`), env, {
      waitUntil(promise) { pending.push(promise); }
    });
    await Promise.all(pending);
    return { response, calls };
  } finally {
    globalThis.fetch = original;
  }
}

function customPath(url, category = "test") {
  return `/rules/clash/${category}.yaml?source=custom&url=${encodeURIComponent(url)}`;
}

function sourceMetadata(sha256) {
  const checkedAt = Date.now();
  return { sha256, checkedAt, freshUntil: nextDailyRefreshAt(checkedAt) };
}

test("rejects traversal-like names, empty exclusions, and unsafe source URLs before fetching", async () => {
  const invalid = [
    customPath("https://public.test.org/data.dat", ".."),
    customPath("https://public.test.org/data.dat", "test@-"),
    customPath("https://public.test.org/data.dat", "%2e%2e%2fsecret"),
    customPath("https://localhost./data.dat"),
    customPath("https://public.test.org:8443/data.dat")
  ];
  for (const path of invalid) {
    const { response, calls } = await request(path, () => { throw new Error("Unexpected fetch"); });
    assert.equal(response.status, 400, path);
    assert.equal(calls.length, 0, path);
  }
});

test("rejects redirects to loopback and this Worker", async () => {
  for (const target of ["https://127.0.0.1/private", "https://worker.test/rules/clash/test.yaml"]) {
    const { response, calls } = await request(customPath(`https://public.test.org/${encodeURIComponent(target)}`),
      () => new Response(null, { status: 302, headers: { location: target } }));
    assert.equal(response.status, 502);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, "manual");
  }
});

test("stops redirect loops and oversized source responses", async () => {
  const source = "https://public.test.org/redirect-loop.dat";
  const redirect = await request(customPath(source), () =>
    new Response(null, { status: 302, headers: { location: source } }));
  assert.equal(redirect.response.status, 502);
  assert.equal(redirect.calls.length, 6);
  const oversized = await request(customPath("https://public.test.org/oversized.dat"), () =>
    new Response("x", { headers: { "content-length": String(32 * 1024 * 1024 + 1) } }));
  assert.equal(oversized.response.status, 413);
});

test("allows validated public redirects and converts valid rules", async () => {
  const source = `https://public.test.org/${Date.now()}/data.dat`;
  const { response, calls } = await request(customPath(source), url => String(url) === source
    ? new Response(null, { status: 302, headers: { location: "https://cdn.public.org/data.dat" } })
    : new Response(siteData()));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /DOMAIN-SUFFIX,example.org/);
  assert.equal(calls.length, 2);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-cache-layer"), "convert");
  assert.match(response.headers.get("cache-control"), /^public, max-age=\d+, stale-while-revalidate=86400, stale-if-error=86400$/);
  assert.match(response.headers.get("server-timing"), /^worker;dur=\d+(?:\.\d+)?;desc="wall time"$/);
});

test("reports edge hits without persisting the previous response label", async () => {
  const originalCaches = globalThis.caches;
  let saved;
  globalThis.caches = { default: {
    async match() { return saved?.clone() || null; },
    async put(_key, response) { saved = response.clone(); }
  } };
  try {
    const source = `https://public.test.org/${Date.now()}/edge.dat`;
    const path = customPath(source);
    const first = await request(path, () => new Response(siteData()));
    const second = await request(path, () => { throw new Error("Cache hit should not fetch"); });
    assert.equal(first.response.headers.get("x-cache-layer"), "convert");
    assert.equal(second.response.headers.get("x-cache-layer"), "edge");
  } finally {
    globalThis.caches = originalCaches;
  }
});

test("reports D1 hits without downloading a source", async () => {
  const body = new TextEncoder().encode("payload:\n  - DOMAIN,example.org\n");
  const env = {
    RULE_CACHE: { async get() { return sourceMetadata("a".repeat(64)); } },
    RULE_DB: { prepare(sql) { return { bind() { return {
      async first() { return { headers: JSON.stringify({ "content-type": "application/yaml" }), part_count: 1, byte_length: body.length }; },
      async all() { return { results: [{ part: 0, body: [...body] }] }; }
    }; } }; } }
  };
  const { response, calls } = await request("/rules/clash/test.yaml", () => {
    throw new Error("D1 hit should not download a source");
  }, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-cache-layer"), "d1");
  assert.match(response.headers.get("cache-control"), /^public, max-age=\d+, stale-while-revalidate=86400, stale-if-error=86400$/);
  assert.equal(calls.length, 0);
});

test("reuses parsed source data for separate D1 misses in one isolate", async () => {
  const source = `https://public.test.org/${Date.now()}/shared.dat`;
  const bytes = siteDataWithCategories();
  let dbReads = 0;
  const env = {
    SOURCE_URL: source,
    RULE_CACHE: { async get() { return sourceMetadata("a".repeat(64)); } },
    RULE_DB: {
      prepare() {
        return { bind() { return {
          async first() { dbReads++; return null; },
          async run() { return {}; }
        }; } };
      },
      async batch() { return []; }
    }
  };
  const first = await request("/rules/clash/test.yaml", () => new Response(bytes), env);
  const second = await request("/rules/clash/other.yaml", () => new Response(bytes), env);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.calls.length + second.calls.length, 1);
  assert.ok(dbReads >= 2);
});

test("coalesces concurrent D1 misses onto one source load", async () => {
  const source = `https://public.test.org/${Date.now()}/concurrent.dat`;
  const bytes = siteDataWithCategories();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(bytes);
  };
  const env = {
    SOURCE_URL: source,
    RULE_CACHE: { async get() { return sourceMetadata("a".repeat(64)); } },
    RULE_DB: {
      prepare() {
        return { bind() { return {
          async first() { return null; },
          async run() { return {}; }
        }; } };
      },
      async batch() { return []; }
    }
  };
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  try {
    const responses = await Promise.all(["test", "other"].map(category =>
      worker.fetch(new Request(`https://worker.test/rules/clash/${category}.yaml`), env, ctx)));
    await Promise.all(pending);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coalesces simultaneous daily source metadata refreshes", async () => {
  const source = `https://public.test.org/${Date.now()}/daily-refresh.dat`;
  const bytes = siteDataWithCategories();
  let sourceReads = 0;
  let metadataWrites = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    sourceReads++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(bytes);
  };
  const env = {
    SOURCE_URL: source,
    RULE_CACHE: {
      async get() { return null; },
      async put() { metadataWrites++; }
    },
    RULE_DB: {
      prepare() {
        return { bind() { return {
          async first() { return null; },
          async run() { return {}; }
        }; } };
      },
      async batch() { return []; }
    }
  };
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  try {
    const responses = await Promise.all(["test", "other"].map(category =>
      worker.fetch(new Request(`https://worker.test/rules/clash/${category}.yaml`), env, ctx)));
    await Promise.all(pending);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.equal(sourceReads, 1);
    assert.equal(metadataWrites, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unknown attributes and conversions with no supported rules", async () => {
  const cases = [
    ["test@missing", siteData(), 422],
    ["test@-missing", siteData(), 422],
    ["test", siteData(2, "bad\u0000value.org"), 422],
    ["test", siteData(2, "bad#value.org"), 422],
    ["test", siteData(3, "-bad.org"), 422]
  ];
  for (const [category, bytes, status] of cases) {
    const source = `https://public.test.org/${category}/${Math.random()}/data.dat`;
    const { response } = await request(customPath(source, category), () => new Response(bytes));
    assert.equal(response.status, status, category);
  }
  const source = `https://public.test.org/${Date.now()}/regex.dat`;
  const path = `/rules/surge/test.list?source=custom&url=${encodeURIComponent(source)}`;
  const { response } = await request(path, () => new Response(siteData(1, "foo.*")));
  assert.equal(response.status, 422);
});

test("rejects sources without categories", async () => {
  const source = `https://public.test.org/${Date.now()}/empty.dat`;
  const { response } = await request(customPath(source), () => new Response(new Uint8Array()));
  assert.equal(response.status, 422);
});

test("rejects malformed data, unsafe category names, and inverse GeoIP", async () => {
  const malformed = await request(customPath("https://public.test.org/malformed.dat"), () =>
    new Response(Uint8Array.of(10, 5, 1)));
  assert.equal(malformed.response.status, 422);

  const unsafeCategory = new Uint8Array(field(1, [...field(1, "../evil"), ...field(2, [8, 2, ...field(2, "example.org")])]));
  const categoryPath = `/categories?source=custom&url=${encodeURIComponent("https://public.test.org/unsafe.dat")}`;
  const unsafe = await request(categoryPath, () => new Response(unsafeCategory));
  assert.equal(unsafe.response.status, 422);

  const inversePath = "/rules/geoip/clash/cn.yaml?source=custom&url=https%3A%2F%2Fpublic.test.org%2Finverse.dat";
  const inverse = await request(inversePath, () => new Response(ipData(true)));
  assert.equal(inverse.response.status, 422);
});
