import { usersTable } from '../../db/schemas/users.schema.js';

export type User = typeof usersTable.$inferSelect;
