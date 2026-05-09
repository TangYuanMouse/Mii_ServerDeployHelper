export type TaskSource = 'api' | 'cli';

export interface TaskRequest {
  requestId: string;
  source: TaskSource;
  userInput: string;
  requestedBy?: string;
  createdAt: string;
}

export interface TaskGoal {
  category:
    | 'install_runtime'
    | 'configure_service'
    | 'deploy_app'
    | 'open_port'
    | 'verify_environment'
    | 'unknown';
  targetName: string;
  targetVersion?: string;
  targetHost: 'local';
  constraints: string[];
  successCriteria: string[];
}

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
  summary?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}