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
  /**
   * Quem pode dizer o IP de origem por `X-Forwarded-For`.
   *
   * Decide de quem é o IP que o teto de requisições conta, e os dois extremos
   * erram. Vazio — o padrão — ignora o cabeçalho: atrás de um proxy, todos os
   * clientes chegam com o IP dele e **dividem uma quota só**. Confiar em
   * qualquer um sem proxy na frente é pior: o cliente manda o cabeçalho que
   * quiser e escapa do teto.
   *
   * Por isso é de ambiente e nasce desligado: só quem implanta sabe o que há
   * na frente. Com Caddy ou Nginx no mesmo host, `loopback` — assim o
   * cabeçalho só é honrado quando quem conecta é o próprio host. Também aceita
   * endereço ou faixa CIDR, e vários separados por vírgula.
   */
  TRUST_PROXY: z.string().default(''),
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
