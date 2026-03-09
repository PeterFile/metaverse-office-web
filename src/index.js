const path = require('node:path');

const { createAppServer } = require('./server');
const { createPrototypeStore } = require('./store/prototype-store');

async function main() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const filePath =
    process.env.METAVERSE_OFFICE_STORE_FILE ||
    path.join(process.cwd(), 'data', 'prototype-store.jsonl');

  const store = await createPrototypeStore({ filePath });
  const server = createAppServer({ store });

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
