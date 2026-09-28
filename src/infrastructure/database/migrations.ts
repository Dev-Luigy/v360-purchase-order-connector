/**
 * Migração que este artefato exige para se considerar pronto.
 *
 * Contar linhas em `_prisma_migrations` não basta: migração que ainda não
 * rodou não aparece lá, então um banco parado em `0001` responderia pronto
 * para um código que já espera `0002` (REVIEW-05, achado 2). É preciso nomear
 * o que se espera.
 *
 * A constante é escrita à mão, e uma constante escrita à mão envelhece em
 * silêncio — por isso existe um teste que a compara com a pasta
 * `database/migrations/` e falha quando alguém acrescenta uma migração sem
 * atualizar isto aqui.
 */
export const requiredMigration = '0001_contrato_normalizado';
