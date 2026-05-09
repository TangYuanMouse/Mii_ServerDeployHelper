import { HostSnapshot, StateStore } from './state';

export interface PrecheckResult {
  ok: boolean;
  reason?: string;
}

export interface VerifyResult {
  ok: boolean;
  done: boolean;
  reason?: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  exitCode?: number;
  observations?: Record<string, unknown>;
  artifacts?: string[];
  rawOutput?: string;
}

export interface ToolExecutionContext {
  taskId: string;
  hostSnapshot: HostSnapshot;
  logger: {
    info(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
  };
  stores: {
    stateStore: StateStore;
  };
  adapters: {
    windows?: unknown;
    linux?: unknown;
  };
}

export interface ToolDefinition<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  mutating?: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  inputSchema: unknown;
  precheck?: (args: TArgs, ctx: ToolExecutionContext) => Promise<PrecheckResult>;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<ToolResult>;
  verify?: (args: TArgs, result: ToolResult, ctx: ToolExecutionContext) => Promise<VerifyResult>;
  rollback?: (args: TArgs, ctx: ToolExecutionContext) => Promise<void>;
}