export class SequentialTaskQueue {
  private chain: Promise<void> = Promise.resolve();

  enqueue<T>(handler: () => Promise<T>): Promise<T> {
    const run = this.chain.then(handler);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }
}