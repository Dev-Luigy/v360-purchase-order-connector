# ADR-008 — Ingestão: cliente, adaptadores, reenvio e cargas parciais

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa P1-01.
- Autoridade: decisão de engenharia da tarefa. O enunciado deixa a forma de ingestão livre e cobra a política de reenvio e a do Delta registradas no README.

## Decisão

**O cliente é identificado explicitamente, nunca deduzido.** O `clientId` vai no caminho (`POST /clients/{clientId}/ingestions`) e a versão do formato em cabeçalho. Dedução por conteúdo quebra exatamente aqui: Delta usa **os mesmos nomes de campo** do Alfa. Além disso o requisito 1 exige filtrar por cliente de origem, e a identidade do pedido depende dele (ADR-006) — precisamos do identificador de todo jeito.

**Um adaptador por forma de entrega, não por cliente.** São quatro formas (`nested-json`, `paired-csv`, `flat-json`, `split-json`) e N clientes. O que é estrutura — agrupar linhas achatadas, juntar dois arquivos por chave, ler em fluxo, decidir o que fazer com órfão — é código. O que é rótulo — caminho do campo, formato de data e número, máscara de CNPJ, delimitador, encoding, vocabulário de situação, moeda assumida — é o `ClientProfile`. Cliente novo em forma conhecida é um perfil novo, sem código novo; e como esses ERPs são poucos produtos de mercado, esse é o caso comum. O Delta prova o desenho: reusa a configuração de campo do Alfa e só ganha um leitor de forma nova.

**O perfil começa como configuração tipada em código**, validada no start da aplicação. Não em tabela: quatro clientes não justificam tabela, endpoint de administração e versionamento de perfil, e o enunciado cobra decisão defensável, não painel. O critério de graduação para o banco fica registrado: quando onboarding precisar acontecer sem release. A porta `ClientProfiles` já é assíncrona para que essa troca não mexa em quem consome.

**O adaptador confere o payload contra o perfil declarado e rejeita divergência.** Cabeçalho esperado no CSV, chaves obrigatórias no JSON. Perfil errado precisa falhar alto: `1.200,000` lido com a política do Alfa vira outro número e nada explode.

**Reenvio: retrato completo, por pedido, em uma transação.** A identidade interna é preservada, `ingestionVersion` incrementa, o saldo é recalculado e o histórico de conferências não é tocado. Cargas concorrentes do mesmo pedido são serializadas. Como nenhuma fonte informa versão confiável, **prevalece a última carga aceita**; uma carga antiga pode, portanto, regredir o retrato. Não impedimos isso, registramos `ingestedAt` para que a regressão seja detectável, e a política adicional fica documentada como pendência em vez de inventada agora.

**Carga só de cabeçalho não apaga itens.** No contrato, `items: null` significa "esta carga não trouxe os itens" e `items: []` significa "o cliente afirma que não há itens". Para `split-json` a substituição é escopada ao que o payload carregou: cabeçalho atualiza cabeçalho, itens substituem itens. Sem essa distinção, uma consulta de cabeçalhos do Delta apagaria todos os itens previamente válidos.

**Delta sem correspondência vai para staging, não para pedido incompleto.** Item sem cabeçalho (`DL-2026-0099` na amostra) espera em staging com o conteúdo cru, para reconciliar quando o cabeçalho aparecer, sem pedir a carga de novo. Cabeçalho sem itens (`DL-2026-0046`) é persistido como pedido legítimo — ele existe no sistema do cliente — com `hasPendingBalance: false`; uma conferência contra ele naturalmente devolve `MATERIAL_NAO_ENCONTRADO`, então não precisa de sinalização especial. Isto substitui a proposta de "não disponibilizar pedido incompleto" do [TECHNICAL_PLAN](../TECHNICAL_PLAN.md): o caso se resolve pelas regras que já existem.

**Aceitação parcial.** Transação por pedido, não por carga. Um registro inválido em dez mil não rejeita o lote: o resto entra e o `IngestionReport` devolve cada rejeitado com referência e motivo. Tudo-ou-nada, num volume que o enunciado descreve como "dezenas de milhares", transformaria um erro de digitação em indisponibilidade para o cliente.

**Leitura em fluxo, em lotes limitados.** O adaptador rende `AdapterBatch`; nada exige a carga inteira em memória.

## Alternativas consideradas

Perfil em tabela desde o início: descartada por dimensionamento, com critério de graduação registrado. Mapeamento inteiramente declarativo: descartada, não resolve diferença estrutural e o motor vira mini-linguagem. Adaptador por cliente: descartada, duplicaria o Delta inteiro a partir do Alfa. Ingestão por leitura no start: descartada, não serve a cliente que reenvia.

## Consumidores e pendências

P1-03 implementa os adaptadores Alfa e Beta e os perfis; P1-02 implementa `replaceSnapshot` com transação, serialização e staging; P1-04 expõe o endpoint e o relatório de carga.

Pendências: mecanismo de serialização (advisory lock por hash de `(clientId, externalNumber)` versus trava na linha do pedido) fica para P1-02; política para impedir regressão por carga atrasada não está decidida.

## Atualização — P2-01, 2026-09-28

**O disparo da reconciliação ficou definido: é a chegada do cabeçalho.** Até P2-01 esta decisão estava escrita e não implementada — o item órfão voltava no relatório da carga e se perdia, então a promessa de "reconciliar sem pedir a carga de novo" não se cumpria. Agora ele é persistido em `ingestion_staging` (migração `0002`) e entra no pedido quando o cabeçalho chega.

Quatro escolhas da implementação, todas defensáveis e nenhuma dedutível do texto acima:

- **O item é gravado já normalizado**, com o conteúdo cru ao lado. Quem reconcilia é o caso de uso, que não conhece o formato do cliente e não teria como reparsear; o cru fica para auditoria e para o relatório.
- **A leitura revalida contra o contrato.** O que sai da espera entra num pedido de verdade, e uma linha gravada por uma versão anterior do contrato não pode atravessar sem conferência.
- **Ler e apagar acontecem na mesma transação**, então uma falha ao gravar o pedido deixa o item esperando em vez de sumir com ele.
- **A carga da vez manda.** Se ela traz a linha 10, a versão que esperava está velha e é descartada — coerente com "prevalece a última carga aceita".

E um limite que a implementação revelou: **o adaptador só enxerga os cabeçalhos da carga atual**, então o que ele chama de órfão pode ser item de pedido que já existe no banco — o caso de mandar só a consulta de itens do Delta, que é uso normal. A decisão ficou com o caso de uso, que tem o repositório: item cujo pedido já existe é aplicado, item de pedido desconhecido espera.

Segue em aberto: não há expiração nem teto para a espera. Um cliente que mande itens de pedidos que nunca existirão acumula linhas indefinidamente. Falta decidir a política — descarte por idade, teto por cliente, ou visibilidade operacional — e nenhuma delas se decide sem dado de uso real.

## Atualização — FIX-17, 2026-09-29

**Documento estruturalmente quebrado não muda nada.** O payload é conferido
inteiro antes de a carga gravar qualquer coisa; se ele não termina, a resposta
é `422` e nem pedido nem espera são tocados.

Isso **não** contradiz a aceitação parcial acima: ela vale para **registro
inválido**, que continua sendo recusado individualmente e sempre volta no
relatório com referência e motivo. Um documento truncado é outra coisa — falha
de transporte —, e aceitar o prefixo dele deixava pedidos gravados com a
resposta dizendo que o payload era incompatível, **sem recibo do que entrou**
([REVIEW-16](../handoffs/REVIEW-16-validacao-integral-pos-fix-16-codex.md),
R16-01).

A escolha entre "recusar tudo" e "aceitar o prefixo com relatório" foi decidida
**medindo**: a conferência estrutural percorre o arquivo já em disco sem
materializar valor nenhum, e custou **0,6s contra 83s** de uma carga de 20.000
pedidos — 1%. A 1% não há motivo para deixar meia carga aplicada sem recibo.

O streaming e o limite de memória continuam intactos: é uma segunda leitura do
spool, não uma transação sobre a carga inteira.
