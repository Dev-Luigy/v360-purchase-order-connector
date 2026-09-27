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

Pendências: mecanismo de serialização (advisory lock por hash de `(clientId, externalNumber)` versus trava na linha do pedido) fica para P1-02; política para impedir regressão por carga atrasada não está decidida; reconciliação do staging ainda não tem disparo definido.
