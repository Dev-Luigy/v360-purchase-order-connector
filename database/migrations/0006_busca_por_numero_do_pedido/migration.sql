-- Consulta por número do pedido.
--
-- A plataforma conhece o número — é por ele que identifica o pedido na
-- conferência — e até agora a única forma de encontrá-lo na consulta era
-- varrer tudo. O par (cliente, número) já é único e indexado; o que faltava
-- é o número **sem** o cliente, que é uso legítimo: o enunciado avisa que o
-- mesmo número pode existir em clientes diferentes, e procurar onde ele está
-- é justamente a pergunta.

CREATE INDEX "purchase_order_external_number_id_idx"
    ON "purchase_order"("external_number", "id");
