const base = process.argv[2] || "http://127.0.0.1:8787";
const paths = process.argv.slice(3).length ? process.argv.slice(3) : [
  "/rules/clash/google.yaml",
  "/rules/geoip/clash/cn.yaml",
  "/categories"
];
const samples = 12;

function percentile(values, fraction) {
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
}

for (const path of paths) {
  const times = [];
  const layers = new Map();
  const statuses = new Map();
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      const response = await fetch(new URL(path, base));
      await response.arrayBuffer();
      times.push(performance.now() - start);
      const layer = response.headers.get("x-cache-layer") || "unknown";
      layers.set(layer, (layers.get(layer) || 0) + 1);
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
    } catch (error) {
      statuses.set(error.name || "network error", (statuses.get(error.name || "network error") || 0) + 1);
    }
  }
  times.sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({ path, samples: times.length,
    p50WallMs: times.length ? Number(percentile(times, 0.5).toFixed(1)) : null,
    p95WallMs: times.length ? Number(percentile(times, 0.95).toFixed(1)) : null,
    layers: Object.fromEntries(layers), statuses: Object.fromEntries(statuses) }) + "\n");
}
