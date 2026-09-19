-- What this install is configured to do, and the credentials that let it.
--
-- One row per setting, the VALUE ENCRYPTED with a key held in a 0600 file
-- outside the database (see src/lib/server/settings-store.ts). That placement is
-- the point rather than a detail: a dump of this table, a nightly backup or a
-- restic snapshot beside it carries ciphertext and no key — the same property
-- the sealed-run keys already rely on.
--
-- `key` is namespaced (`provider.azure.apiKey`), so one provider's fields cannot
-- collide with another's and removing a provider is deleting its rows.
create table if not exists policy_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
