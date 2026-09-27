CREATE TABLE IF NOT EXISTS rule_cache (
  cache_key TEXT PRIMARY KEY,
  headers TEXT NOT NULL,
  part_count INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rule_cache_expires_at ON rule_cache (expires_at);

CREATE TABLE IF NOT EXISTS rule_cache_parts (
  cache_key TEXT NOT NULL REFERENCES rule_cache(cache_key) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  part INTEGER NOT NULL,
  body BLOB NOT NULL,
  PRIMARY KEY (cache_key, part)
);
