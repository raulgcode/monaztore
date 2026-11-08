// Re-exported so consumers share this package's single drizzle-orm instance.
export {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  ne,
  notExists,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
export { alias } from "drizzle-orm/pg-core";
export { createDatabase, type Database, type DatabaseConnection } from "./client";
export * as schema from "./schema";
