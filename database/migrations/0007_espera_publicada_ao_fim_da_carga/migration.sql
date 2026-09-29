-- A espera de uma carga em andamento não pode ser consumida por outra.
--
-- A consolidação já só leva o que é da própria carga, mas a reconciliação pelo
-- cabeçalho leva **tudo** do pedido, de qualquer carga — é a promessa do
-- ADR-008. Enquanto uma carga ainda está lendo lotes, isso deixa outra
-- requisição consumir o prefixo dela; e se a primeira depois recusar o pedido
-- por passar do teto, o que já foi consumido não volta (REVIEW-14, R14-01).
--
-- `publicada` é o ciclo de vida mínimo que fecha a corrida: a linha nasce não
-- publicada, vira publicada quando a carga termina de ler, e um pedido
-- recusado é purgado sem nunca ter sido visível.

ALTER TABLE "ingestion_staging"
  ADD COLUMN "publicada" BOOLEAN NOT NULL DEFAULT false;

-- As linhas que já estavam esperando vieram de cargas encerradas.
UPDATE "ingestion_staging" SET "publicada" = true;

-- A reconciliação por cabeçalho busca por pedido e só enxerga o publicado.
DROP INDEX "ingestion_staging_client_order_idx";
CREATE INDEX "ingestion_staging_client_order_idx"
    ON "ingestion_staging"("client_id", "external_number")
    WHERE "publicada";
