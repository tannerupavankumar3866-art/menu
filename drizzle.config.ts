import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",       // ✅ must be "d1" for Cloudflare D1
  driver: "d1-http",   // Cloudflare D1 driver
  dbCredentials: {
    url: "DB",         // binding name from wrangler.jsonc
  },
})