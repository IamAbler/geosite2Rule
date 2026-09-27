import { listCategories, readCategory } from "./geosite.js";

const DEFAULT_SOURCE = "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const CACHE_SECONDS = 3600;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}

function parseSelection(raw) {
  const parts = raw.toLowerCase().split("@");
  if (!/^[a-z0-9_!.-]{1,100}$/.test(parts[0]) || parts.length > 9) return null;
  const include = [];
  const exclude = [];
  for (const part of parts.slice(1)) {
    if (!/^-?[a-z0-9_!.-]{1,50}$/.test(part)) return null;
    if (part.startsWith("-")) exclude.push(part.slice(1));
    else include.push(part);
  }
  if (include.some(attr => exclude.includes(attr))) return null;
  return { category: parts[0], include, exclude };
}

async function sourceBytes(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("SOURCE_URL must be an HTTPS URL");
  const response = await fetch(url, { cf: { cacheEverything: true, cacheTtl: CACHE_SECONDS } });
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
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_SOURCE_BYTES) throw new Error("Source exceeds 32 MiB limit");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function render(domains, format) {
  const lines = new Set();
  let skipped = 0;
  for (const { type, value } of domains) {
    if (!value || /[\r\n,]/.test(value)) { skipped++; continue; }
    const kind = ["DOMAIN-KEYWORD", "DOMAIN-REGEX", "DOMAIN-SUFFIX", "DOMAIN"][type];
    if (!kind || (format === "surge" && type === 1)) { skipped++; continue; }
    lines.add(`${kind},${value}`);
  }
  const rules = [...lines].sort();
  const body = format === "clash"
    ? (rules.length ? `payload:\n${rules.map(rule => `  - ${JSON.stringify(rule)}`).join("\n")}\n` : "payload: []\n")
    : `${rules.join("\n")}${rules.length ? "\n" : ""}`;
  return { body, skipped, count: rules.length };
}

function homepage(origin) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>geosite2Rule</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:740px;margin:3rem auto;padding:0 1rem;color:#18202b}code,pre{background:#f1f4f8;padding:.15rem .35rem;border-radius:4px}pre{padding:1rem;overflow:auto}a{color:#1266b0}input,select,button{font:inherit;padding:.5rem;margin:.25rem 0}input{width:min(100%,20rem)}</style><h1>geosite2Rule</h1><p>把 geosite.dat 的分类转换成 Clash/Mihomo 或 Surge 可订阅的规则集。</p><form id="builder"><label>分类 <input id="category" value="google" required placeholder="如 google@ads"></label> <label>格式 <select id="format"><option value="clash">Clash YAML</option><option value="clash-text">Clash 文本</option><option value="surge">Surge</option></select></label> <button>生成地址</button></form><p><a id="result" hidden></a></p><p><a href="/categories">查看所有分类</a></p><h2>Clash/Mihomo</h2><pre>${origin}/rules/clash/google.yaml</pre><p>在 rule-providers 中使用 behavior: classical、format: yaml。</p><h2>Surge</h2><pre>${origin}/rules/surge/google.list</pre><p>在 [Rule] 中使用 RULE-SET,上述地址,策略名。分类可加属性过滤，例如 <code>google@ads</code> 或 <code>google@-ads</code>。Surge 不支持 geosite 的域名正则，这部分规则会略过。</p><script>document.getElementById('builder').addEventListener('submit',event=>{event.preventDefault();const category=document.getElementById('category').value.trim();const format=document.getElementById('format').value;const link=document.getElementById('result');link.href='/rules/'+format+'/'+encodeURIComponent(category)+(format==='clash'?'.yaml':'.list');link.textContent=link.href;link.hidden=false})</script></html>`;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response(request.method === "HEAD" ? null : homepage(url.origin), { headers: { "content-type": "text/html; charset=utf-8" } });
    const isCategories = url.pathname === "/categories";
    const match = /^\/rules\/(clash|clash-text|surge)\/([^/]+)\.(yaml|list|txt)$/.exec(url.pathname);
    if (!isCategories && !match) return json({ error: "Not found" }, 404);
    if (match && ((match[1] === "clash" && match[3] !== "yaml") || (match[1] !== "clash" && match[3] === "yaml"))) {
      return json({ error: "Invalid extension for format" }, 400);
    }
    let selection;
    if (match) {
      try { selection = parseSelection(decodeURIComponent(match[2])); }
      catch { return json({ error: "Invalid category" }, 400); }
      if (!selection) return json({ error: "Invalid category" }, 400);
    }
    const cache = globalThis.caches?.default;
    const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return request.method === "HEAD" ? new Response(null, cached) : cached;
    }
    try {
      const bytes = await sourceBytes(env.SOURCE_URL || DEFAULT_SOURCE);
      let response;
      if (isCategories) {
        response = json({ categories: listCategories(bytes) });
      } else {
        const { found, domains } = readCategory(bytes, selection.category, selection.include, selection.exclude);
        if (!found) return json({ error: `Category ${selection.category} not found` }, 404);
        const { body, skipped, count } = render(domains, match[1]);
        response = new Response(body, { headers: {
          "content-type": match[1] === "clash" ? "application/yaml; charset=utf-8" : "text/plain; charset=utf-8",
          "x-rule-count": String(count),
          "x-skipped-rules": String(skipped),
          "access-control-allow-origin": "*"
        } });
      }
      response.headers.set("cache-control", `public, max-age=${CACHE_SECONDS}`);
      if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return request.method === "HEAD" ? new Response(null, response) : response;
    } catch (error) {
      console.error(error);
      return json({ error: "Could not load or parse geosite.dat" }, 502);
    }
  }
};
