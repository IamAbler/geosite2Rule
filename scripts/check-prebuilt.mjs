import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../public/prebuilt/manifest.json", import.meta.url), "utf8"));
if (manifest.sources?.geosite !== config.vars?.SOURCE_URL ||
    manifest.sources?.geoip !== config.vars?.GEOIP_URL) {
  throw new Error("Prebuilt rules use different source URLs. Run npm run build:prebuilt before building.");
}
