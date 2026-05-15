const path = require('node:path');

const { createAppServer } = require('./server');
const { createPrototypeStore } = require('./store/prototype-store');

async function main() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const storeBackend = process.env.METAVERSE_OFFICE_STORE_BACKEND || '';
  const useSqlite =
    storeBackend === 'sqlite' || (!storeBackend && process.env.METAVERSE_OFFICE_SQLITE_STORE_FILE);

  if (storeBackend && storeBackend !== 'jsonl' && storeBackend !== 'sqlite') {
    throw new Error(`Unknown METAVERSE_OFFICE_STORE_BACKEND: ${storeBackend}`);
  }

  const filePath = useSqlite
    ? process.env.METAVERSE_OFFICE_SQLITE_STORE_FILE ||
      path.join(process.cwd(), 'data', 'prototype-store.sqlite')
    : process.env.METAVERSE_OFFICE_STORE_FILE ||
      path.join(process.cwd(), 'data', 'prototype-store.jsonl');

  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
    : [];

  const store = await createPrototypeStore(
    useSqlite
      ? {
          sqliteFilePath: filePath,
          sqliteBinPath: process.env.METAVERSE_OFFICE_SQLITE_BIN
        }
      : { filePath }
  );
  const server = createAppServer({ store, allowedOrigins });

  server.listen(port, () => {
    process.stdout.write(
      `metaverse-office backend listening on http://127.0.0.1:${port}\nstore: ${filePath}\n`
    );
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
