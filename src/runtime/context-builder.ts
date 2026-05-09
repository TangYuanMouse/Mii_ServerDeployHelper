import { AgentContext } from '../contracts/llm';
import { StateStore } from '../contracts/state';
import { TaskState } from '../contracts/task';
import { ToolRegistry } from '../tools/registry';

export class ContextBuilder {
  constructor(
    private readonly stateStore: StateStore,
    private readonly toolRegistry: ToolRegistry
  ) {}

  async build(task: TaskState): Promise<AgentContext> {
    const snapshot = await this.stateStore.getSnapshot(task.taskId);
    const recentSteps = await this.stateStore.listSteps(task.taskId);

    return {
      task,
      goal: task.goal,
      hostSnapshot: snapshot,
      recentSteps,
      availableTools: this.toolRegistry.list().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  }
}