#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

function readJsonSafe(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function migrate(root) {
  const stateJsonPath = path.join(root, 'reports', 'state.json');
  const state = readJsonSafe(stateJsonPath, null);
  if (!state) {
    return { noop: true, reason: 'no state.json' };
  }
  state.schemaVersion = '2.0.0';
  fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2), 'utf8');
  return { updated: true };
}

module.exports = {
  from: '1.3.0',
  to: '2.0.0',
  description: 'Update schemaVersion in state.json (no data shape changes)',
  migrate,
};
