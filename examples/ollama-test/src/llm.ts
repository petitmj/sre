import { LLM } from '@smythos/sdk';

async function testLLM() {
  const llm = LLM.Ollama('qwen3:0.6b-q4_K_M', {
    baseURL: 'http://localhost:11434/api/',
    maxTokens: 512,
    temperature: 0.2
  });

  const result = await llm.prompt('Summarize the benefits of local LLMs in 3 bullet points.');
  console.log(result);
}
testLLM().catch(console.error);