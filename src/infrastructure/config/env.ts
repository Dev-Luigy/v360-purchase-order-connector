import { z } from 'zod';
const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // O teto de requisições é de ambiente, não de código: o valor certo depende
  // de quantos clientes entram pelo mesmo IP e de quão grande é a varredura
  // noturna. O padrão precisa caber a varredura que o enunciado descreve.
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000_000).default(1200),
  RATE_LIMIT_WINDOW: z.string().min(2).default('1 minute'),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => /^postgres(ql)?:/.test(value),
      'Expected a PostgreSQL URL',
    ),
});
export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  return environmentSchema.parse(environment);
}
