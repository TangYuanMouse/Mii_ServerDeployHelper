import { randomUUID } from 'node:crypto';
import { LlmProvider } from '../contracts/llm';
import { mergeToolObservations, StateStore, TaskStepRecord } from '../contracts/state';
import { TaskState } from '../contracts/task';
import { ToolExecutionContext, VerifyResult } from '../contracts/tool';
import { PolicyEngine } from '../policy/policy-engine';
import { ToolRegistry } from '../tools/registry';
import { ContextBuilder } from './context-builder';

export class LoopController {
  constructor(
    private readonly stateStore: StateStore,
    private readonly contextBuilder: ContextBuilder,
    private readonly llmProvider: LlmProvider,
    private readonly policyEngine: PolicyEngine,
    private readonly toolRegistry: ToolRegistry,
    private readonly adapters: ToolExecutionContext['adapters']
  ) {}

  async run(taskId: string): Promise<void> {
    const task = await this.requireTask(taskId);
    await this.transition(task, 'normalizing');

    if (!task.goal) {
      task.goal = await this.llmProvider.normalizeRequest(task.request);
      task.updatedAt = new Date().toISOString();
      await this.stateStore.saveTask(task);
    }

    let iteration = 0;
    while (iteration < 8) {
      iteration += 1;
      const currentTask = await this.requireTask(taskId);
      await this.transition(currentTask, 'running');
      const context = await this.contextBuilder.build(currentTask);
      const decision = await this.llmProvider.decideNextAction(context);

      if (decision.stop && decision.toolName === 'unsupported_request') {
        currentTask.status = 'failed';
        currentTask.errorMessage = decision.reason;
        currentTask.updatedAt = new Date().toISOString();
        currentTask.summary = decision.reason;
        await this.stateStore.saveTask(currentTask);
        return;
      }

      if (decision.stop) {
        currentTask.status = 'succeeded';
        currentTask.updatedAt = new Date().toISOString();
        const steps = await this.stateStore.listSteps(taskId);
        currentTask.summary = await this.llmProvider.summarizeTask(currentTask, steps);
        await this.stateStore.saveTask(currentTask);
        return;
      }

      const policy = await this.policyEngine.check(decision);
      if (!policy.allowed) {
        currentTask.status = policy.requiresApproval ? 'waiting_approval' : 'failed';
        currentTask.errorMessage = policy.reason;
        currentTask.updatedAt = new Date().toISOString();
        currentTask.summary = policy.reason;
        await this.stateStore.saveTask(currentTask);
        return;
      }

      const snapshot = await this.stateStore.getSnapshot(taskId);
      const executionContext: ToolExecutionContext = {
        taskId,
        hostSnapshot: snapshot,
        logger: console,
        stores: {
          stateStore: this.stateStore
        },
        adapters: this.adapters
      };
      const result = await this.toolRegistry.execute(decision.toolName, decision.arguments, executionContext);
      const tool = this.toolRegistry.get(decision.toolName);
      const verify = tool?.verify ? await tool.verify(decision.arguments, result, executionContext) : inferVerifyResult(result, decision.expectsVerification);
      await this.recordStep(taskId, decision, result, verify);
      const nextSnapshot = mergeToolObservations(snapshot, result.observations);
      await this.stateStore.saveSnapshot(taskId, nextSnapshot);

      const latestTask = await this.requireTask(taskId);
      latestTask.attemptCount += 1;
      latestTask.currentStep = decision.toolName;
      latestTask.updatedAt = new Date().toISOString();

      if (!result.ok && !verify.ok) {
        latestTask.status = 'failed';
        latestTask.errorMessage = result.summary;
        latestTask.summary = result.summary;
        await this.stateStore.saveTask(latestTask);
        return;
      }

      if (verify.done) {
        latestTask.status = 'succeeded';
        const steps = await this.stateStore.listSteps(taskId);
        latestTask.summary = await this.llmProvider.summarizeTask(latestTask, steps);
        await this.stateStore.saveTask(latestTask);
        return;
      }

      await this.stateStore.saveTask(latestTask);
    }

    const exhaustedTask = await this.requireTask(taskId);
    exhaustedTask.status = 'failed';
    exhaustedTask.errorMessage = 'Agent loop exceeded its iteration limit.';
    exhaustedTask.summary = exhaustedTask.errorMessage;
    exhaustedTask.updatedAt = new Date().toISOString();
    await this.stateStore.saveTask(exhaustedTask);
  }

  private async transition(task: TaskState, status: TaskState['status']): Promise<void> {
    task.status = status;
    task.updatedAt = new Date().toISOString();
    await this.stateStore.saveTask(task);
  }

  private async requireTask(taskId: string): Promise<TaskState> {
    const task = await this.stateStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not found`);
    }

    return task;
  }

  private async recordStep(
    taskId: string,
    decision: TaskStepRecord['decision'],
    result: TaskStepRecord['result'],
    verify: TaskStepRecord['verify']
  ): Promise<void> {
    const existingSteps = await this.stateStore.listSteps(taskId);
    const step: TaskStepRecord = {
      stepId: randomUUID(),
      taskId,
      stepIndex: existingSteps.length + 1,
      decision,
      result,
      verify,
      createdAt: new Date().toISOString()
    };

    await this.stateStore.appendStep(taskId, step);
  }
}

function inferVerifyResult(result: TaskStepRecord['result'], expectsVerification: boolean): VerifyResult {
  return {
    ok: result.ok,
    done: false,
    reason: result.summary
  };
}