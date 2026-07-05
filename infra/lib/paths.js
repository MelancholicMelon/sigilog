// Runtime file locations, pinned by contracts/transport.md §4 (repo root).
'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const RUNTIME = path.join(REPO_ROOT, 'runtime');

module.exports = {
  PORT: 8080,
  UI_ORIGIN: 'http://localhost:3000',
  REPO_ROOT,
  LEDGER_PATH: path.join(RUNTIME, 'ledger.jsonl'),
  ENVELOPES_PATH: path.join(RUNTIME, 'envelopes.jsonl'),
  REGISTRY_PATH: path.join(RUNTIME, 'registry.json'),
};
