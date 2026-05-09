import { ToolDefinition, ToolExecutionContext, ToolResult } from '../contracts/tool';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<any>>();

  register(tool: ToolDefinition<any>): void {
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition<any>[] {
    return [...this.tools.values()];
  }

  get(name: string): ToolDefinition<any> | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.get(name);

    if (!tool) {
      return {
        ok: false,
        summary: `Tool ${name} is not registered.`
      };
    }

    if (tool.precheck) {
      const precheck = await tool.precheck(args, ctx);
      if (!precheck.ok) {
        return {
          ok: false,
          summary: precheck.reason ?? `Precheck failed for ${name}`
        };
      }
    }

    return tool.execute(args, ctx);
  }
}