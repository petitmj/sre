import * as dotenv from "dotenv";
dotenv.config();

import { Pinecone, Index } from "@pinecone-database/pinecone";

interface IPineconeSettings {
  apiKey?: string;
  indexName: string;
}

/**
 * Connector for interacting with a Pinecone index.
 */
export class PineconeConnector {
  private client: Pinecone;
  private index?: Index;
  private indexName: string;

  constructor(settings: IPineconeSettings) {
    const apiKey = settings.apiKey || process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("Missing Pinecone API key");

    this.client = new Pinecone({ apiKey });
    this.indexName = settings.indexName;
  }

  /**
   * Lazily fetches and caches the Pinecone index instance.
   */
  private async getIndex(): Promise<Index> {
    if (!this.index) {
      this.index = this.client.index(this.indexName);
    }
    return this.index;
  }

  /**
   * Inserts a document vector into the Pinecone index.
   * @param id - Unique document ID
   * @param text - Document text to embed and upsert
   */
  async insertDoc(id: string, text: string): Promise<void> {
    const embedding = await this.getEmbedding(text);
    const index = await this.getIndex();
    await index.upsert([{ id, values: embedding }]);
  }

  /**
   * Searches the Pinecone index with a query string.
   * @param query - Text query
   * @param topK - Number of nearest neighbors to return
   * @returns Array of matching document IDs
   */
  async search(query: string, topK = 5): Promise<string[]> {
    const vector = await this.getEmbedding(query);
    const index = await this.getIndex();
    const result = await index.query({
      vector,
      topK,
      includeMetadata: true,
    });
    return result.matches?.map((m) => m.id) || [];
  }

  /**
   * Generates an embedding for a given text.
   * For Later: Replace with actual embedding provider.
   */
  private async getEmbedding(text: string): Promise<number[]> {
    return Array(10).fill(0.1);
  }
}
