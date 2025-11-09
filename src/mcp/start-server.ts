#!/usr/bin/env bun

import CodingStandardsServer from './server.js';

const server = new CodingStandardsServer();
server.run().catch((error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});