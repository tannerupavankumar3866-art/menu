import { drizzle } from "drizzle-orm/d1"

// Type for DB client
export type DBClient = ReturnType<typeof drizzle>

/**
 * Get DB instance:
 * - Accepts a D1Database directly (from c.env.DB)
 * - Throws error if no database provided
 */
export const getDB = (db?: D1Database): DBClient => {
  if (!db) {
    throw new Error(
      "D1 database not found. Make sure to run via `wrangler dev` or pass a D1 binding."
    )
  }
  return drizzle(db)
}