-- Invariantes da conferência que cabem na própria linha.
--
-- Estavam garantidas só pelas regras puras do domínio; a porta do repositório
-- aceita qualquer objeto estrutural, e TypeScript não protege runtime
-- (REVIEW-07, R07-09). A coerência entre `outcome` e a quantidade de
-- divergências não cabe aqui, porque atravessa duas tabelas: fica no
-- repositório, antes da transação.

ALTER TABLE "conference"
  ADD CONSTRAINT "conference_ingestion_version_check"
  CHECK ("purchase_order_ingestion_version" >= 1);

ALTER TABLE "conference_divergence"
  ADD CONSTRAINT "conference_divergence_invoice_line_index_check"
  CHECK ("invoice_line_index" IS NULL OR "invoice_line_index" >= 0);

ALTER TABLE "conference_divergence"
  ADD CONSTRAINT "conference_divergence_purchase_order_line_check"
  CHECK ("purchase_order_line" IS NULL OR "purchase_order_line" >= 0);
