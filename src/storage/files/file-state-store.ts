import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEmptySnapshot, HostSnapshot, StateStore, TaskStepRecord } from '../../contracts/state';
import { TaskRequest, TaskState } from '../../contracts/task';

interface FileDatabase {
  tasks: Record<string, TaskState>;
  steps: Record<string, TaskStepRecord[]>;
  snapshots: Record<string, HostSnapshot>;
}

export class FileStateStore implements StateStore {
  private readonly databasePath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.databasePath = path.join(dataDir, 'state.json');
  }

  async createTask(request: TaskRequest): Promise<TaskState> {
    const now = new Date().toISOString();
    const task: TaskState = {
      taskId: randomUUID(),
      request,
      status: 'created',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now
    };

    await this.withDatabase(async (db) => {
      db.tasks[task.taskId] = task;
      db.steps[task.taskId] = [];
      db.snapshots[task.taskId] = createEmptySnapshot();
    });

    return task;
  }

  async getTask(taskId: string): Promise<TaskState | undefined> {
    const db = await this.readDatabase();
    return db.tasks[taskId];
  }

  async saveTask(task: TaskState): Promise<void> {
    await this.withDatabase(async (db) => {
      db.tasks[task.taskId] = task;
    });
  }

  async appendStep(taskId: string, step: TaskStepRecord): Promise<void> {
    await this.withDatabase(async (db) => {
      db.steps[taskId] = db.steps[taskId] ?? [];
      db.steps[taskId].push(step);
    });
  }

  async listSteps(taskId: string): Promise<TaskStepRecord[]> {
    const db = await this.readDatabase();
    return db.steps[taskId] ?? [];
  }

  async getSnapshot(taskId: string): Promise<HostSnapshot> {
    const db = await this.readDatabase();
    return db.snapshots[taskId] ?? createEmptySnapshot();
  }

  async saveSnapshot(taskId: string, snapshot: HostSnapshot): Promise<void> {
    await this.withDatabase(async (db) => {
      db.snapshots[taskId] = snapshot;
    });
  }

  private async withDatabase(mutator: (db: FileDatabase) => Promise<void> | void): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const db = await this.readDatabase();
      await mutator(db);
      await this.writeDatabase(db);
    });

    return this.writeChain;
  }

  private async readDatabase(): Promise<FileDatabase> {
    await mkdir(path.dirname(this.databasePath), { recursive: true });

    try {
      const content = await readFile(this.databasePath, 'utf8');
      return JSON.parse(content) as FileDatabase;
    } catch {
      return {
        tasks: {},
        steps: {},
        snapshots: {}
      };
    }
  }

  private async writeDatabase(db: FileDatabase): Promise<void> {
    await mkdir(path.dirname(this.databasePath), { recursive: true });
    await writeFile(this.databasePath, JSON.stringify(db, null, 2), 'utf8');
  }
}