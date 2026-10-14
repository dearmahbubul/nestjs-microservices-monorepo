import { toInt } from '@repo/config';

export interface AppConfig {
  app: {
    env: string;
    port: number;
  };
  database: {
    url: string;
  };
}

export default function loadConfiguration(): AppConfig {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    app: {
      env,
      port: toInt('PORT', 3000),
    },
    database: {
      // The compose stack runs a single-node replica set; a host-run process
      // connects with directConnection instead (see .env.example).
      url: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/cart',
    },
  };
}
