-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "purchase_order_status" AS ENUM ('aberto', 'encerrado', 'bloqueado');

-- CreateEnum
CREATE TYPE "conference_outcome" AS ENUM ('aprovada', 'reprovada');

-- CreateEnum
CREATE TYPE "divergence_code" AS ENUM ('FORNECEDOR_DIVERGENTE', 'PEDIDO_NAO_ABERTO', 'MATERIAL_NAO_ENCONTRADO', 'MATERIAL_AMBIGUO', 'QUANTIDADE_NAO_POSITIVA', 'QUANTIDADE_ACIMA_DO_SALDO', 'VALOR_TOTAL_DIVERGENTE');

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "external_number" VARCHAR(64) NOT NULL,
    "supplier_tax_id" CHAR(14) NOT NULL,
    "supplier_name" VARCHAR(256) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "purchase_order_status" NOT NULL,
    "issued_on" DATE NOT NULL,
    "ingestion_version" INTEGER NOT NULL DEFAULT 1,
    "ingested_at" TIMESTAMPTZ(3) NOT NULL,
    "has_pending_balance" BOOLEAN NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_item" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "external_line" INTEGER NOT NULL,
    "material" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512) NOT NULL,
    "purchase_unit" VARCHAR(16) NOT NULL,
    "conversion_factor" DECIMAL(30,6) NOT NULL,
    "quantity_ordered" DECIMAL(30,6) NOT NULL,
    "quantity_received" DECIMAL(30,6) NOT NULL,
    "quantity_pending" DECIMAL(30,6) NOT NULL,
    "unit_price" DECIMAL(30,6) NOT NULL,
    "line_created_on" DATE,

    CONSTRAINT "purchase_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "purchase_order_ingestion_version" INTEGER NOT NULL,
    "client_id" VARCHAR(64) NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "outcome" "conference_outcome" NOT NULL,
    "invoice" JSONB NOT NULL,

    CONSTRAINT "conference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_divergence" (
    "id" UUID NOT NULL,
    "conference_id" UUID NOT NULL,
    "code" "divergence_code" NOT NULL,
    "field" VARCHAR(128) NOT NULL,
    "invoice_line_index" INTEGER,
    "purchase_order_line" INTEGER,
    "expected" VARCHAR(512),
    "received" VARCHAR(512),

    CONSTRAINT "conference_divergence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_order_client_id_status_id_idx" ON "purchase_order"("client_id", "status", "id");

-- CreateIndex
CREATE INDEX "purchase_order_supplier_tax_id_id_idx" ON "purchase_order"("supplier_tax_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_client_id_external_number_key" ON "purchase_order"("client_id", "external_number");

-- CreateIndex
CREATE INDEX "purchase_order_item_purchase_order_id_material_idx" ON "purchase_order_item"("purchase_order_id", "material");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_item_purchase_order_id_external_line_key" ON "purchase_order_item"("purchase_order_id", "external_line");

-- CreateIndex
CREATE INDEX "conference_client_id_checked_at_id_idx" ON "conference"("client_id", "checked_at", "id");

-- CreateIndex
CREATE INDEX "conference_purchase_order_id_idx" ON "conference"("purchase_order_id");

-- CreateIndex
CREATE INDEX "conference_divergence_conference_id_idx" ON "conference_divergence"("conference_id");

-- CreateIndex
CREATE INDEX "conference_divergence_code_idx" ON "conference_divergence"("code");

-- AddForeignKey
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference" ADD CONSTRAINT "conference_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_divergence" ADD CONSTRAINT "conference_divergence_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "conference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índices parciais escritos à mão: o schema do Prisma não declara `WHERE`.
--
-- O filtro "apenas os que ainda têm algo a receber" é a consulta mais quente do
-- requisito 1, varrida de madrugada sobre dezenas de milhares de pedidos em
-- aberto. Como `has_pending_balance` é mantido na ingestão (ADR-006), o índice
-- parcial cobre só as linhas que interessam e encolhe com o tempo, em vez de
-- crescer junto com o histórico de pedidos encerrados (REVIEW-02, achado 3).
--
-- O `id` na segunda posição é o cursor de ADR-010: com UUID v7 ele é ordenável
-- no tempo, então a paginação avança pelo próprio índice, sem ordenação extra.
CREATE INDEX "purchase_order_pending_by_client_idx"
  ON "purchase_order" ("client_id", "id")
  WHERE "has_pending_balance";

CREATE INDEX "purchase_order_pending_by_supplier_idx"
  ON "purchase_order" ("supplier_tax_id", "id")
  WHERE "has_pending_balance";
