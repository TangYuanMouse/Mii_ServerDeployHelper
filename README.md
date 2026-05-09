# Mii Server Deploy Helper

轻量级环境部署 Agent 框架，定位是常驻在服务器上的环境部署助手。

它不是通用型超级 Agent，而是一个面向服务器环境部署和环境维护场景的专用运行时。核心能力是接收文本需求，进入 Agent Loop，结合本机状态选择受控工具执行动作，并对执行结果进行验证和记录。

## 当前状态

当前仓库已经包含第一版可编译骨架，重点是运行时内核，而不是完整产品。

目前已实现：

1. TypeScript 单进程 Agent Runtime。
2. Agent Loop 主干流程。
3. 受限 Tool Registry。
4. 文件型状态存储。
5. 最小 HTTP API。
6. 最小 CLI。
7. Python 相关首批工具：
   inspect_os
   inspect_python
   install_python
   verify_python

## 设计目标

这个项目的目标是做一个“服务器上的大管家”，而不是只会输出命令建议的聊天工具。

核心原则：

1. LLM 负责理解需求和决定下一步工具调用。
2. 真正的系统操作必须经过受控工具层。
3. 默认安全优先，变更类工具默认关闭。
4. 每一步都需要可记录、可审计、可验证。

## 当前运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 编译

```bash
npm run build
```

### 3. 启动 HTTP API

```bash
npm run serve
```

默认监听：

```text
http://127.0.0.1:3100
```

### 4. 使用 CLI 提交任务

```bash
npm run cli -- run "安装 Python 3.11.9"
```

查看任务状态：

```bash
npm run cli -- status <task-id>
```

查看任务步骤：

```bash
npm run cli -- steps <task-id>
```

## HTTP API

### 健康检查

```http
GET /health
```

### 提交任务

```http
POST /tasks
Content-Type: application/json

{
  "input": "安装 Python 3.11.9"
}
```

### 查询任务

```http
GET /tasks/:taskId
```

### 查询任务步骤

```http
GET /tasks/:taskId/steps
```

## 环境变量

当前支持的主要配置：

1. `PORT`
   HTTP 服务端口，默认 `3100`。
2. `AGENT_DATA_DIR`
   运行时数据目录，默认是项目目录下的 `.agent-data`。
3. `LLM_PROVIDER`
   可选 `heuristic` 或 `openai-compatible`。
4. `OPENAI_BASE_URL`
   OpenAI 兼容接口地址。
5. `OPENAI_API_KEY`
   OpenAI 兼容接口密钥。
6. `OPENAI_MODEL`
   使用的模型名。
7. `AGENT_ALLOW_MUTATIONS`
   是否允许变更类工具执行，默认关闭。只有设置为 `true` 时，像 `install_python` 这样的工具才允许真正执行。
8. `AUTO_APPROVE_HIGH_RISK`
   是否自动批准高风险工具，默认关闭。

## 安全默认值

当前实现默认是只读安全模式。

这意味着：

1. Agent 可以探测环境。
2. Agent 可以构建计划。
3. Agent 可以执行低风险 inspect 和 verify 工具。
4. 像 `install_python` 这样的变更类工具默认会被策略层拦截。

如果你希望真的执行安装，需要显式开启：

```bash
AGENT_ALLOW_MUTATIONS=true
```

在 Windows PowerShell 下：

```powershell
$env:AGENT_ALLOW_MUTATIONS = "true"
npm run cli -- run "安装 Python 3.11.9"
```

## 当前代码结构

```text
src/
  adapters/
  app/
  cli/
  contracts/
  llm/
  policy/
  runtime/
  storage/
  tools/
```

几个关键入口：

1. `src/app/bootstrap.ts`
   应用装配和 HTTP API 入口。
2. `src/runtime/loop-controller.ts`
   Agent Loop 核心控制器。
3. `src/runtime/agent-runtime.ts`
   任务提交和任务运行入口。
4. `src/tools/registry.ts`
   工具注册和执行入口。

## 当前限制

这还是第一版运行时骨架，当前有明确边界：

1. 默认 Provider 是启发式实现，主要用于跑通本地闭环。
2. OpenAI 兼容 Provider 已有接口，但还需要真实模型配置。
3. Linux 下指定版本 Python 安装目前还是占位能力。
4. 工具集还很小，尚未覆盖 Node、Nginx、服务注册、防火墙等完整部署动作。
5. 状态存储当前是文件型实现，还没有切换到真正的 SQLite 实现。

## 相关文档

仓库里已经有三份设计文档：

1. `ai-agent-architecture-plan.md`
   总体架构和产品定位。
2. `lightweight-agent-runtime-design.md`
   Agent Loop 和 Tool Calling 的运行时设计。
3. `mvp-core-contracts.md`
   MVP 核心契约、对象模型、目录结构和开发顺序。

## 下一步建议

如果继续往下推进，最值得优先做的是：

1. 接上真实 OpenAI 兼容 Provider，并收紧 JSON 输出约束。
2. 把 `install_python` 的 Windows 和 Linux 适配器做完整。
3. 扩展下一批环境部署工具：Node、Nginx、服务注册、防火墙。
4. 把文件状态存储替换成真正的 SQLite 实现。