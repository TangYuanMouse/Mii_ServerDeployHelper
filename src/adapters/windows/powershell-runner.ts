import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class PowerShellRunner {
  async run(script: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0
      };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? failure.message,
        exitCode: typeof failure.code === 'number' ? failure.code : 1
      };
    }
  }
}