import os from 'node:os';
import { ToolDefinition } from '../../contracts/tool';

export const inspectOsTool: ToolDefinition = {
  name: 'inspect_os',
  description: 'Collect local operating system information.',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute() {
    const family = process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : 'unknown';
    return {
      ok: true,
      summary: `Detected ${family} ${os.release()} on ${os.arch()}.`,
      observations: {
        osFamily: family,
        osVersion: os.release(),
        arch: os.arch()
      }
    };
  }
};