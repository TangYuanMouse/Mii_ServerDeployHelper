import { AgentContext, AgentDecision, LlmProvider } from '../contracts/llm';
import { TaskGoal, TaskRequest, TaskState } from '../contracts/task';
import { TaskStepRecord } from '../contracts/state';

interface OpenAiCompatibleProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly options: OpenAiCompatibleProviderOptions) {}

  async normalizeRequest(request: TaskRequest): Promise<TaskGoal> {
    const payload = {
      model: this.options.model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return JSON with category,targetName,targetVersion,targetHost,constraints,successCriteria for a deployment task.'
        },
        {
          role: 'user',
          content: request.userInput
        }
      ]
    };

    const data = await this.postJson(payload);
    return parseJsonContent<TaskGoal>(data);
  }

  async decideNextAction(context: AgentContext): Promise<AgentDecision> {
    const payload = {
      model: this.options.model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a deployment agent runtime. Return JSON with thought,toolName,arguments,reason,expectsVerification,stop. Only use listed tools.'
        },
        {
          role: 'user',
          content: JSON.stringify(context)
        }
      ]
    };

    const data = await this.postJson(payload);
    return parseJsonContent<AgentDecision>(data);
  }

  async summarizeTask(task: TaskState, steps: TaskStepRecord[]): Promise<string> {
    const payload = {
      model: this.options.model,
      messages: [
        {
          role: 'system',
          content: 'Summarize the deployment task result in one concise paragraph.'
        },
        {
          role: 'user',
          content: JSON.stringify({ task, steps })
        }
      ]
    };

    const data = await this.postJson(payload);
    return extractTextContent(data);
  }

  private async postJson(payload: unknown): Promise<unknown> {
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    return response.json();
  }
}

function parseJsonContent<T>(response: unknown): T {
  const content = extractTextContent(response);
  return JSON.parse(content) as T;
}

function extractTextContent(response: unknown): string {
  const data = response as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM response did not include message content');
  }

  return content;
}