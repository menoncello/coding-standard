#!/usr/bin/env bun

import { McpFactory } from '../factories/mcp-factory.js';
import { LoggerFactory } from '../utils/logger/logger-factory.js';

const logger = LoggerFactory.getInstance();
const server = McpFactory.createServer();
server.run().catch((error) => {
    logger.error('Server failed to start:', error);
    process.exit(1);
});