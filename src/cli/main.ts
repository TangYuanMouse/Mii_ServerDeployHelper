import { createApplication } from '../app/bootstrap';

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  const { runtime } = createApplication();

  if (command === 'run') {
    const input = rest.join(' ').trim();
    if (!input) {
      console.error('Usage: npm run cli -- run "安装 Python 3.11.9"');
      process.exitCode = 1;
      return;
    }

    const taskId = await runtime.submitTask(input, 'cli');
    await runtime.runTask(taskId);
    const task = await runtime.getTask(taskId);
    const steps = await runtime.getTaskSteps(taskId);
    console.log(JSON.stringify({ task, steps }, null, 2));
    return;
  }

  if (command === 'status') {
    const taskId = rest[0];
    if (!taskId) {
      console.error('Usage: npm run cli -- status <task-id>');
      process.exitCode = 1;
      return;
    }

    const task = await runtime.getTask(taskId);
    console.log(JSON.stringify(task ?? { error: 'task not found' }, null, 2));
    return;
  }

  if (command === 'steps') {
    const taskId = rest[0];
    if (!taskId) {
      console.error('Usage: npm run cli -- steps <task-id>');
      process.exitCode = 1;
      return;
    }

    const steps = await runtime.getTaskSteps(taskId);
    console.log(JSON.stringify(steps, null, 2));
    return;
  }

  console.log('Usage: npm run cli -- <run|status|steps>');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});