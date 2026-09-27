import { indexSiteCategories, listCategories, listAttributes, readCategory } from "./geosite.js";
import { indexIpCategories, listIpCategories, readIpCategory } from "./geoip.js";
import { domainMrs, ipMrs } from "./mrs.js";
import { getResult, getSourceMetadata, metadataKey, putResult, putSourceMetadata, resultKey, sha256 } from "./cache.js";

const DEFAULT_SITE = "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat";
const DEFAULT_IP = "https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat";
const FALLBACK_SITE = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat";
const FALLBACK_IP = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat";
const RELEASE_API = "https://api.github.com/repos/Loyalsoldier/v2ray-rules-dat/releases/latest";
const V2FLY_SITE = "https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat";
const V2FLY_IP = "https://github.com/v2fly/geoip/releases/latest/download/geoip.dat";
const V2FLY_SITE_API = "https://api.github.com/repos/v2fly/domain-list-community/releases/latest";
const V2FLY_IP_API = "https://api.github.com/repos/v2fly/geoip/releases/latest";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const CACHE_SECONDS = 3600;
const MAX_SOURCE_CACHE_BYTES = 48 * 1024 * 1024;
const MAX_SOURCE_CACHE_ENTRIES = 2;
const sourceCache = new Map();
const pendingSources = new Map();

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*"
  } });
}

function selection(raw, type) {
  const parts = raw.toLowerCase().split("@");
  if (!/^[a-z0-9_!.-]{1,100}$/.test(parts[0]) || parts.length > (type === "geoip" ? 1 : 9)) return null;
  const include = [];
  const exclude = [];
  for (const part of parts.slice(1)) {
    if (!/^-?[a-z0-9_!.-]{1,50}$/.test(part)) return null;
    if (part.startsWith("-")) exclude.push(part.slice(1));
    else include.push(part);
  }
  if (include.some(name => exclude.includes(name))) return null;
  return { category: parts[0], include: [...new Set(include)].sort(), exclude: [...new Set(exclude)].sort() };
}

function checkedUrl(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Invalid source URL");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
    url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") || /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.startsWith("[")) {
    throw new Error("Source URL must use a public HTTPS hostname without credentials or fragments");
  }
  return url;
}

function sourceChoice(type, env, params, origin) {
  const id = params.get("source") || "loyalsoldier";
  if (id === "loyalsoldier") {
    const value = type === "geoip" ? env.GEOIP_URL || DEFAULT_IP : env.SOURCE_URL || DEFAULT_SITE;
    const original = type === "geoip" ? DEFAULT_IP : DEFAULT_SITE;
    return { id, url: value, fallbackUrl: value === original ? (type === "geoip" ? FALLBACK_IP : FALLBACK_SITE) : null,
      releaseApi: value === original ? RELEASE_API : null, asset: type === "geoip" ? "geoip.dat" : "geosite.dat" };
  }
  if (id === "v2fly") {
    return { id, url: type === "geoip" ? V2FLY_IP : V2FLY_SITE,
      releaseApi: type === "geoip" ? V2FLY_IP_API : V2FLY_SITE_API,
      asset: type === "geoip" ? "geoip.dat" : "dlc.dat" };
  }
  if (id === "custom") {
    const value = params.get("url");
    if (!value) throw new Error("Custom source URL is required");
    const parsed = checkedUrl(value);
    if (parsed.hostname === new URL(origin).hostname) throw new Error("Custom source cannot point to this Worker");
    return { id, url: parsed.href, releaseApi: null, asset: parsed.pathname.split("/").pop() || "custom.dat" };
  }
  throw new Error("Unknown source");
}

async function fetchSourceBytes(value) {
  const response = await fetch(checkedUrl(value), { cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_SOURCE_BYTES) {
    await response.body?.cancel();
    throw new Error("Source exceeds 32 MiB limit");
  }
  if (!response.body) throw new Error("Source has no body");
  const initialLength = Number(response.headers.get("content-length"));
  let bytes = new Uint8Array(Number.isSafeInteger(initialLength) && initialLength > 0 ? initialLength : 64 * 1024);
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      const nextSize = size + chunk.length;
      if (nextSize > MAX_SOURCE_BYTES) throw new Error("Source exceeds 32 MiB limit");
      if (nextSize > bytes.length) {
        const expanded = new Uint8Array(Math.min(MAX_SOURCE_BYTES, Math.max(nextSize, bytes.length * 2)));
        expanded.set(bytes.subarray(0, size));
        bytes = expanded;
      }
      bytes.set(chunk, size);
      size = nextSize;
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { bytes: size === bytes.length ? bytes : bytes.slice(0, size),
    lastModified: response.headers.get("last-modified") };
}

async function sourceBytes(choice) {
  try {
    return await fetchSourceBytes(choice.url);
  } catch (error) {
    if (!choice.fallbackUrl || error.message === "Source exceeds 32 MiB limit") throw error;
    console.warn("Primary source unavailable; using GitHub fallback", error);
    return fetchSourceBytes(choice.fallbackUrl);
  }
}

async function sourceData(choice, type, fetched) {
  const key = `${type}:${choice.url}`;
  const cached = sourceCache.get(key);
  if (cached && !fetched) {
    sourceCache.delete(key);
    if (cached.expiresAt > Date.now()) {
      sourceCache.set(key, cached);
      return cached;
    }
  }
  if (!fetched && pendingSources.has(key)) return pendingSources.get(key);
  const pending = (async () => {
    const bytes = (fetched || await sourceBytes(choice)).bytes;
    const index = type === "geoip" ? indexIpCategories(bytes) : indexSiteCategories(bytes);
    const data = { bytes, index, expiresAt: Date.now() + CACHE_SECONDS * 1000 };
    if (bytes.byteLength <= MAX_SOURCE_CACHE_BYTES) {
      sourceCache.set(key, data);
      let total = 0;
      for (const item of sourceCache.values()) total += item.bytes.byteLength;
      while (total > MAX_SOURCE_CACHE_BYTES || sourceCache.size > MAX_SOURCE_CACHE_ENTRIES) {
        const oldest = sourceCache.keys().next().value;
        total -= sourceCache.get(oldest).bytes.byteLength;
        sourceCache.delete(oldest);
      }
    }
    return data;
  })();
  if (!fetched) pendingSources.set(key, pending);
  try { return await pending; }
  finally { if (pendingSources.get(key) === pending) pendingSources.delete(key); }
}

function yaml(rules) {
  return rules.length ? `payload:\n${rules.map(rule => `  - ${JSON.stringify(rule)}`).join("\n")}\n` : "payload: []\n";
}

function singBox(fields) {
  const rule = Object.fromEntries(Object.entries(fields).filter(([, values]) => values.length));
  const count = Object.values(rule).reduce((total, values) => total + values.length, 0);
  return { body: JSON.stringify({ version: 1, rules: count ? [rule] : [] }, null, 2) + "\n", count, skipped: 0 };
}

function renderSite(domains, format) {
  if (format === "mrs") return domainMrs(domains);
  if (format === "sing-box") {
    const fields = { domain: new Set(), domain_suffix: new Set(), domain_keyword: new Set(), domain_regex: new Set() };
    let skipped = 0;
    const keys = ["domain_keyword", "domain_regex", "domain_suffix", "domain"];
    for (const { type, value } of domains) {
      if (!value || /[\r\n]/.test(value) || !keys[type]) { skipped++; continue; }
      fields[keys[type]].add(value);
    }
    const result = singBox(Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, [...values].sort()])));
    return { ...result, skipped };
  }
  const lines = new Set();
  let skipped = 0;
  for (const { type, value } of domains) {
    if (!value || /[\r\n,]/.test(value)) { skipped++; continue; }
    if (format === "quantumult-x") {
      const kind = ["host-keyword", null, "host-suffix", "host"][type];
      if (!kind) { skipped++; continue; }
      lines.add(`${kind},${value},proxy`);
    } else {
      const kind = ["DOMAIN-KEYWORD", "DOMAIN-REGEX", "DOMAIN-SUFFIX", "DOMAIN"][type];
      if (!kind || (["surge", "loon", "shadowrocket"].includes(format) && type === 1)) { skipped++; continue; }
      lines.add(`${kind},${value}`);
    }
  }
  const rules = [...lines].sort();
  return { body: format === "clash" ? yaml(rules) : `${rules.join("\n")}${rules.length ? "\n" : ""}`, count: rules.length, skipped };
}

function renderIp(data, format) {
  if (format === "mrs") return ipMrs(data.networks);
  const unique = [...new Set(data.cidrs)].sort();
  if (format === "sing-box") return singBox({ ip_cidr: unique });
  const rules = format === "quantumult-x"
    ? unique.map(cidr => `${cidr.includes(":") ? "ip6-cidr" : "ip-cidr"},${cidr},proxy`)
    : ["surge", "loon", "shadowrocket"].includes(format)
    ? unique.map(cidr => `${cidr.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${cidr}`)
    : unique;
  return { body: format === "clash" ? yaml(rules) : `${rules.join("\n")}${rules.length ? "\n" : ""}`, count: rules.length, skipped: 0 };
}

async function version(choice) {
  if (choice.releaseApi) {
    try {
      const response = await fetch(choice.releaseApi, {
        headers: { "accept": "application/vnd.github+json", "user-agent": "geosite2rule-worker" },
        cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS }
      });
      if (response.ok) {
        const release = await response.json();
        const asset = release.assets?.find(item => item.name === choice.asset);
        const date = asset?.updated_at || release.published_at;
        if (date && !Number.isNaN(Date.parse(date))) return { date, source: "release", version: release.tag_name || null };
      }
    } catch (error) { console.warn("Release date unavailable", error); }
  }
  const response = await fetch(checkedUrl(choice.url), { method: "HEAD", cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS } });
  if (!response.ok) throw new Error(`Source metadata returned HTTP ${response.status}`);
  const header = response.headers.get("last-modified");
  await response.body?.cancel();
  return { date: header && !Number.isNaN(Date.parse(header)) ? new Date(header).toISOString() : null, source: "last-modified", version: null };
}

function responseForRules(result, format) {
  const binary = format === "mrs";
  return new Response(result.body, { headers: {
    "content-type": binary ? "application/octet-stream" : format === "clash" ? "application/yaml; charset=utf-8" : format === "sing-box" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "x-rule-count": String(result.count),
    "x-skipped-rules": String(result.skipped),
    "access-control-allow-origin": "*"
  } });
}

function forHead(request, response) {
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

async function handleRequest(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/") return env.ASSETS.fetch(request);

    const isCategories = url.pathname === "/categories";
    const isVersion = url.pathname === "/version";
    const attributeMatch = /^\/attributes\/([^/]+)$/.exec(url.pathname);
    const ruleMatch = /^\/rules\/(geoip\/)?(clash|clash-text|surge|mrs|quantumult-x|loon|shadowrocket|sing-box)\/([^/]+)\.(yaml|list|txt|mrs|json)$/.exec(url.pathname);
    if (!isCategories && !isVersion && !attributeMatch && !ruleMatch) return json({ error: "Not found" }, 404);

    const type = ruleMatch ? (ruleMatch[1] ? "geoip" : "geosite") : attributeMatch ? "geosite" : url.searchParams.get("type") || "geosite";
    if (type !== "geosite" && type !== "geoip") return json({ error: "Invalid data type" }, 400);
    let choice;
    try { choice = sourceChoice(type, env, url.searchParams, url.origin); }
    catch (error) { return json({ error: error.message }, 400); }
    const format = ruleMatch?.[2];
    const extension = ruleMatch?.[4];
    if (ruleMatch && (format === "clash" ? extension !== "yaml" : format === "mrs" ? extension !== "mrs" : format === "sing-box" ? extension !== "json" : extension !== "list" && extension !== "txt")) {
      return json({ error: "Invalid extension for format" }, 400);
    }

    let selected;
    if (ruleMatch || attributeMatch) {
      try { selected = selection(decodeURIComponent(ruleMatch?.[3] || attributeMatch[1]), type); }
      catch { return json({ error: "Invalid category" }, 400); }
      if (!selected || (attributeMatch && (selected.include.length || selected.exclude.length))) return json({ error: "Invalid category" }, 400);
    }

    const cache = globalThis.caches?.default;
    const cacheUrl = new URL(url.origin);
    if (ruleMatch) {
      const name = [selected.category, ...selected.include, ...selected.exclude.map(value => `-${value}`)].join("@");
      const suffix = format === "clash" ? "yaml" : format === "mrs" ? "mrs" : format === "sing-box" ? "json" : "list";
      cacheUrl.pathname = `/rules/${type === "geoip" ? "geoip/" : ""}${format}/${encodeURIComponent(name)}.${suffix}`;
    } else if (attributeMatch) {
      cacheUrl.pathname = `/attributes/${encodeURIComponent(selected.category)}`;
    } else cacheUrl.pathname = url.pathname;
    if (isCategories || isVersion) cacheUrl.searchParams.set("type", type);
    if (choice.id !== "loyalsoldier") cacheUrl.searchParams.set("source", choice.id);
    cacheUrl.searchParams.set("source_url", choice.url);
    const cacheKey = new Request(cacheUrl);
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return forHead(request, hit);
    }

    try {
      let response;
      let sha = null;
      let fetchedSha = null;
      let fetched = null;
      const persistent = !isVersion && Boolean(env.RULE_DB);
      const metaKey = persistent ? metadataKey(type, choice) : null;
      if (persistent && metaKey) {
        const metadata = await getSourceMetadata(env.RULE_CACHE, metaKey);
        if (metadata) {
          sha = metadata.sha256;
          const hit = await getResult(env.RULE_DB, resultKey(type, sha, cacheUrl.pathname));
          if (hit) {
            if (cache) ctx.waitUntil(cache.put(cacheKey, hit.clone()));
            return forHead(request, hit);
          }
        } else {
          fetched = await sourceBytes(choice);
          sourceCache.delete(`${type}:${choice.url}`);
          fetchedSha = await putSourceMetadata(env.RULE_CACHE, metaKey, fetched.bytes, fetched.lastModified);
          sha = fetchedSha;
          const hit = await getResult(env.RULE_DB, resultKey(type, sha, cacheUrl.pathname));
          if (hit) {
            if (cache) ctx.waitUntil(cache.put(cacheKey, hit.clone()));
            return forHead(request, hit);
          }
        }
      }
      if (isVersion) {
        response = json(await version(choice));
      } else {
        if (persistent && !fetched) fetched = await sourceBytes(choice);
        const { bytes, index } = await sourceData(choice, type, fetched);
        if (persistent) {
          const actualSha = fetchedSha || await sha256(bytes);
          if (actualSha !== sha) {
            sha = actualSha;
            const hit = await getResult(env.RULE_DB, resultKey(type, sha, cacheUrl.pathname));
            if (hit) {
              if (choice.id === "custom") hit.headers.set("cache-control", `public, max-age=${CACHE_SECONDS}`);
              if (cache) ctx.waitUntil(cache.put(cacheKey, hit.clone()));
              return forHead(request, hit);
            }
          }
        }
        if (isCategories) {
          response = json({ categories: type === "geoip" ? listIpCategories(bytes, index) : listCategories(bytes, index) });
        } else if (attributeMatch) {
          const data = listAttributes(bytes, selected.category, index);
          if (!data.found) return json({ error: `Category ${selected.category} not found` }, 404);
          response = json(data);
        } else if (type === "geoip") {
          const data = readIpCategory(bytes, selected.category, format !== "mrs", index);
          if (!data.found) return json({ error: `Category ${selected.category} not found` }, 404);
          if (data.inverse) return json({ error: "Inverse GeoIP categories cannot be converted to a positive ruleset" }, 422);
          const result = renderIp(data, format);
          response = responseForRules(result, format);
        } else {
          const data = readCategory(bytes, selected.category, selected.include, selected.exclude, index);
          if (!data.found) return json({ error: `Category ${selected.category} not found` }, 404);
          const result = renderSite(data.domains, format);
          response = responseForRules(result, format);
        }
      }
      response.headers.set("cache-control", `public, max-age=${CACHE_SECONDS}`);
      if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      if (persistent && choice.id !== "custom" && sha) {
        ctx.waitUntil(putResult(env.RULE_DB, resultKey(type, sha, cacheUrl.pathname), response.clone()));
      }
      return forHead(request, response);
    } catch (error) {
      console.error(error);
      if (error.message?.startsWith("MRS requires")) return json({ error: error.message }, 422);
      return json({ error: "Could not load or convert geo data" }, 502);
    }
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
