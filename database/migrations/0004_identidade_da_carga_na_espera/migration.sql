-- A espera precisa saber de qual carga cada linha veio.
--
-- Em FIX-12 a tabela passou a acumular os itens de uma carga até o fim da
-- leitura, para que a consolidação fosse uma transação por pedido. Como as
-- linhas só eram identificadas por cliente, pedido e linha, duas cargas
-- simultâneas do mesmo pedido consumiam uma a da outra: a primeira a pegar o
-- lock levava as duas, e os dois relatórios mentiam (REVIEW-12, R12-02).
--
-- `ingestion_id` separa as duas coisas que a tabela faz: acumular **desta**
-- carga, e guardar órfão de qualquer carga até o cabeçalho chegar. A
-- consolidação leva só o que é seu; a reconciliação por cabeçalho leva tudo.

ALTER TABLE "ingestion_staging"
  ADD COLUMN "ingestion_id" UUID;

-- As linhas que já estavam esperando não pertencem a carga nenhuma em
-- andamento: ficam como órfãs de origem desconhecida, que é o que são.
-- `NULL` nunca é consolidado por engano, só reconciliado pelo cabeçalho.

CREATE INDEX "ingestion_staging_client_ingestion_idx"
  ON "ingestion_staging"("client_id", "ingestion_id");
