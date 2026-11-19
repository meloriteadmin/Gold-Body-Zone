import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use a direct PostgreSQL connection for migrations.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
