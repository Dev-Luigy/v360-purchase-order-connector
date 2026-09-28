-- Itens que chegaram antes do cabeçalho deles.
--
-- O Delta entrega pedidos e itens em duas consultas independentes, sem garantia
-- de retratarem o mesmo instante (ADR-008). Antes desta tabela o item órfão
-- voltava no relatório da carga e se perdia: o cabeçalho podia chegar depois e
-- o item nunca reaparecia. Agora ele espera aqui e é reconciliado sozinho.

-- CreateTable
CREATE TABLE "ingestion_staging" (
    "id" UUID NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "external_number" VARCHAR(64) NOT NULL,
    "external_line" INTEGER NOT NULL,
    -- O item já normalizado: quem reconcilia é o caso de uso, que não conhece
    -- o formato do cliente e não teria como reparsear o cru.
    "item" JSONB NOT NULL,
    -- O conteúdo original, para auditoria e para o relatório da carga.
    "raw" TEXT NOT NULL,
    "staged_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ingestion_staging_pkey" PRIMARY KEY ("id")
);

-- Reenviar a mesma linha do mesmo pedido substitui a anterior: a carga mais
-- recente é a que vale. O índice também serve à busca por pedido, porque
-- (client_id, external_number) é prefixo dele.
CREATE UNIQUE INDEX "ingestion_staging_client_external_line_key"
    ON "ingestion_staging"("client_id", "external_number", "external_line");

-- Um item em espera sem linha identificável não tem como ser reconciliado.
ALTER TABLE "ingestion_staging"
    ADD CONSTRAINT "ingestion_staging_external_line_check"
    CHECK ("external_line" >= 0);
