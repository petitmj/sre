import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PineconeConnector } from "../src/connectors/pinecone.connector";

vi.mock("@pinecone-database/pinecone", () => ({
  PineconeClient: class {
    init = vi.fn();
    upsert = vi.fn();
    query = vi.fn().mockResolvedValue({ matches: [{ id: "doc-1" }] });
  },
}));

const ORIGINAL_ENV = process.env;

describe("PineconeConnector", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV, PINECONE_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("throws without API key", () => {
    delete process.env.PINECONE_API_KEY;
    expect(() => new PineconeConnector({ indexName: "idx" })).toThrow(
      /Missing Pinecone API key/,
    );
  });

  it("initializes client with env key and correct index", () => {
    const pinecone = new PineconeConnector({ indexName: "idx" });
    const mockClient = (pinecone as any).client;
    expect(mockClient.init).toHaveBeenCalledWith({
      apiKey: "test-key",
      environment: expect.any(String),
    });
    expect((pinecone as any).indexName).toBe("idx");
  });

  it("insertDoc calls client.upsert", async () => {
    const pinecone = new PineconeConnector({ indexName: "idx" });
    await pinecone.insertDoc("doc-1", "hello");
    const mockClient = (pinecone as any).client;
    expect(mockClient.upsert).toHaveBeenCalled();
  });

  it("search returns matching ids", async () => {
    const pinecone = new PineconeConnector({ indexName: "idx" });
    const results = await pinecone.search("query", 5);
    expect(results).toEqual(["doc-1"]);
  });
});
