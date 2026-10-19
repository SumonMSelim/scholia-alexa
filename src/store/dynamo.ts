import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ConceptRecord, HistoryEntry, LearnerStore, ReviewSession } from "./types.js";

/**
 * Single-table layout:
 *   PK LEARNER#<id>   SK CONCEPT#<course>#<concept>  -> ConceptRecord
 *   PK LEARNER#<id>   SK HIST#<course>#<iso ts>      -> HistoryEntry
 *   PK SESSION#<id>   SK META                         -> ReviewSession
 */
export class DynamoStore implements LearnerStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly client: DynamoDBClient,
    private readonly table: string,
  ) {
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  static fromEnv(): DynamoStore {
    const endpoint = process.env.DYNAMODB_ENDPOINT;
    // DynamoDB Local accepts any static key; keep the default chain free for Bedrock.
    const client = new DynamoDBClient(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {});
    return new DynamoStore(client, process.env.TABLE_NAME ?? "scholia");
  }

  /** Creates the table when running against DynamoDB Local. No-op if it exists. */
  async ensureTable(): Promise<void> {
    try {
      await this.client.send(new DescribeTableCommand({ TableName: this.table }));
    } catch (err) {
      if (!(err instanceof ResourceNotFoundException)) throw err;
      await this.client.send(
        new CreateTableCommand({
          TableName: this.table,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
          ],
        }),
      );
    }
  }

  async getConcept(learnerId: string, courseId: string, conceptId: string) {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: `LEARNER#${learnerId}`, SK: `CONCEPT#${courseId}#${conceptId}` } }),
    );
    return out.Item ? stripKeys<ConceptRecord>(out.Item) : undefined;
  }

  async putConcept(r: ConceptRecord) {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: { PK: `LEARNER#${r.learnerId}`, SK: `CONCEPT#${r.courseId}#${r.conceptId}`, ...r },
      }),
    );
  }

  async listConcepts(learnerId: string, courseId: string) {
    return this.queryPrefix<ConceptRecord>(`LEARNER#${learnerId}`, `CONCEPT#${courseId}#`);
  }

  async getSession(sessionId: string) {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: `SESSION#${sessionId}`, SK: "META" } }),
    );
    return out.Item ? stripKeys<ReviewSession>(out.Item) : undefined;
  }

  async putSession(s: ReviewSession) {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { PK: `SESSION#${s.sessionId}`, SK: "META", ...s } }));
  }

  async appendHistory(h: HistoryEntry) {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: { PK: `LEARNER#${h.learnerId}`, SK: `HIST#${h.courseId}#${h.at}`, ...h } }),
    );
  }

  async listHistory(learnerId: string, courseId: string) {
    return this.queryPrefix<HistoryEntry>(`LEARNER#${learnerId}`, `HIST#${courseId}#`);
  }

  private async queryPrefix<T>(pk: string, skPrefix: string): Promise<T[]> {
    const items: T[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: { ":pk": pk, ":sk": skPrefix },
          ExclusiveStartKey,
        }),
      );
      for (const it of out.Items ?? []) items.push(stripKeys<T>(it));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }
}

function stripKeys<T>(item: Record<string, unknown>): T {
  const { PK: _pk, SK: _sk, ...rest } = item;
  return rest as T;
}
