import { ToolDefinition } from '../../contracts/tool';
import { PowerShellRunner } from '../../adapters/windows/powershell-runner';
import { ShellRunner } from '../../adapters/linux/shell-runner';

interface InstallPythonArgs {
  version: string;
  architecture?: 'x64' | 'x86';
  addToPath?: boolean;
  installForAllUsers?: boolean;
}

export const installPythonTool: ToolDefinition<InstallPythonArgs> = {
  name: 'install_python',
  description: 'Install a specific Python version through a controlled OS-specific path.',
  mutating: true,
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    required: ['version'],
    properties: {
      version: { type: 'string' },
      architecture: { type: 'string', enum: ['x64', 'x86'] },
      addToPath: { type: 'boolean' },
      installForAllUsers: { type: 'boolean' }
    },
    additionalProperties: false
  },
  async precheck(args) {
    if (!args.version) {
      return {
        ok: false,
        reason: 'install_python requires a version argument'
      };
    }

    return { ok: true };
  },
  async execute(args, ctx) {
    if (ctx.hostSnapshot.os.family === 'windows') {
      return installOnWindows(args, ctx.adapters.windows as PowerShellRunner | undefined);
    }

    if (ctx.hostSnapshot.os.family === 'linux') {
      return installOnLinux(args, ctx.adapters.linux as ShellRunner | undefined);
    }

    return {
      ok: false,
      summary: 'Cannot install Python before the host operating system has been inspected.'
    };
  }
};

async function installOnWindows(args: InstallPythonArgs, runner?: PowerShellRunner) {
  if (!runner) {
    return {
      ok: false,
      summary: 'Windows installer adapter is not configured.'
    };
  }

  const architecture = args.architecture ?? 'x64';
  const installerName = architecture === 'x64' ? `python-${args.version}-amd64.exe` : `python-${args.version}.exe`;
  const downloadUrl = `https://www.python.org/ftp/python/${args.version}/${installerName}`;
  const installAllUsers = args.installForAllUsers === false ? 0 : 1;
  const prependPath = args.addToPath === false ? 0 : 1;
  const tempPath = `$env:TEMP\\${installerName}`;
  const script = [
    `$url = '${downloadUrl}'`,
    `$installer = '${tempPath}'`,
    `Invoke-WebRequest -Uri $url -OutFile $installer`,
    `Start-Process -FilePath $installer -ArgumentList '/quiet InstallAllUsers=${installAllUsers} PrependPath=${prependPath} Include_test=0' -Wait`,
    `python --version`
  ].join('; ');
  const result = await runner.run(script);

  return {
    ok: result.exitCode === 0,
    summary: result.exitCode === 0 ? `Installed Python ${args.version} on Windows.` : `Failed to install Python ${args.version} on Windows.`,
    exitCode: result.exitCode,
    rawOutput: [result.stdout, result.stderr].filter(Boolean).join('\n'),
    observations: result.exitCode === 0
      ? {
          installedVersion: args.version
        }
      : undefined
  };
}

async function installOnLinux(args: InstallPythonArgs, runner?: ShellRunner) {
  if (!runner) {
    return {
      ok: false,
      summary: 'Linux installer adapter is not configured.'
    };
  }

  const command = `python3 --version`;
  const existing = await runner.run(command);
  if (existing.exitCode === 0 && `${existing.stdout} ${existing.stderr}`.includes(args.version)) {
    return {
      ok: true,
      summary: `Python ${args.version} is already available on Linux host.`,
      observations: {
        installedVersion: args.version
      },
      rawOutput: [existing.stdout, existing.stderr].filter(Boolean).join('\n')
    };
  }

  return {
    ok: false,
    summary: `Linux install for specific Python version ${args.version} is not implemented yet. Add an adapter for your package source.`,
    rawOutput: [existing.stdout, existing.stderr].filter(Boolean).join('\n')
  };
}