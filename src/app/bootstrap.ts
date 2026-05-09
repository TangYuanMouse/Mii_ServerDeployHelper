import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config';
import { PowerShellRunner } from '../adapters/windows/powershell-runner';
import { ShellRunner } from '../adapters/linux/shell-runner';
import { FileStateStore } from '../storage/files/file-state-store';
import { ToolRegistry } from '../tools/registry';
import { inspectOsTool } from '../tools/inspect/inspect-os.tool';
import { inspectPythonTool } from '../tools/inspect/inspect-python.tool';
import { installPythonTool } from '../tools/install/install-python.tool';
import { verifyPythonTool } from '../tools/verify/verify-python.tool';
import { HeuristicLlmProvider } from '../llm/provider';
import { OpenAiCompatibleProvider } from '../llm/openai-compatible-provider';
import { PolicyEngine } from '../policy/policy-engine';
import { ContextBuilder } from '../runtime/context-builder';
import { LoopController } from '../runtime/loop-controller';
import { SequentialTaskQueue } from '../runtime/task-queue';
import { AgentRuntime } from '../runtime/agent-runtime';
import { LlmProvider } from '../contracts/llm';

export function createApplication() {
  const config = loadConfig();
  const stateStore = new FileStateStore(config.dataDir);
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(inspectOsTool);
  toolRegistry.register(inspectPythonTool);
  toolRegistry.register(installPythonTool);
  toolRegistry.register(verifyPythonTool);

  const llmProvider = createProvider(config);
  const policyEngine = new PolicyEngine(toolRegistry, config.allowMutations, config.autoApproveHighRisk);
  const contextBuilder = new ContextBuilder(stateStore, toolRegistry);
  const loopController = new LoopController(stateStore, contextBuilder, llmProvider, policyEngine, toolRegistry, {
    windows: new PowerShellRunner(),
    linux: new ShellRunner()
  });
  const queue = new SequentialTaskQueue();
  const runtime = new AgentRuntime(stateStore, queue, loopController);

  return {
    config,
    runtime
  };
}

async function requestHandler(req: IncomingMessage, res: ServerResponse, runtime: AgentRuntime): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (method === 'GET' && url.pathname === '/health') {
    respondJson(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && url.pathname === '/tasks') {
    const body = await readJsonBody(req);
    const input = typeof body.input === 'string' ? body.input : '';

    if (!input) {
      respondJson(res, 400, { error: 'input is required' });
      return;
    }

    const taskId = await runtime.submitTask(input, 'api');
    void runtime.runTask(taskId);
    respondJson(res, 202, { taskId });
    return;
  }

  const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
  if (method === 'GET' && taskMatch) {
    const task = await runtime.getTask(taskMatch[1]);
    if (!task) {
      respondJson(res, 404, { error: 'task not found' });
      return;
    }

    respondJson(res, 200, task);
    return;
  }

  const stepsMatch = url.pathname.match(/^\/tasks\/([^/]+)\/steps$/);
  if (method === 'GET' && stepsMatch) {
    const task = await runtime.getTask(stepsMatch[1]);
    if (!task) {
      respondJson(res, 404, { error: 'task not found' });
      return;
    }

    const steps = await runtime.getTaskSteps(stepsMatch[1]);
    respondJson(res, 200, steps);
    return;
  }

  respondJson(res, 404, { error: 'not found' });
}

function createProvider(config: ReturnType<typeof loadConfig>): LlmProvider {
  if (config.providerMode === 'openai-compatible' && config.openAiBaseUrl && config.openAiApiKey && config.openAiModel) {
    return new OpenAiCompatibleProvider({
      baseUrl: config.openAiBaseUrl,
      apiKey: config.openAiApiKey,
      model: config.openAiModel
    });
  }

  return new HeuristicLlmProvider();
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function respondJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

if (require.main === module) {
  const { config, runtime } = createApplication();
  const server = createServer((req, res) => {
    void requestHandler(req, res, runtime).catch((error) => {
      respondJson(res, 500, { error: error instanceof Error ? error.message : 'unknown error' });
    });
  });

  server.listen(config.port, () => {
    console.log(`Agent API listening on http://127.0.0.1:${config.port}`);
  });
}