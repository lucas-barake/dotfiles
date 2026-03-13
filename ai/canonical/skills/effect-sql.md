---
name: effect-sql
description: Effect SQL patterns with @effect/sql and @effect/sql-pg. Use when working with database code, repositories, SQL queries, migrations, or PostgreSQL. Triggers on @effect/sql, SqlClient, PgClient, SqlSchema, repository, migration.
---

# Effect SQL

Patterns for database access using `@effect/sql` and `@effect/sql-pg`.

## CRITICAL: Always Use SqlSchema

**NEVER** use inline type parameters on the sql template literal:

```ts
// WRONG - no validation, unsafe
sql<{ id: string; name: string }>`SELECT * FROM users`;

// CORRECT - always use SqlSchema for validation
SqlSchema.findAll({
  Request: Schema.Void,
  Result: UserModel,
  execute: () => sql`SELECT * FROM users`,
});
```

SqlSchema validates both request and result at runtime. Non-negotiable.

## Imports

```ts
import * as PgClient from "@effect/sql-pg/PgClient";
import * as SqlClient from "@effect/sql/SqlClient";
import * as SqlSchema from "@effect/sql/SqlSchema";
import * as SqlError from "@effect/sql/SqlError";
```

## SqlSchema Type Signatures

```ts
// Returns exactly one row or NoSuchElementException
SqlSchema.single: <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (request: II) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => (request: IA) => Effect.Effect<A, E | ParseError | NoSuchElementException, R | IR | AR>

// Returns Option (None if not found, no error)
SqlSchema.findOne: <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (request: II) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => (request: IA) => Effect.Effect<Option<A>, E | ParseError, R | IR | AR>

// Returns array of results
SqlSchema.findAll: <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (request: II) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => (request: IA) => Effect.Effect<ReadonlyArray<A>, E | ParseError, R | IR | AR>

// Discards result (for INSERT/UPDATE/DELETE without RETURNING)
SqlSchema.void: <IR, II, IA, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly execute: (request: II) => Effect.Effect<unknown, E, R>;
}) => (request: IA) => Effect.Effect<void, E | ParseError, R | IR>
```

## PostgreSQL Client Configuration

### Production Layer

```ts
import * as PgClient from "@effect/sql-pg/PgClient";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { identity } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Str from "effect/String";
import { types } from "pg";

// Keep raw strings for dates/timestamps (handle parsing in Schema)
types.setTypeParser(types.builtins.DATE, identity);
types.setTypeParser(types.builtins.TIMESTAMP, identity);
types.setTypeParser(types.builtins.TIMESTAMPTZ, identity);
types.setTypeParser(types.builtins.JSON, identity);
types.setTypeParser(types.builtins.JSONB, identity);

export const pgConfig: PgClient.PgClientConfig = {
  transformQueryNames: Str.camelToSnake, // JS camelCase -> SQL snake_case
  transformResultNames: Str.snakeToCamel, // SQL snake_case -> JS camelCase
  transformJson: true,
  types,
};

export const PgLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const env = yield* Config.literal("local")("ENV").pipe(
      Config.orElse(() => Config.succeed("prod" as const)),
    );
    const ssl = env !== "local" ? { rejectUnauthorized: false } : false;
    const databaseUrl = yield* Config.redacted("DATABASE_URL");

    return PgClient.layer({
      url: databaseUrl,
      ssl,
      idleTimeout: "10 seconds",
      connectTimeout: "10 seconds",
      ...pgConfig,
    });
  }),
).pipe(Layer.orDie);
```

### Test Layer with Transaction Rollback

```ts
import * as PgClient from "@effect/sql-pg/PgClient";
import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export const PgTest = Layer.unwrapEffect(
  Effect.sync(() =>
    PgClient.layer({
      url: Redacted.make(process.env.TEST_DB_URL!),
      ...pgConfig,
    }),
  ),
);

// Tagged error for transaction rollback trick
export class TransactionRollback extends Schema.TaggedError<TransactionRollback>(
  "TestRollback",
)("TestRollback", { value: Schema.Any }) {}

// Wrap test effect in transaction that always rolls back
export const withTransactionRollback = <A, E, R>(
  self: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const value = yield* self;
          return yield* new TransactionRollback({ value });
        }),
      )
      .pipe(
        Effect.catchIf(Schema.is(TransactionRollback), (error) =>
          Effect.succeed(error.value as A),
        ),
      );
  });
```

## Query Patterns with SqlSchema

### SqlSchema.single - Return exactly one row (or NoSuchElementException)

```ts
const findById = SqlSchema.single({
  Request: Schema.Struct({ id: UserId, orgId: OrgId }),
  Result: UserModel,
  execute: ({ id, orgId }) => sql`
    SELECT * FROM users
    WHERE id = ${id} AND organization_id = ${orgId}
  `,
});

// Returns: Effect<User, SqlError | ParseError | NoSuchElementException>
const user = yield * findById({ id, orgId });
```

### SqlSchema.findOne - Return Option (no error if not found)

```ts
const findByEmail = SqlSchema.findOne({
  Request: Schema.String,
  Result: UserModel,
  execute: (email) => sql`
    SELECT * FROM users WHERE email = ${email}
  `,
});

// Returns: Effect<Option<User>, SqlError | ParseError>
const maybeUser = yield * findByEmail("user@example.com");
```

### SqlSchema.findAll - Return array

```ts
const listByOrg = SqlSchema.findAll({
  Request: Schema.Struct({ orgId: OrgId, limit: Schema.Number }),
  Result: UserModel,
  execute: ({ orgId, limit }) => sql`
    SELECT * FROM users
    WHERE organization_id = ${orgId}
    LIMIT ${limit}
  `,
});

// Returns: Effect<ReadonlyArray<User>, SqlError | ParseError>
const users = yield * listByOrg({ orgId, limit: 100 });
```

### SqlSchema.void - No return value

```ts
const deleteUser = SqlSchema.void({
  Request: Schema.Struct({ id: UserId, orgId: OrgId }),
  execute: ({ id, orgId }) => sql`
    DELETE FROM users
    WHERE id = ${id} AND organization_id = ${orgId}
  `,
});

// Returns: Effect<void, SqlError | ParseError>
yield * deleteUser({ id, orgId });
```

## SQL Template Helpers

```ts
// Insert single or multiple rows
sql`INSERT INTO accounts ${sql.insert({ name, accountType })}`;
sql`INSERT INTO accounts ${sql.insert([row1, row2, row3])}`;

// Insert with RETURNING
sql`INSERT INTO users ${sql.insert({ name, email }).returning("*")}`;

// Update with specific columns (second arg excludes columns from SET)
sql`UPDATE accounts SET ${sql.update({ name, accountType })} WHERE id = ${id}`;
sql`UPDATE users SET ${sql.update(request, ["id", "organizationId"])} WHERE id = ${request.id}`;

// IN clause (handles empty array safely)
sql`SELECT * FROM accounts WHERE id IN ${sql.in(ids)}`;
sql`DELETE FROM users WHERE ${sql.in("id", userIds)}`;

// Combine conditions with AND
sql`SELECT * FROM accounts WHERE ${sql.and([
  sql`company_id = ${companyId}`,
  sql`active = true`,
])}`;

// Dynamic identifiers (table/column names)
const tableName = "users";
const columnName = "email";
sql`SELECT * FROM ${sql(tableName)} WHERE ${sql(columnName)} = ${value}`;

// Raw SQL (use sparingly, for things like ORDER BY direction)
const orderDirection = "DESC";
sql`SELECT * FROM users ORDER BY created_at ${sql.unsafe(orderDirection)}`;
```

## Repository as Effect.Service

```ts
export class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
  dependencies: [PgLive],
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const insert = SqlSchema.single({
      Request: InsertUser,
      Result: UserModel,
      execute: (request) => sql`
        INSERT INTO users ${sql.insert(request).returning("*")}
      `,
    });

    const findById = SqlSchema.single({
      Request: Schema.Struct({ id: UserId, orgId: OrgId }),
      Result: UserModel,
      execute: ({ id, orgId }) => sql`
        SELECT * FROM users
        WHERE id = ${id} AND organization_id = ${orgId}
      `,
    });

    return {
      insert: (request: InsertUser) =>
        insert(request).pipe(
          Effect.catchTags({
            ParseError: Effect.die,
            SqlError: Effect.die,
          }),
        ),
      findById: (id: UserId, orgId: OrgId) =>
        findById({ id, orgId }).pipe(
          Effect.catchTags({
            ParseError: Effect.die,
            SqlError: Effect.die,
            NoSuchElementException: () => Effect.fail(new UserNotFoundError()),
          }),
        ),
    };
  }),
}) {}
```

## Schema.parseJson for JSON Columns

Use `Schema.parseJson` in Result schemas to parse JSON from the database, and in Request schemas to encode objects to JSON strings for storage.

**Key insight**: SqlSchema encodes the Request (IA → II) before passing to `execute`, and decodes the Result (AI → A) after. So `Schema.parseJson` in Request encodes to JSON string, while in Result it parses from JSON string.

```ts
// Result schema with JSON fields
const ResultSchema = Schema.Struct({
  id: UserId,
  name: Schema.String,
  // Parse JSON column containing an array
  variants: Schema.parseJson(Schema.Array(Variant)),
  // Parse nullable JSON column
  metadata: Schema.NullOr(Schema.parseJson(MetadataSchema)),
});

// SQL query returns JSON as text (cast with ::text)
const findWithVariants = SqlSchema.single({
  Request: Schema.Struct({ id: ExperimentId }),
  Result: ResultSchema,
  execute: ({ id }) => sql`
    SELECT
      e.id,
      e.name,
      COALESCE(JSON_AGG(v.*), '[]')::text AS variants,
      e.metadata::text AS metadata
    FROM experiments e
    LEFT JOIN variants v ON v.experiment_id = e.id
    WHERE e.id = ${id}
    GROUP BY e.id
  `,
});
```

### Storing JSON in the Database (Request)

```ts
// Request schema - parseJson encodes the object to a JSON string
const InsertChat = Schema.Struct({
  id: ChatId,
  // This will be encoded to a JSON string for the INSERT
  config: Schema.parseJson(
    Schema.Struct({
      model: Schema.String,
      temperature: Schema.Number,
    }),
  ),
  segments: Schema.parseJson(Schema.Array(Segment)),
});

const insertChat = SqlSchema.single({
  Request: InsertChat,
  Result: ChatModel,
  // request.config and request.segments are already JSON strings here
  execute: (request) => sql`
    INSERT INTO chats ${sql.insert(request).returning("*")}
  `,
});

// Usage - pass objects, SqlSchema encodes them to JSON strings
yield *
  insertChat({
    id: chatId,
    config: { model: "gpt-4", temperature: 0.7 }, // object, not string
    segments: [{ type: "text", content: "hello" }],
  });
```

### JSON Aggregation Patterns (Result)

```ts
// Aggregate related rows into JSON array
sql`
  SELECT
    f.id,
    f.name,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', file.id,
          'name', file.name,
          'size', file.size::text,
          'mimeType', file.mime_type
        )
      ) FILTER (WHERE file.id IS NOT NULL),
      '[]'
    )::text AS files
  FROM folders f
  LEFT JOIN files file ON file.folder_id = f.id
  GROUP BY f.id
`;

// With Schema
const FolderWithFiles = Schema.Struct({
  id: FolderId,
  name: Schema.String,
  files: Schema.parseJson(
    Schema.Array(
      Schema.Struct({
        id: FileId,
        name: Schema.String,
        size: Schema.String,
        mimeType: Schema.String,
      }),
    ),
  ),
});
```

## Struct.evolve for Field Transformations

Use `Struct.evolve` to transform specific fields in a struct schema:

```ts
import * as Struct from "effect/Struct";

// Transform a field to use typeSchema (removes encoding, keeps only decoding)
const ResultSchema = Schema.Struct(
  Struct.evolve(ChatMessage.fields, {
    // Convert encoded schema to type-only schema
    segments: (schema) => Schema.typeSchema(schema),
    // Transform nested content
    content: (schema) => Schema.NullOr(Schema.typeSchema(schema)),
  }),
);

// Evolve for nested JSON parsing
const ChatWithLatestMessage = Schema.Struct(
  Struct.evolve(Chat.fields, {
    latestMessage: () =>
      Schema.NullOr(
        Schema.Struct(
          Struct.evolve(ChatMessage.fields, {
            segments: (segmentSchema) => Schema.typeSchema(segmentSchema),
          }),
        ),
      ),
  }),
);

// Combined with parseJson for JSON columns
const ResultSchema = Schema.Struct({
  id: ChatId,
  contentItem: Schema.parseJson(
    Schema.Struct(
      Struct.evolve(ChatContentItem.fields, {
        content: (schema) => Schema.typeSchema(schema),
      }),
    ),
  ),
});
```

## Transform Schemas for Complex Queries

When database shape differs from domain shape:

```ts
// Database returns flat columns
const RemoteUser = Schema.Struct({
  id: UserId,
  name: Schema.String,
  profileId: Schema.NullOr(ProfileId),
  profileBio: Schema.NullOr(Schema.String),
});

// Domain has nested structure
const User = Schema.Struct({
  id: UserId,
  name: Schema.String,
  profile: Schema.NullOr(
    Schema.Struct({
      id: ProfileId,
      bio: Schema.String,
    }),
  ),
});

// Transform schema
const RemoteToUser = RemoteUser.pipe(
  Schema.transform(Schema.typeSchema(User), {
    decode: (remote) => ({
      id: remote.id,
      name: remote.name,
      profile:
        remote.profileId && remote.profileBio
          ? { id: remote.profileId, bio: remote.profileBio }
          : null,
    }),
    encode: () => {
      throw new Error("Encoding not supported");
    },
    strict: true,
  }),
);
```

## Transactions

```ts
const sql = yield * SqlClient.SqlClient;

// Wrap operations in transaction
yield *
  sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`INSERT INTO orders ${sql.insert(order)}`;
      yield* sql`UPDATE inventory SET quantity = quantity - ${qty} WHERE id = ${itemId}`;
    }),
  );
```

## Streaming with Pagination

```ts
import * as Stream from "effect/Stream";

const CHUNK_SIZE = 100;

const listByOrgId = (orgId: OrgId): Stream.Stream<User> =>
  Stream.unfoldEffect(0, (offset) =>
    listByOrgIdQuery({ organizationId: orgId, offset }).pipe(
      Effect.map((chunk) => {
        if (chunk.length === 0) return Option.none();
        const nextOffset = offset + chunk.length;
        return Option.some([chunk, nextOffset] as const);
      }),
    ),
  ).pipe(Stream.flatMap(Stream.fromIterable));
```

## PostgreSQL LISTEN/NOTIFY

```ts
import * as PgClient from "@effect/sql-pg/PgClient";
import * as Stream from "effect/Stream";

export const PgListener = {
  forSchema: <A, I, R, Deps extends readonly Layer.Layer.Any[]>(options: {
    readonly channel: string;
    readonly schema: Schema.Schema<A, I>;
    readonly onEvent: (event: A) => Effect.Effect<void, never, R>;
    readonly dependencies: Deps;
  }) => {
    const decode = Schema.decodeUnknown(Schema.parseJson(options.schema));

    const Default = Layer.scopedDiscard(
      Effect.gen(function* () {
        const sql = yield* PgClient.PgClient;

        yield* sql.listen(options.channel).pipe(
          Stream.tap((payload) =>
            decode(payload).pipe(
              Effect.flatMap(options.onEvent),
              Effect.catchAllCause(Effect.logError),
            ),
          ),
          Stream.retry(retrySchedule),
          Stream.runDrain,
          Effect.forkScoped,
        );
      }),
    );

    return { Default };
  },
};
```

## Migrations with PgMigrator

```ts
import * as PgMigrator from "@effect/sql-pg/PgMigrator";

const runMigrations = Effect.gen(function* () {
  const migrations = yield* PgMigrator.run({
    loader: PgMigrator.fromFileSystem(path.join(__dirname, "./migrations")),
  });

  for (const [id, name] of migrations) {
    yield* Effect.log(`Applied: ${id.toString().padStart(4, "0")}_${name}`);
  }
}).pipe(Effect.provide(PgLive));
```

Migration file format (`migrations/0001_init.ts`):

```ts
import * as Effect from "effect/Effect";
import * as SqlClient from "@effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      organization_id UUID NOT NULL REFERENCES organizations(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
});
```

## Testing Database Code

```ts
import { expect, it } from "@effect/vitest";
import * as Layer from "effect/Layer";

const Live = UserRepo.DefaultWithoutDependencies.pipe(
  Layer.provideMerge(PgTest),
);

it.layer(Live)("UserRepo", (it) => {
  it.effect(
    "insert creates user",
    Effect.fn(function* () {
      const repo = yield* UserRepo;
      const user = yield* repo.insert({
        name: "Test",
        email: "test@example.com",
      });

      expect(user.name).toBe("Test");
      expect(user.id).toBeDefined();
    }),
  );

  it.effect(
    "findById returns user",
    Effect.fn(function* () {
      const repo = yield* UserRepo;
      // Setup test data first...
      const user = yield* repo.findById(testId, testOrgId);
      expect(user.name).toBe("Test");
    }),
  );
});
```

## Error Handling Patterns

### Convert to defects (internal errors)

```ts
const insert = SqlSchema.single({
  /* ... */
});

// Be explicit about which errors become defects - NEVER use Effect.orDie
const insertUser = (request: InsertUser) =>
  insert(request).pipe(
    Effect.catchTags({
      ParseError: Effect.die,
      SqlError: Effect.die,
    }),
  );
```

### Convert to domain errors

```ts
const findById = (id: UserId, orgId: OrgId) =>
  findByIdQuery({ id, orgId }).pipe(
    Effect.mapError(() => new UserNotFoundError({ id })),
    Effect.catchTags({
      ParseError: Effect.die,
      SqlError: Effect.die,
    }),
  );
```

## Organization Isolation Pattern

Always include `organization_id` in WHERE clauses for multi-tenant data:

```ts
// Always filter by orgId for tenant isolation
sql`
  SELECT * FROM experiments
  WHERE id = ${id} AND organization_id = ${orgId}
`;

sql`
  UPDATE experiments
  SET status = ${status}
  WHERE id = ${id} AND organization_id = ${orgId}
`;

sql`
  DELETE FROM experiments
  WHERE id = ${id} AND organization_id = ${orgId}
`;
```

## Common Query Patterns

### CTE for INSERT...RETURNING with JOINs

```ts
sql`
  WITH inserted AS (
    INSERT INTO experiments ${sql.insert(request).returning("*")}
  )
  SELECT
    e.*,
    ee.id AS "eventId",
    ee.data::text AS "eventData"
  FROM inserted e
  LEFT JOIN experiment_events ee ON e.event_id = ee.id
`;
```

### JSON aggregation for nested data

```ts
sql`
  SELECT
    f.*,
    COALESCE(
      JSON_AGG(
        JSON_BUILD_OBJECT('id', file.id, 'name', file.name)
      ) FILTER (WHERE file.id IS NOT NULL),
      '[]'
    )::text AS files
  FROM folders f
  LEFT JOIN files file ON file.folder_id = f.id
  GROUP BY f.id
`;
```

### Count with pagination

```ts
const [data, countResult] =
  yield *
  Effect.zip(findManyQuery({ orgId, limit, offset }), countQuery(orgId), {
    concurrent: true,
  });

return {
  data,
  total: countResult.count,
  hasMore: offset + limit < countResult.count,
};
```
