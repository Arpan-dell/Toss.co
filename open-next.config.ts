// Cloudflare Workers build (OpenNext). Trial branch: no R2 incremental cache (R2 needs a card on file),
// so ISR pages re-render instead of being served from a cache.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
