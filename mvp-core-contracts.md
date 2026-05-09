# 轻量级环境部署 Agent MVP 核心契约

## 1. 目的

这份文档的目标，是把前面的架构规划和运行时设计继续收敛到“可以开始编码”的程度。

它重点回答 5 个问题：

1. 第一版代码仓库应该怎么组织。
2. Agent Runtime 里最核心的对象模型是什么。
3. Tool Calling 的协议长什么样。
4. 最小 API 和 CLI 入口应该是什么。
5. 第一版先实现哪些能力，才能尽快跑通。

## 2. 技术口径建议

为了轻量、快速、易部署，第一版建议采用：

1. 单仓库。
2. 单进程服务。
3. 本地 SQLite。
4. 本地文件日志。
5. TypeScript 作为示例实现语言。

这里选 TypeScript 的原因不是它绝对最好，而是它更适合当前目标：

1. 做 HTTP API 和 CLI 都很顺手。
2. 对 JSON Schema 和 Tool Calling 协议支持自然。
3. 在 Windows 和 Linux 上部署简单。
4. 和后续 Node/Nginx 部署场景贴近。

如果你后面更希望走 Python，也完全可以复用这份对象模型和协议定义，只需要把接口翻译过去。

## 3. 推荐目录结构

第一版建议先按下面这个结构建仓：

```text
src/
  app/
    bootstrap.ts
    config.ts
  runtime/
    agent-runtime.ts
    loop-controller.ts
    context-builder.ts
    task-runner.ts
    task-queue.ts
  contracts/
    task.ts
    tool.ts
    policy.ts
    state.ts
    llm.ts
  tools/
    registry.ts
    inspect/
      inspect-os.tool.ts
      inspect-python.tool.ts
    install/
      install-python.tool.ts
      install-node.tool.ts
    config/
      write-env-file.tool.ts
      write-nginx-config.tool.ts
    verify/
      verify-python.tool.ts
      verify-http-endpoint.tool.ts
  adapters/
    windows/
      powershell-runner.ts
      windows-python-installer.ts
      windows-service-manager.ts
    linux/
      shell-runner.ts
      apt-installer.ts
      systemd-manager.ts
  llm/
    provider.ts
    openai-compatible-provider.ts
    prompt-builder.ts
    output-parser.ts
  policy/
    policy-engine.ts
    risk-matrix.ts
  storage/
    sqlite/
      sqlite-state-store.ts
    files/
      artifact-store.ts
      audit-log-store.ts
  api/
    http-server.ts
    routes/
      tasks.ts
      health.ts
  cli/
    main.ts
  reporting/
    task-reporter.ts
    summary-renderer.ts
```

## 4. 核心对象模型

下面这些对象，是第一版最应该先固定下来的。

### 4.1 TaskRequest

表示用户提交进来的原始需求。

```ts
export interface TaskRequest {
  requestId: string;
  source: 'api' | 'cli';
  userInput: string;
  requestedBy?: string;
  createdAt: string;
}
```

### 4.2 TaskGoal

表示 Agent 理解后的任务目标。

```ts
export interface TaskGoal {
  category: 'install_runtime' | 'configure_service' | 'deploy_app' | 'open_port' | 'verify_environment';
  targetName: string;
  targetVersion?: string;
  targetHost: 'local';
  constraints: string[];
  successCriteria: string[];
}
```

### 4.3 TaskState

表示任务运行状态。

```ts
export type TaskStatus =
  | 'created'
  | 'normalizing'
  | 'observing'
  | 'planning'
  | 'waiting_approval'
  | 'running'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface TaskState {
  taskId: string;
  request: TaskRequest;
  goal?: TaskGoal;
  status: TaskStatus;
  currentStep?: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### 4.4 HostSnapshot

表示 Agent 对当前服务器环境的观测结果。

```ts
export interface HostSnapshot {
  os: {
    family: 'windows' | 'linux';
    version: string;
    arch: string;
  };
  runtimes: {
    pythonVersions: string[];
    nodeVersions: string[];
  };
  services: string[];
  ports: number[];
  directories: string[];
  collectedAt: string;
}
```

### 4.5 AgentDecision

表示一轮 Loop 中模型做出的决策。

```ts
export interface AgentDecision {
  thought: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  expectsVerification: boolean;
  stop: boolean;
}
```

注意这里的 thought 和 reason 可以记录，但不应该用于放开执行权限。真正的执行只能依赖 toolName 和 arguments。

### 4.6 ToolDefinition

表示一个可被调用的部署工具。

```ts
export interface ToolDefinition<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  inputSchema: unknown;
  precheck?: (args: TArgs, ctx: ToolExecutionContext) => Promise<PrecheckResult>;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<ToolResult>;
  verify?: (args: TArgs, result: ToolResult, ctx: ToolExecutionContext) => Promise<VerifyResult>;
  rollback?: (args: TArgs, ctx: ToolExecutionContext) => Promise<void>;
}
```

### 4.7 ToolExecutionContext

表示工具执行时能拿到的上下文。

```ts
export interface ToolExecutionContext {
  taskId: string;
  hostSnapshot: HostSnapshot;
  workingDirectory: string;
  logger: {
    info(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
  };
  stores: {
    stateStore: unknown;
    artifactStore: unknown;
  };
  adapters: {
    windows?: unknown;
    linux?: unknown;
  };
}
```

### 4.8 ToolResult

```ts
export interface ToolResult {
  ok: boolean;
  summary: string;
  exitCode?: number;
  observations?: Record<string, unknown>;
  artifacts?: string[];
  rawOutput?: string;
}
```

### 4.9 PolicyDecision

```ts
export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}
```

## 5. Loop Controller 契约

Loop Controller 是第一版真正的内核。

推荐接口如下：

```ts
export interface LoopController {
  run(taskId: string): Promise<void>;
}
```

它内部至少做 8 件事：

1. 加载任务状态。
2. 构建上下文。
3. 调用 LLM 获取决策。
4. 解析 Tool Calling 输出。
5. 做策略校验。
6. 执行工具。
7. 验证结果。
8. 持久化并决定是否继续下一轮。

一个简化接口关系如下：

```ts
const decision = await llmProvider.decideNextAction(context);
const policy = await policyEngine.check(decision);
const result = await toolRegistry.execute(decision.toolName, decision.arguments, toolCtx);
const verify = await verifier.verify(task.goal, decision, result);
await stateStore.appendStep(task.id, decision, result, verify);
```

## 6. LLM Provider 契约

运行时不应该直接依赖某个厂商 SDK 的细节，而应该先抽象出统一接口。

```ts
export interface LlmProvider {
  decideNextAction(context: AgentContext): Promise<AgentDecision>;
  summarizeTask(summaryInput: TaskSummaryInput): Promise<string>;
}
```

### 6.1 AgentContext

```ts
export interface AgentContext {
  task: TaskState;
  goal?: TaskGoal;
  hostSnapshot: HostSnapshot;
  recentSteps: Array<{
    toolName: string;
    ok: boolean;
    summary: string;
  }>;
  availableTools: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }>;
}
```

## 7. Tool Registry 契约

```ts
export interface ToolRegistry {
  list(): ToolDefinition[];
  get(name: string): ToolDefinition | undefined;
  execute(name: string, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult>;
}
```

Tool Registry 至少要负责三件事：

1. 查找工具。
2. 做参数 Schema 校验。
3. 执行统一封装和错误捕获。

## 8. 第一版必须有的工具

如果第一版目标是尽快跑通“安装指定版本 Python”这类需求，那么最小工具集建议只做下面 8 个：

1. inspect_os
2. inspect_python
3. ensure_directory
4. download_file
5. install_python
6. verify_python
7. restricted_command
8. summarize_result

这里保留 restricted_command 的原因不是鼓励滥用，而是作为兜底工具。它必须受以下限制：

1. 默认关闭。
2. 只有管理员配置开启后才能用。
3. 仅允许命中预定义白名单模板。
4. 每次调用都必须打高风险审计。

## 9. install_python 工具契约样例

这是一个最值得先做透的工具。

### 9.1 输入

```ts
export interface InstallPythonArgs {
  version: string;
  architecture?: 'x64' | 'x86';
  addToPath?: boolean;
  installForAllUsers?: boolean;
}
```

### 9.2 前置检查

前置检查至少包括：

1. 当前系统是否支持。
2. 指定版本是否已存在。
3. 是否有管理员权限。
4. 下载源是否可用。
5. 磁盘空间是否足够。

### 9.3 执行输出

```ts
{
  ok: true,
  summary: "Installed Python 3.11.9 on Windows Server 2022",
  observations: {
    installedVersion: "3.11.9",
    executablePath: "C:\\Program Files\\Python311\\python.exe",
    pathUpdated: true
  }
}
```

### 9.4 验证逻辑

验证至少包括：

1. 能否执行 python --version。
2. 返回版本是否匹配。
3. 可执行文件路径是否存在。
4. PATH 是否符合预期。

## 10. 最小 API 设计

第一版 API 不需要太多，只要能提任务、查状态、查结果。

### 10.1 提交任务

```http
POST /tasks
```

请求体：

```json
{
  "input": "安装 Python 3.11.9"
}
```

### 10.2 查询任务状态

```http
GET /tasks/:taskId
```

### 10.3 查询任务步骤

```http
GET /tasks/:taskId/steps
```

### 10.4 健康检查

```http
GET /health
```

## 11. 最小 CLI 设计

CLI 也应该保留，因为它更符合“服务器大管家”的使用方式。

推荐命令：

```bash
agentctl run "安装 Python 3.11.9"
agentctl status <task-id>
agentctl steps <task-id>
```

## 12. SQLite 最小表设计

第一版建议只建三张表：

1. tasks
2. task_steps
3. host_snapshots

### 12.1 tasks

字段建议：

1. id
2. user_input
3. status
4. goal_json
5. created_at
6. updated_at

### 12.2 task_steps

字段建议：

1. id
2. task_id
3. step_index
4. tool_name
5. tool_args_json
6. result_json
7. verify_json
8. created_at

### 12.3 host_snapshots

字段建议：

1. id
2. task_id
3. snapshot_json
4. created_at

## 13. 第一版开发顺序

建议按下面顺序开发，这样最稳：

1. 先实现 contracts。
2. 再实现 state-store 和 task-queue。
3. 再实现 Tool Registry。
4. 再实现 inspect_os 和 inspect_python。
5. 再实现 install_python 和 verify_python。
6. 再实现 Loop Controller。
7. 最后补 API 和 CLI。

这个顺序的好处是：

1. 最早就能跑通单任务闭环。
2. 很快就能做本机调试。
3. 后面加 Node、Nginx、服务注册工具时不会推翻已有设计。

## 14. 当前阶段的一句话建议

如果你现在准备正式开写代码，最正确的起手式不是先接 LLM SDK，也不是先做 Web 页面，而是：

先把 Task、Tool、Loop、State 这四组核心契约定死，再围绕“安装 Python”做第一条完整闭环。