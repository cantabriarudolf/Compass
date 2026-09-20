import { Client } from "pg"
const client = new Client({ connectionString: process.env.POSTGRES_URL })
await client.connect()
const tables = await client.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()"
)
for (const t of tables.rows) {
  await client.query(`TRUNCATE TABLE "${t.tablename}" CASCADE`)
}
console.log("✅ PostgreSQL limpio:", tables.rows.length, "tablas")
await client.end()
