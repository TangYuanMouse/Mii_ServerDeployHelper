import { AgentDecision } from './llm';
import { TaskRequest, TaskState } from './task';
import { ToolResult, VerifyResult } from './tool';

export interface HostSnapshot {
  os: {
    family: 'windows' | 'linux' | 'unknown';
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

export interface TaskStepRecord {
  stepId: string;
  taskId: string;
  stepIndex: number;
  decision: AgentDecision;
  result: ToolResult;
  verify: VerifyResult;
  createdAt: string;
}

export interface StateStore {
  createTask(request: TaskRequest): Promise<TaskState>;
  getTask(taskId: string): Promise<TaskState | undefined>;
  saveTask(task: TaskState): Promise<void>;
  appendStep(taskId: string, step: TaskStepRecord): Promise<void>;
  listSteps(taskId: string): Promise<TaskStepRecord[]>;
  getSnapshot(taskId: string): Promise<HostSnapshot>;
  saveSnapshot(taskId: string, snapshot: HostSnapshot): Promise<void>;
}

export function createEmptySnapshot(): HostSnapshot {
  return {
    os: {
      family: 'unknown',
      version: 'unknown',
      arch: 'unknown'
    },
    runtimes: {
      pythonVersions: [],
      nodeVersions: []
    },
    services: [],
    ports: [],
    directories: [],
    collectedAt: new Date(0).toISOString()
  };
}

export function mergeToolObservations(snapshot: HostSnapshot, observations?: Record<string, unknown>): HostSnapshot {
  if (!observations) {
    return snapshot;
  }

  const next: HostSnapshot = {
    ...snapshot,
    os: { ...snapshot.os },
    runtimes: {
      pythonVersions: [...snapshot.runtimes.pythonVersions],
      nodeVersions: [...snapshot.runtimes.nodeVersions]
    },
    services: [...snapshot.services],
    ports: [...snapshot.ports],
    directories: [...snapshot.directories],
    collectedAt: new Date().toISOString()
  };

  if (typeof observations.osFamily === 'string' && isOsFamily(observations.osFamily)) {
    next.os.family = observations.osFamily;
  }

  if (typeof observations.osVersion === 'string') {
    next.os.version = observations.osVersion;
  }

  if (typeof observations.arch === 'string') {
    next.os.arch = observations.arch;
  }

  if (Array.isArray(observations.pythonVersions)) {
    next.runtimes.pythonVersions = uniqueStrings(observations.pythonVersions, next.runtimes.pythonVersions);
  }

  if (typeof observations.installedVersion === 'string') {
    next.runtimes.pythonVersions = uniqueStrings([observations.installedVersion], next.runtimes.pythonVersions);
  }

  if (typeof observations.executablePath === 'string') {
    next.directories = uniqueStrings([observations.executablePath], next.directories);
  }

  return next;
}

function isOsFamily(value: string): value is HostSnapshot['os']['family'] {
  return value === 'windows' || value === 'linux' || value === 'unknown';
}

function uniqueStrings(candidate: unknown[], existing: string[]): string[] {
  const merged = new Set(existing);

  for (const value of candidate) {
    if (typeof value === 'string' && value.length > 0) {
      merged.add(value);
    }
  }

  return [...merged];
}