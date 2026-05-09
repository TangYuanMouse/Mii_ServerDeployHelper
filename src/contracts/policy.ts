import { AgentDecision } from './llm';

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
  decision: AgentDecision;
}