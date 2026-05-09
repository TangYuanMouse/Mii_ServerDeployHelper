import path from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
  providerMode: 'heuristic' | 'openai-compatible';
  openAiBaseUrl?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  allowMutations: boolean;
  autoApproveHighRisk: boolean;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3100),
    dataDir: process.env.AGENT_DATA_DIR ?? path.join(process.cwd(), '.agent-data'),
    providerMode: process.env.LLM_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'heuristic',
    openAiBaseUrl: process.env.OPENAI_BASE_URL,
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL,
    allowMutations: process.env.AGENT_ALLOW_MUTATIONS === 'true',
    autoApproveHighRisk: process.env.AUTO_APPROVE_HIGH_RISK === 'true'
  };
}