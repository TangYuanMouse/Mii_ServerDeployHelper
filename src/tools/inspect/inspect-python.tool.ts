import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolDefinition } from '../../contracts/tool';

const execFileAsync = promisify(execFile);

export const inspectPythonTool: ToolDefinition = {
  name: 'inspect_python',
  description: 'Inspect Python versions available on the current host.',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute() {
    const versions = new Set<string>();
    const rawOutputs: string[] = [];

    for (const [command, args] of [
      ['python', ['--version']],
      ['python3', ['--version']],
      ['py', ['-V']]
    ] as const) {
      try {
        const result = await execFileAsync(command, args, { windowsHide: true });
        const output = `${result.stdout} ${result.stderr}`.trim();
        rawOutputs.push(output);
        const match = output.match(/Python\s+([0-9]+(?:\.[0-9]+){1,2})/i);
        if (match) {
          versions.add(match[1]);
        }
      } catch (error) {
        const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        rawOutputs.push(`${command}: ${failure.stderr ?? failure.message}`);
      }
    }

    return {
      ok: true,
      summary: versions.size > 0 ? `Detected Python versions: ${[...versions].join(', ')}` : 'No Python runtime detected.',
      observations: {
        pythonVersions: [...versions]
      },
      rawOutput: rawOutputs.join('\n')
    };
  }
};