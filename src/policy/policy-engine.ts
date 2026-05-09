import { PolicyDecision } from '../contracts/policy';
import { AgentDecision } from '../contracts/llm';
import { ToolRegistry } from '../tools/registry';

export class PolicyEngine {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly allowMutations: boolean,
    private readonly autoApproveHighRisk: boolean
  ) {}

  async check(decision: AgentDecision): Promise<PolicyDecision> {
    const tool = this.toolRegistry.get(decision.toolName);

    if (!tool) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Unknown tool: ${decision.toolName}`,
        decision
      };
    }

    if (tool.mutating && !this.allowMutations) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: `Tool ${tool.name} is disabled because AGENT_ALLOW_MUTATIONS is not enabled`,
        decision
      };
    }

    if (tool.riskLevel === 'high' && !this.autoApproveHighRisk) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Tool ${tool.name} requires approval`,
        decision
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      decision
    };
  }
}