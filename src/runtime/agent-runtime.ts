import { randomUUID } from 'node:crypto';
import { LoopController } from './loop-controller';
import { SequentialTaskQueue } from './task-queue';
import { StateStore } from '../contracts/state';
import { TaskSource } from '../contracts/task';

export class AgentRuntime {
  constructor(
    private readonly stateStore: StateStore,
    private readonly queue: SequentialTaskQueue,
    private readonly loopController: LoopController
  ) {}

  async submitTask(input: string, source: TaskSource = 'api', requestedBy?: string): Promise<string> {
    const now = new Date().toISOString();
    const task = await this.stateStore.createTask({
      requestId: randomUUID(),
      source,
      userInput: input,
      requestedBy,
      createdAt: now
    });

    return task.taskId;
  }

  async runTask(taskId: string): Promise<void> {
    await this.queue.enqueue(() => this.loopController.run(taskId));
  }

  getTask(taskId: string) {
    return this.stateStore.getTask(taskId);
  }

  getTaskSteps(taskId: string) {
    return this.stateStore.listSteps(taskId);
  }
}