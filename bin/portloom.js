#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

// Check if TypeScript source or compiled dist exists
const distServer = path.join(__dirname, '..', 'dist', 'server.js');
const distCli = path.join(__dirname, '..', 'dist', 'cli.js');

if (fs.existsSync(distCli)) {
  require(distCli);
} else if (fs.existsSync(distServer)) {
  require(distServer);
} else {
  // Try tsx runner
  require('tsx/cjs');
  require('../src/cli.ts');
}
