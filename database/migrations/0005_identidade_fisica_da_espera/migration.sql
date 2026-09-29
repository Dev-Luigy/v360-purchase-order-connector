-- A carga precisa estar na **identidade** da linha em espera, não só ao lado.
--
-- A migração 0004 acrescentou `ingestion_id`, mas a unicidade continuou em
-- (cliente, pedido, linha). O `upsert` casava por essa chave e atualizava o
-- dono: duas cargas simultâneas disputando a mesma linha trocavam a posse, e
-- os dois relatórios mentiam. Um campo que o `upsert` sobrescreve não isola
-- nada (REVIEW-13, R13-01).

-- Linhas anteriores a 0004 não pertencem a carga nenhuma. Elas recebem um
-- identificador fixo e reservado: continuam sendo órfãs de origem
-- desconhecida, que só saem daqui pela reconciliação do cabeçalho, e agora
-- convivem com linhas de cargas reais sem colidir.
UPDATE "ingestion_staging"
   SET "ingestion_id" = '00000000-0000-0000-0000-000000000000'
 WHERE "ingestion_id" IS NULL;

ALTER TABLE "ingestion_staging"
  ALTER COLUMN "ingestion_id" SET NOT NULL;

DROP INDEX "ingestion_staging_client_external_line_key";

CREATE UNIQUE INDEX "ingestion_staging_owner_line_key"
    ON "ingestion_staging"("client_id", "ingestion_id", "external_number", "external_line");

-- A reconciliação pelo cabeçalho busca por pedido, sem saber a carga.
CREATE INDEX "ingestion_staging_client_order_idx"
    ON "ingestion_staging"("client_id", "external_number");
