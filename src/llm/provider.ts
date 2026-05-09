import { AgentContext, AgentDecision, LlmProvider } from '../contracts/llm';
import { TaskGoal, TaskRequest, TaskState } from '../contracts/task';
import { TaskStepRecord } from '../contracts/state';

export class HeuristicLlmProvider implements LlmProvider {
  async normalizeRequest(request: TaskRequest): Promise<TaskGoal> {
    const pythonMatch = request.userInput.match(/python\s+([0-9]+(?:\.[0-9]+){1,2})/i);

    if (pythonMatch) {
      const version = pythonMatch[1];
      return {
        category: 'install_runtime',
        targetName: 'python',
        targetVersion: version,
        targetHost: 'local',
        constraints: ['use controlled tools only'],
        successCriteria: [`python version ${version} is available on the host`]
      };
    }

    return {
      category: 'unknown',
      targetName: 'unknown',
      targetHost: 'local',
      constraints: ['do not execute unrestricted commands'],
      successCriteria: ['task is safely rejected or requires a dedicated tool']
    };
  }

  async decideNextAction(context: AgentContext): Promise<AgentDecision> {
    const goal = context.goal;
    const snapshot = context.hostSnapshot;
    const recent = context.recentSteps;
    const lastStep = recent.at(-1);

    if (!goal || goal.category === 'unknown') {
      return {
        thought: 'The request does not map to a supported deployment capability yet.',
        toolName: 'unsupported_request',
        arguments: {},
        reason: 'Unsupported request',
        expectsVerification: false,
        stop: true
      };
    }

    if (snapshot.os.family === 'unknown') {
      return {
        thought: 'The runtime needs to know the current operating system before choosing an install strategy.',
        toolName: 'inspect_os',
        arguments: {},
        reason: 'Collect host operating system details',
        expectsVerification: false,
        stop: false
      };
    }

    if (goal.targetName === 'python' && snapshot.runtimes.pythonVersions.length === 0 && lastStep?.decision.toolName !== 'inspect_python') {
      return {
        thought: 'The runtime should inspect existing Python versions before installing a new one.',
        toolName: 'inspect_python',
        arguments: {},
        reason: 'Check whether the requested version already exists',
        expectsVerification: false,
        stop: false
      };
    }

    if (goal.targetName === 'python' && goal.targetVersion && snapshot.runtimes.pythonVersions.includes(goal.targetVersion)) {
      if (lastStep?.decision.toolName === 'verify_python' && lastStep.verify.ok) {
        return {
          thought: 'The requested Python version has already been verified.',
          toolName: 'verify_python',
          arguments: { expectedVersion: goal.targetVersion },
          reason: 'Task completed',
          expectsVerification: true,
          stop: true
        };
      }

      return {
        thought: 'The requested Python version appears to be present and should be verified explicitly.',
        toolName: 'verify_python',
        arguments: { expectedVersion: goal.targetVersion },
        reason: 'Confirm installed runtime version',
        expectsVerification: true,
        stop: false
      };
    }

    if (goal.targetName === 'python' && goal.targetVersion) {
      return {
        thought: 'The requested Python version is not present, so the runtime should use the controlled installer tool.',
        toolName: 'install_python',
        arguments: {
          version: goal.targetVersion,
          architecture: 'x64',
          addToPath: true,
          installForAllUsers: true
        },
        reason: 'Install the missing Python runtime',
        expectsVerification: true,
        stop: false
      };
    }

    return {
      thought: 'No safe next step is available.',
      toolName: 'unsupported_request',
      arguments: {},
      reason: 'Unsupported request',
      expectsVerification: false,
      stop: true
    };
  }

  async summarizeTask(task: TaskState, steps: TaskStepRecord[]): Promise<string> {
    const lastStep = steps.at(-1);

    if (task.status === 'succeeded') {
      return lastStep?.result.summary ?? 'Task completed successfully.';
    }

    if (task.status === 'waiting_approval') {
      return task.errorMessage ?? 'Task is waiting for approval.';
    }

    return task.errorMessage ?? lastStep?.result.summary ?? 'Task did not complete.';
  }
}