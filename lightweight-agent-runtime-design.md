# 轻量级环境部署 Agent 运行时设计

## 1. 定位

这个文档只讨论运行时内核，也就是 Agent 在服务器上长期运行时，如何接收需求、调用 LLM、执行工具、校验结果并持续推进任务。

它不是一个通用大模型 Agent 平台，而是一个面向“环境部署”场景的专用 Agent Runtime。

可以借鉴通用 Agent 的闭环思想，但实现上必须更克制、更轻量、更受控。

## 2. 核心目标

运行时需要做到：

1. 接收文本需求，例如“安装 Python 3.11.9”。
2. 自动判断当前主机状态。
3. 通过 Agent Loop 逐步决定下一步动作。
4. 通过 Tool Calling 调用受控部署工具。
5. 对每一步做验证和记录。
6. 在失败时具备诊断、重试、中止或请求确认能力。

## 3. 设计取舍

为了保证“轻量级快速部署”，运行时建议做以下取舍：

1. 单进程优先，不做复杂分布式编排。
2. 单机优先，不做多主机协同。
3. 本地任务队列优先，不强依赖 MQ。
4. 模板优先，不追求无限自由推理。
5. 小工具集优先，不做无限扩展工具生态。
6. 本地状态缓存优先，不先上复杂数据库集群。

## 4. 最小运行时组成

第一版运行时建议由 7 个组件组成：

1. Request Inbox：接收任务。
2. Context Builder：整理上下文。
3. Loop Controller：驱动 Agent Loop。
4. Tool Registry：维护工具定义和参数约束。
5. Execution Engine：执行工具。
6. State Store：保存任务和环境状态。
7. Reporter：输出任务结论。

## 5. Agent Loop

建议运行时采用固定闭环，而不是让 LLM 自由控制整个会话。

推荐闭环如下：

1. Intake：接收用户需求。
2. Normalize：转成结构化任务草案。
3. Observe：读取本机环境状态。
4. Decide：让 LLM 决定下一个工具调用。
5. Guard：对工具调用做策略检查。
6. Execute：执行工具。
7. Verify：检查结果。
8. Persist：记录执行结果。
9. Repeat：继续下一轮，直到完成。
10. Summarize：生成最终报告。

一个简化伪代码如下：

```text
while task.not_finished:
  context = build_context(task, host_snapshot, recent_tool_results)
  decision = llm.decide_next_action(context)
  policy_result = guard.check(decision)

  if policy_result.blocked:
    task.pause("blocked by policy")
    break

  tool_result = tool_registry.execute(decision.tool_name, decision.arguments)
  verify_result = verifier.check(tool_result, task.goal)
  state_store.append(task.id, decision, tool_result, verify_result)

  if verify_result.done:
    task.finish()
    break
```

## 6. Tool Calling 设计

Tool Calling 是这个框架的核心，但必须是“受限工具调用”，不是“任意命令执行”。

### 6.1 工具定义结构

每个工具至少需要：

1. name
2. description
3. input_schema
4. risk_level
5. precheck
6. execute
7. verify
8. rollback

### 6.2 工具调用返回结构

统一返回：

```json
{
  "ok": true,
  "summary": "Python 3.11.9 installed successfully.",
  "artifacts": [],
  "observations": {
    "python_version": "3.11.9"
  },
  "next_hint": "verify_path"
}
```

### 6.3 推荐的第一版工具集

第一版不要做太多工具，先做 10 到 15 个硬工具就够。

建议优先实现：

1. inspect_os
2. inspect_python
3. inspect_node
4. ensure_directory
5. download_file
6. unpack_archive
7. install_python
8. install_node
9. write_env_file
10. write_nginx_config
11. open_firewall_port
12. register_windows_service
13. register_linux_service
14. start_service
15. verify_http_endpoint

## 7. 为什么不能直接暴露 run_command

很多通用 Agent 会把 shell 当成最强工具，但这个项目不适合这么做。

原因是：

1. 这是部署场景，风险天然更高。
2. 需求里常常包含安装、配置、开放端口等高影响操作。
3. 任意命令会破坏轻量框架最重要的可控性。

更合适的办法是：

1. 优先专用工具。
2. 必要时提供 restricted_command 工具。
3. restricted_command 只允许命中白名单模板。

## 8. 任务样例：安装指定版本 Python

用户输入：

```text
帮我安装 Python 3.11.9
```

推荐运行时执行顺序：

1. inspect_os
2. inspect_python
3. 如果目标版本不存在，决定安装方式
4. install_python(version="3.11.9")
5. verify_python_version(expected="3.11.9")
6. 记录 PATH 或安装目录
7. 输出结果报告

这类任务的关键点不是“能不能安装”，而是：

1. 先判断是否已经安装。
2. 判断是否需要升级还是并存安装。
3. 判断是否需要修改 PATH。
4. 判断安装后是否影响现有服务。

所以 Agent Loop 不能省略 Observe 和 Verify。

## 9. 与通用 Agent 框架的区别

这个项目可以借鉴通用 Agent 思路，但不建议直接照搬通用框架实现。

建议保留的思路：

1. ReAct 式循环。
2. Tool Calling。
3. 状态记忆。
4. 失败后重规划。

建议主动舍弃的东西：

1. 过深的多 Agent 编排。
2. 无边界的 shell 使用。
3. 超大工具生态。
4. 复杂长链推理编排。
5. 对外部云服务的强依赖。

一句话说，就是借鉴“Agent 会自己循环和调工具”这个内核，但不要把整个系统做重。

## 10. 推荐目录结构

```text
src/
  runtime/
    loop-controller/
    context-builder/
    task-runner/
  tools/
    inspect/
    install/
    config/
    verify/
  adapters/
    windows/
    linux/
  llm/
    providers/
    prompts/
    schemas/
  policy/
  storage/
  reporting/
  api/
  cli/
```

## 11. 第一版最值得先做的部分

如果要尽快做出第一版，优先级建议如下：

1. 定义任务模型。
2. 定义工具协议。
3. 实现 Loop Controller。
4. 实现 5 到 8 个高频工具。
5. 实现本地状态记录。
6. 实现一个最小 HTTP API 或 CLI。

## 12. 一句话结论

这个项目最合适的技术内核不是“通用超级 Agent”，而是：

一个基于 Agent Loop 和受限 Tool Calling 的轻量级环境部署运行时。

它应该像一个长期驻留在服务器上的大管家，能理解部署要求、知道本机状态、选择合适工具、逐步执行并验证结果。