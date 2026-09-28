import type { StagingRepository } from '../../application/ports/staging-repository.js';
import type { ClientId } from '../../domain/client.js';
import type { StagedItem } from '../../domain/ingestion.js';
import { describeIssues, normalizedItemSchema } from '../../domain/schemas.js';

import type { Prisma, PrismaClient } from './generated/client.js';

/**
 * Itens em espera, em PostgreSQL.
 *
 * O `item` é gravado como JSON já normalizado e **revalidado na leitura**: o
 * que voltar daqui entra num pedido de verdade, e uma linha gravada por uma
 * versão anterior do contrato não pode atravessar sem conferência.
 */
export class PrismaStagingRepository implements StagingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async stage(clientId: ClientId, items: readonly StagedItem[]): Promise<void> {
    if (items.length === 0) return;
    const stagedAt = new Date();
    // O Prisma exige o tipo estrutural dele; o item é um objeto fechado de
    // texto e número, então a conversão é só de tipo — o mesmo padrão que
    // `conference-repository` usa para a nota fiscal.
    const comoJson = (staged: StagedItem): Prisma.InputJsonValue =>
      staged.item as unknown as Prisma.InputJsonValue;
    // Reenviar a mesma linha substitui a anterior: a carga mais recente vale.
    await this.prisma.$transaction(
      items.map((staged) =>
        this.prisma.ingestionStaging.upsert({
          where: {
            clientId_externalNumber_externalLine: {
              clientId,
              externalNumber: staged.externalNumber,
              externalLine: staged.item.externalLine,
            },
          },
          create: {
            clientId,
            externalNumber: staged.externalNumber,
            externalLine: staged.item.externalLine,
            item: comoJson(staged),
            raw: staged.raw,
            stagedAt,
          },
          update: { item: comoJson(staged), raw: staged.raw, stagedAt },
        }),
      ),
    );
  }

  async takeFor(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<readonly StagedItem[]> {
    // Ler e apagar na mesma transação: se a gravação do pedido falhar depois,
    // a transação do chamador desfaz tudo e o item continua em espera.
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.ingestionStaging.findMany({
        where: { clientId, externalNumber },
        orderBy: { externalLine: 'asc' },
      });
      if (rows.length === 0) return [];
      await tx.ingestionStaging.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      return rows.map((row) => {
        const parsed = normalizedItemSchema.safeParse(row.item);
        if (!parsed.success) {
          throw new StagingError(
            `item em espera do pedido ${externalNumber} não passou no contrato: ${describeIssues(parsed.error)}`,
          );
        }
        return {
          reference: externalNumber,
          externalNumber,
          reason: 'cabecalho-ausente' as const,
          raw: row.raw,
          item: parsed.data,
        };
      });
    });
  }
}

export class StagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StagingError';
  }
}
