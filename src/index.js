const path = require('node:path');

const { createAppServer } = require('./server');
const {
  createControllerSnapshotCollector,
  createHermesRuntimeSourcesReader,
  createHermesRuntimeSourcesFileReader
} = require('./collectors/controller-snapshot');
const {
  taskEvidenceFileReaderFrom,
  taskEvidencePathsReaderFrom
} = require('./collectors/task-evidence-source');
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
  const hermesRuntimeSourcesFile = process.env.METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_FILE;
  const hermesRuntimeSourcesPaths = parseDelimitedEnvPaths(
    process.env.METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS
  );
  const taskEvidenceFile = process.env.METAVERSE_OFFICE_TASK_EVIDENCE_FILE;
  const taskEvidencePaths = parseDelimitedEnvPaths(
    process.env.METAVERSE_OFFICE_TASK_EVIDENCE_PATHS
  );
  const controllerSnapshotCollector = createControllerSnapshotCollector({
    ...createHermesRuntimeSourcesOptions({ hermesRuntimeSourcesFile, hermesRuntimeSourcesPaths }),
    ...createTaskEvidenceOptions({ taskEvidenceFile, taskEvidencePaths })
  });
  const server = createAppServer({ store, controllerSnapshotCollector, allowedOrigins });

  server.listen(port, () => {
    process.stdout.write(
      `metaverse-office backend listening on http://127.0.0.1:${port}\nstore: ${filePath}\n`
    );
  });
}

function parseDelimitedEnvPaths(value) {
  return value ? value.split(path.delimiter).map((item) => item.trim()).filter(Boolean) : [];
}

function createHermesRuntimeSourcesOptions({ hermesRuntimeSourcesFile, hermesRuntimeSourcesPaths }) {
  if (hermesRuntimeSourcesPaths.length > 0) {
    return {
      readHermesRuntimeSources: createHermesRuntimeSourcesReader({
        inputPaths: hermesRuntimeSourcesPaths
      })
    };
  }

  if (hermesRuntimeSourcesFile) {
    return {
      readHermesRuntimeSources: createHermesRuntimeSourcesFileReader({
        filePath: hermesRuntimeSourcesFile
      })
    };
  }

  return {};
}

function createTaskEvidenceOptions({ taskEvidenceFile, taskEvidencePaths = [] }) {
  if (taskEvidencePaths.length > 0) {
    const reader = taskEvidencePathsReaderFrom({ inputPaths: taskEvidencePaths });
    return {
      readTaskEvidenceCandidates: () => reader.readEvidenceCandidates()
    };
  }

  if (!taskEvidenceFile) {
    return {};
  }

  const reader = taskEvidenceFileReaderFrom({ filePath: taskEvidenceFile });
  return {
    readTaskEvidenceCandidates: () => reader.readEvidenceCandidates()
  };
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseDelimitedEnvPaths,
  createHermesRuntimeSourcesOptions,
  createTaskEvidenceOptions
};
