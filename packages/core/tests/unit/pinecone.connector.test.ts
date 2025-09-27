import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PineconeConnector } from "../../src/connectors/pinecone.connector";

vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: class {
    index = vi.fn().mockReturnValue({
      upsert: vi.fn(),
      query: vi.fn().mockResolvedValue({ matches: [{ id: "doc-1" }] }),
    });
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

  it("initializes client with api key", () => {
    const pinecone = new PineconeConnector({ indexName: "idx" });
    const mockClient = (pinecone as any).client;
    expect(mockClient).toBeInstanceOf(Object);
    expect((pinecone as any).indexName).toBe("idx");
  });

  it("insertDoc calls index.upsert", async () => {
    const pinecone = new PineconeConnector({ indexName: "idx" });
    await pinecone.insertDoc("doc-1", "hello");
    const mockClient = (pinecone as any).client;
    expect(mockClient.index).toHaveBeenCalledWith("idx");
    const mockIndex = mockClient.index.mock.results[0].value;
    expect(mockIndex.upsert).toHaveBeenCalled();
  });

  it("search returns matching ids", async () => {
    const pinecone = new PineconeConnector({ indexName: "idx" });
    const results = await pinecone.search("query", 5);
    expect(results).toEqual(["doc-1"]);
  });
});
