import { listCategories, listAttributes, readCategory } from "./geosite.js";
import { listIpCategories, readIpCategory } from "./geoip.js";
import { domainMrs, ipMrs } from "./mrs.js";

const DEFAULT_SITE = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat";
const DEFAULT_IP = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat";
const RELEASE_API = "https://api.github.com/repos/Loyalsoldier/v2ray-rules-dat/releases/latest";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const CACHE_SECONDS = 3600;

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
  return { category: parts[0], include, exclude };
}

function sourceUrl(type, env) {
  return type === "geoip" ? env.GEOIP_URL || DEFAULT_IP : env.SOURCE_URL || DEFAULT_SITE;
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Source URL must use HTTPS");
  return url;
}

async function sourceBytes(value) {
  const response = await fetch(checkedUrl(value), { cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_SOURCE_BYTES) {
    await response.body?.cancel();
    throw new Error("Source exceeds 32 MiB limit");
  }
  if (!response.body) throw new Error("Source has no body");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > MAX_SOURCE_BYTES) throw new Error("Source exceeds 32 MiB limit");
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

function yaml(rules) {
  return rules.length ? `payload:\n${rules.map(rule => `  - ${JSON.stringify(rule)}`).join("\n")}\n` : "payload: []\n";
}

function renderSite(domains, format) {
  if (format === "mrs") return domainMrs(domains);
  const lines = new Set();
  let skipped = 0;
  for (const { type, value } of domains) {
    if (!value || /[\r\n,]/.test(value)) { skipped++; continue; }
    const kind = ["DOMAIN-KEYWORD", "DOMAIN-REGEX", "DOMAIN-SUFFIX", "DOMAIN"][type];
    if (!kind || (format === "surge" && type === 1)) { skipped++; continue; }
    lines.add(`${kind},${value}`);
  }
  const rules = [...lines].sort();
  return { body: format === "clash" ? yaml(rules) : `${rules.join("\n")}${rules.length ? "\n" : ""}`, count: rules.length, skipped };
}

function renderIp(data, format) {
  if (format === "mrs") return ipMrs(data.networks);
  const unique = [...new Set(data.cidrs)].sort();
  const rules = format === "surge"
    ? unique.map(cidr => `${cidr.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${cidr}`)
    : unique;
  return { body: format === "clash" ? yaml(rules) : `${rules.join("\n")}${rules.length ? "\n" : ""}`, count: rules.length, skipped: 0 };
}

async function version(type, env) {
  const url = sourceUrl(type, env);
  const defaultUrl = type === "geoip" ? DEFAULT_IP : DEFAULT_SITE;
  if (url === defaultUrl) {
    try {
      const response = await fetch(RELEASE_API, {
        headers: { "accept": "application/vnd.github+json", "user-agent": "geosite2rule-worker" },
        cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS }
      });
      if (response.ok) {
        const release = await response.json();
        const filename = type === "geoip" ? "geoip.dat" : "geosite.dat";
        const asset = release.assets?.find(item => item.name === filename);
        const date = asset?.updated_at || release.published_at;
        if (date && !Number.isNaN(Date.parse(date))) return { date, source: "release", version: release.tag_name || null };
      }
    } catch (error) { console.warn("Release date unavailable", error); }
  }
  const response = await fetch(checkedUrl(url), { method: "HEAD", cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS } });
  if (!response.ok) throw new Error(`Source metadata returned HTTP ${response.status}`);
  const header = response.headers.get("last-modified");
  await response.body?.cancel();
  return { date: header && !Number.isNaN(Date.parse(header)) ? new Date(header).toISOString() : null, source: "last-modified", version: null };
}

function responseForRules(result, format) {
  const binary = format === "mrs";
  return new Response(result.body, { headers: {
    "content-type": binary ? "application/octet-stream" : format === "clash" ? "application/yaml; charset=utf-8" : "text/plain; charset=utf-8",
    "x-rule-count": String(result.count),
    "x-skipped-rules": String(result.skipped),
    "access-control-allow-origin": "*"
  } });
}

function forHead(request, response) {
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/") return env.ASSETS.fetch(request);

    const isCategories = url.pathname === "/categories";
    const isVersion = url.pathname === "/version";
    const attributeMatch = /^\/attributes\/([^/]+)$/.exec(url.pathname);
    const ruleMatch = /^\/rules\/(geoip\/)?(clash|clash-text|surge|mrs)\/([^/]+)\.(yaml|list|txt|mrs)$/.exec(url.pathname);
    if (!isCategories && !isVersion && !attributeMatch && !ruleMatch) return json({ error: "Not found" }, 404);

    const type = ruleMatch ? (ruleMatch[1] ? "geoip" : "geosite") : attributeMatch ? "geosite" : url.searchParams.get("type") || "geosite";
    if (type !== "geosite" && type !== "geoip") return json({ error: "Invalid data type" }, 400);
    const format = ruleMatch?.[2];
    const extension = ruleMatch?.[4];
    if (ruleMatch && (format === "clash" ? extension !== "yaml" : format === "mrs" ? extension !== "mrs" : extension !== "list" && extension !== "txt")) {
      return json({ error: "Invalid extension for format" }, 400);
    }

    let selected;
    if (ruleMatch || attributeMatch) {
      try { selected = selection(decodeURIComponent(ruleMatch?.[3] || attributeMatch[1]), type); }
      catch { return json({ error: "Invalid category" }, 400); }
      if (!selected || (attributeMatch && (selected.include.length || selected.exclude.length))) return json({ error: "Invalid category" }, 400);
    }

    const cache = globalThis.caches?.default;
    const cachePath = isCategories || isVersion ? url.pathname + `?type=${type}` : url.pathname;
    const cacheKey = new Request(url.origin + cachePath);
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return forHead(request, hit);
    }

    try {
      let response;
      if (isVersion) {
        response = json(await version(type, env));
      } else {
        const bytes = await sourceBytes(sourceUrl(type, env));
        if (isCategories) {
          response = json({ categories: type === "geoip" ? listIpCategories(bytes) : listCategories(bytes) });
        } else if (attributeMatch) {
          const data = listAttributes(bytes, selected.category);
          if (!data.found) return json({ error: `Category ${selected.category} not found` }, 404);
          response = json(data);
        } else if (type === "geoip") {
          const data = readIpCategory(bytes, selected.category);
          if (!data.found) return json({ error: `Category ${selected.category} not found` }, 404);
          if (data.inverse) return json({ error: "Inverse GeoIP categories cannot be converted to a positive ruleset" }, 422);
          response = responseForRules(renderIp(data, format), format);
        } else {
          const data = readCategory(bytes, selected.category, selected.include, selected.exclude);
          if (!data.found) return json({ error: `Category ${selected.category} not found` }, 404);
          response = responseForRules(renderSite(data.domains, format), format);
        }
      }
      response.headers.set("cache-control", `public, max-age=${CACHE_SECONDS}`);
      if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return forHead(request, response);
    } catch (error) {
      console.error(error);
      if (error.message?.startsWith("MRS requires")) return json({ error: error.message }, 422);
      return json({ error: "Could not load or convert geo data" }, 502);
    }
  }
};
