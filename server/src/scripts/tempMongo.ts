import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * A stand-in for the Docker MongoDB, on the same port the app expects.
 *
 * Only for looking at the app when Docker is not running. It is a one-node
 * replica set rather than a plain server because booking a job runs inside a
 * transaction, which a standalone mongod refuses. Nothing survives the
 * process: stop it and the data is gone.
 */
async function main() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
    instanceOpts: [{ port: 27030 }],
  });

  console.log(`Temporary MongoDB on ${replSet.getUri()}`);
  console.log("Ctrl-C to stop. Nothing is written to disk.");

  const stop = async () => {
    await replSet.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main();
