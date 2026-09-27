import { createHash } from "node:crypto";
import { readFile, mkdir, rm, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import worker from "../src/index.js";

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const formats = ["clash", "mrs", "sing-box"];
const hotset = { geosite: ["google", "geolocation-cn"], geoip: ["cn", "private"] };
const extension = { clash: "yaml", mrs: "mrs", "sing-box": "json" };
const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const sources = {
  geosite: config.vars?.SOURCE_URL,
  geoip: config.vars?.GEOIP_URL
};
if (!sources.geosite || !sources.geoip) throw new Error("Configure SOURCE_URL and GEOIP_URL in wrangler.jsonc");

async function sourceBytes(type) {
  const fileFlag = type === "geosite" ? "--site-file" : "--ip-file";
  const fileIndex = process.argv.indexOf(fileFlag);
  if (fileIndex >= 0) {
    if (!process.argv[fileIndex + 1]) throw new Error(`Missing path after ${fileFlag}`);
    return new Uint8Array(await readFile(process.argv[fileIndex + 1]));
  }
  const response = await fetch(sources[type], { headers: { "user-agent": "geosite2rule-prebuild" } });
  if (!response.ok || !response.body) throw new Error(`${type} download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_SOURCE_BYTES) throw new Error(`${type} source exceeds 32 MiB`);
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

const data = Object.fromEntries(await Promise.all(Object.keys(sources).map(async type => [type, await sourceBytes(type)])));
const sourceHashes = Object.fromEntries(Object.entries(data).map(([type, bytes]) =>
  [type, createHash("sha256").update(bytes).digest("hex")]));
const codeFiles = ["src/index.js", "src/geosite.js", "src/geoip.js", "src/mrs.js", "src/protobuf.js", "scripts/build-prebuilt.mjs"];
const codeHash = createHash("sha256");
for (const file of codeFiles) codeHash.update(await readFile(new URL(`../${file}`, import.meta.url)));
const buildKey = createHash("sha256").update(JSON.stringify({ sources, sourceHashes, hotset, formats,
  codeHash: codeHash.digest("hex") })).digest("hex");
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error("Missing path after --output");
const target = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : "public/prebuilt");
try {
  const previous = JSON.parse(await readFile(resolve(target, "manifest.json"), "utf8"));
  if (previous.buildKey === buildKey) {
    process.stdout.write("Prebuilt rules are current\n");
    process.exit(0);
  }
} catch { /* Build the assets if no valid manifest exists. */ }
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const type = Object.keys(sources).find(key => String(input) === sources[key]);
  if (!type) throw new Error(`Unexpected build fetch: ${String(input)}`);
  if (options?.method === "HEAD") return new Response(null, { status: 200 });
  return new Response(data[type], { status: 200 });
};

const temporary = `${target}.tmp`;
const entries = [];
try {
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  for (const [type, categories] of Object.entries(hotset)) {
    for (const category of categories) {
      for (const format of formats) {
        const path = `${type}/${format}/${category}.${extension[format]}`;
        const response = await worker.fetch(new Request(`https://prebuild.example/rules/${type === "geoip" ? "geoip/" : ""}${format}/${category}.${extension[format]}`),
          { SOURCE_URL: sources.geosite, GEOIP_URL: sources.geoip }, { waitUntil() {} });
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
        const body = new Uint8Array(await response.arrayBuffer());
        const destination = resolve(temporary, path);
        await mkdir(resolve(destination, ".."), { recursive: true });
        await writeFile(destination, body);
        entries.push({ path: `/prebuilt/${path}`, type, format, category,
          rules: Number(response.headers.get("x-rule-count")), bytes: body.byteLength });
      }
    }
  }
  await writeFile(resolve(temporary, "manifest.json"), JSON.stringify({
    builtAt: new Date().toISOString(), buildKey, sources, sourceHashes, entries
  }, null, 2) + "\n");
  await rm(target, { recursive: true, force: true });
  await rename(temporary, target);
  process.stdout.write(`Generated ${entries.length} static rules in ${target}\n`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(temporary, { recursive: true, force: true });
}
