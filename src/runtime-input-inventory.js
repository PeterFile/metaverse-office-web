function createRuntimeInputInventory({
  hermesRuntimeSourcesFile = '',
  hermesRuntimeSourcesPaths = [],
  taskEvidenceFile = '',
  taskEvidencePaths = []
} = {}) {
  return {
    hermes_runtime_sources: createInputSourceInventory({
      legacyFile: hermesRuntimeSourcesFile,
      paths: hermesRuntimeSourcesPaths
    }),
    task_evidence_sources: createInputSourceInventory({
      legacyFile: taskEvidenceFile,
      paths: taskEvidencePaths
    })
  };
}

function createInputSourceInventory({ legacyFile, paths }) {
  const configuredPathCount = countConfiguredInputs(paths);
  if (configuredPathCount > 0) {
    return {
      enabled: true,
      mode: 'paths',
      configured_input_count: configuredPathCount
    };
  }

  if (isConfiguredInput(legacyFile)) {
    return {
      enabled: true,
      mode: 'file',
      configured_input_count: 1
    };
  }

  return {
    enabled: false,
    mode: 'unset',
    configured_input_count: 0
  };
}

function countConfiguredInputs(values) {
  return Array.isArray(values) ? values.filter(isConfiguredInput).length : 0;
}

function isConfiguredInput(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = {
  createRuntimeInputInventory
};
