import { HostSnapshot, TaskStepRecord } from './state';
import { TaskGoal, TaskRequest, TaskState } from './task';

export interface AgentDecision {
  thought: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  expectsVerification: boolean;
  stop: boolean;
}

export interface AgentContext {
  task: TaskState;
  goal?: TaskGoal;
  hostSnapshot: HostSnapshot;
  recentSteps: TaskStepRecord[];
  availableTools: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }>;
}

export interface LlmProvider {
  normalizeRequest(request: TaskRequest): Promise<TaskGoal>;
  decideNextAction(context: AgentContext): Promise<AgentDecision>;
  summarizeTask(task: TaskState, steps: TaskStepRecord[]): Promise<string>;
}