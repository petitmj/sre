import { Agent, Model } from '@smythos/sdk';

async function main() {
  const agent = new Agent({
    name: 'Ollama Agent',
    behavior: 'You are a helpful assistant.',
    model: Model.Ollama('qwen3:0.6b-q4_K_M', {
      baseURL: 'http://localhost:11434/api/',
      inputTokens: 4096,
      outputTokens: 1024,
      temperature: 0.7
    }),
  });

  const result = await agent.prompt('What is the capital of France?');
  console.log('Answer:', result);
}
main().catch(console.error);