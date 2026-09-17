import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { ensureIndexes } from "../models";

/** npm run seed: rebuilds the Northline demo for today, whatever day it was last built for. */
async function main(): Promise<void> {
  const connection = await connectDatabase();
  await ensureIndexes();
  const result = await seedDemo();
  console.log(`Seeded Northline for ${result.today} in "${connection.connection.name}": ${result.jobs} jobs`);
  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  console.error("Seed failed:", error);
  await disconnectDatabase();
  process.exit(1);
});
