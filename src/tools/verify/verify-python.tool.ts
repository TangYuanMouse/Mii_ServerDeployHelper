import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolDefinition } from '../../contracts/tool';

const execFileAsync = promisify(execFile);

interface VerifyPythonArgs {
  expectedVersion: string;
}

export const verifyPythonTool: ToolDefinition<VerifyPythonArgs> = {
  name: 'verify_python',
  description: 'Verify that the expected Python version is available on the host.',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    required: ['expectedVersion'],
    properties: {
      expectedVersion: { type: 'string' }
    },
    additionalProperties: false
  },
  async execute(args) {
    try {
      const result = await execFileAsync('python', ['--version'], { windowsHide: true });
      const output = `${result.stdout} ${result.stderr}`.trim();
      const match = output.match(/Python\s+([0-9]+(?:\.[0-9]+){1,2})/i);
      const version = match?.[1];
      const ok = version === args.expectedVersion;

      return {
        ok,
        summary: ok ? `Verified Python ${args.expectedVersion}.` : `Expected Python ${args.expectedVersion}, got ${version ?? 'unknown'}.`,
        rawOutput: output,
        observations: version
          ? {
              pythonVersions: [version]
            }
          : undefined
      };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      return {
        ok: false,
        summary: 'Failed to verify Python runtime.',
        rawOutput: `${failure.stdout ?? ''}\n${failure.stderr ?? failure.message}`.trim()
      };
    }
  },
  async verify(args, result) {
    return {
      ok: result.ok,
      done: result.ok,
      reason: result.ok ? `Python ${args.expectedVersion} verified` : result.summary
    };
  }
};