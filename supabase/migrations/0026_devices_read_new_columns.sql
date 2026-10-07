-- devices has column-level SELECT grants (managers and customers must never read api_key_hash). Columns added
-- later need their own grant: account_id (0024), lat/lng (0007). Without it, any query that names them fails with
-- "permission denied for table devices" (the manager live board and the customer portal did). Row-level security
-- still limits rows to the caller's own business or own basket.
grant select (account_id, lat, lng) on public.devices to authenticated;
