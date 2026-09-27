const SOURCE_FRESH_MS = 24 * 60 * 60 * 1000;
const SOURCE_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const RESULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
export const CACHE_VERSION = "v3";

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function metadataKey(type, choice) {
  const key = `source:${CACHE_VERSION}:${type}:${choice.id}:${choice.url}`;
  return choice.id === "custom" || key.length > 512 ? null : key;
}

export async function getSourceMetadata(kv, key) {
  if (!kv || !key) return null;
  try {
    const value = await kv.get(key, { type: "json" });
    if (value && /^[a-f0-9]{64}$/.test(value.sha256) && Number.isFinite(value.checkedAt) &&
      Date.now() - value.checkedAt < SOURCE_FRESH_MS && Date.now() >= value.checkedAt) return value;
  } catch (error) { console.warn("Source metadata read unavailable", error); }
  return null;
}

export async function putSourceMetadata(kv, key, bytes, lastModified) {
  const sha = await sha256(bytes);
  if (kv && key) {
    try {
      await kv.put(key, JSON.stringify({ sha256: sha, checkedAt: Date.now(), updatedAt: lastModified }), {
        expirationTtl: SOURCE_RETENTION_SECONDS
      });
    } catch (error) { console.warn("Source metadata write unavailable", error); }
  }
  return sha;
}

export function resultKey(type, sha, pathname) {
  return `${CACHE_VERSION}:${type}:${sha}:${pathname}`;
}

export async function getResult(db, key) {
  if (!db) return null;
  try {
    const entry = await db.prepare("SELECT headers, part_count, byte_length FROM rule_cache WHERE cache_key = ? AND expires_at > ?")
      .bind(key, Date.now()).first();
    if (!entry || !Number.isInteger(entry.part_count) || entry.part_count < 1 ||
      entry.part_count > MAX_RESULT_BYTES / CHUNK_BYTES || !Number.isInteger(entry.byte_length) ||
      entry.byte_length < 0 || entry.byte_length > MAX_RESULT_BYTES) return null;
    const { results } = await db.prepare("SELECT part, body FROM rule_cache_parts WHERE cache_key = ? ORDER BY part")
      .bind(key).all();
    if (results.length !== entry.part_count) return null;
    const bytes = new Uint8Array(entry.byte_length);
    let offset = 0;
    for (let i = 0; i < results.length; i++) {
      const part = results[i];
      if (part.part !== i || !Array.isArray(part.body)) return null;
      bytes.set(part.body, offset);
      offset += part.body.length;
    }
    if (offset !== bytes.length) return null;
    return new Response(bytes, { headers: JSON.parse(entry.headers) });
  } catch (error) { console.warn("D1 cache read unavailable", error); }
  return null;
}

export async function putResult(db, key, response) {
  if (!db) return;
  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_RESULT_BYTES) return;
    const parts = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    const expiresAt = Date.now() + RESULT_RETENTION_MS;
    const statements = [db.prepare("INSERT OR REPLACE INTO rule_cache (cache_key, headers, part_count, byte_length, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(key, JSON.stringify(Object.fromEntries(response.headers)), parts, bytes.length, expiresAt)];
    for (let part = 0; part < parts; part++) {
      const body = bytes.subarray(part * CHUNK_BYTES, (part + 1) * CHUNK_BYTES);
      statements.push(db.prepare("INSERT OR REPLACE INTO rule_cache_parts (cache_key, part, body) VALUES (?, ?, ?)")
        .bind(key, part, body));
    }
    await db.batch(statements);
    await db.prepare("DELETE FROM rule_cache WHERE cache_key IN (SELECT cache_key FROM rule_cache WHERE expires_at < ? LIMIT 10)")
      .bind(Date.now()).run();
  } catch (error) { console.warn("D1 cache write unavailable", error); }
}
