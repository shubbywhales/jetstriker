     1|Place D1 schema migrations in this folder when your app adds database-backed features.
     2|
     3|- Use numbered `.sql` files such as `0000_auth.sql`, `0001_add_profiles.sql`, and so on.
     4|- Keep migrations append-only. Create a new numbered file for each schema change.
     5|- With the default `DB` binding in `wrangler.jsonc`, run `pnpm migrate:local` for local migrations and `pnpm migrate:prod` for remote production migrations.
     6|