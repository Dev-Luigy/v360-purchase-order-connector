# Handoff: REVIEW-01 — revisão da base e limites de P1-03

- Agente e data: Codex, 2026-09-27.
- Estado: concluída.
- Escopo: revisão de domínio, schemas, perfis, leitores em fluxo, adaptadores Alfa/Beta e rotas operacionais. Nenhum código de produção ou teste versionado foi alterado.
- Validação: `npm run check` verde; 66 casos em sete arquivos. Cobertura: 96,00% linhas, 81,53% branches, 99,15% funções. Sonda temporária em `/tmp` confirmou 13 cenários de limite; 2.000 combinações de soma/subtração/produto concordaram com `BigInt`. Compose real não foi executado; após a tentativa interrompida, `docker compose ps --all` não mostrou containers.

## Achados priorizados

1. **Alto — CNPJ contaminado pode ser aprovado.** `parseTaxId` e a conferência removem todo caractere não numérico; a nota valida apenas `min(1)`. `abc12.345.678/0001-90xyz` vira CNPJ válido e uma nota pode ser aprovada. Restringir máscara permitida e usar `taxIdSchema` na nota.
2. **Alto — dados numéricos inválidos chegam ao domínio.** O schema aceita fator zero/negativo, quantidades negativas e preço negativo. Fator zero lança exceção em `checkInvoice`, provável 500 futuro. Definir invariantes antes de P1-02/P1-04.
3. **Alto — lote Beta não é limitado em todos os caminhos.** Cabeçalhos sem itens são acumulados e emitidos num único lote; com `batchSize=10`, 25 pedidos saíram juntos. Todos os cabeçalhos também ficam em memória. Isso contradiz a promessa de lotes limitados para “qualquer volume”.
4. **Médio — normalização pode alterar dado ruim.** `12.34` no formato brasileiro vira `1234`; `1.23.4,50` vira `1234.50`. Validar agrupamento antes de remover pontos.
5. **Médio — schemas validam aparência, não valor.** `2026-02-31` passa em `isoDateSchema`; expoente e escala decimal não têm teto e podem gerar strings enormes. O parser dos adaptadores é mais estrito que o schema compartilhado.
6. **Médio — perfil não fica realmente válido/imutável.** `nested-json` sem `ordersArray` e perfil sem campo de moeda nem moeda assumida passam no start. O registro guarda referências mutáveis; alteração posterior contorna a validação.
7. **Médio/baixo — corrupção silenciosa nas bordas.** Booleanos JSON viram strings (`true` vira fornecedor/material), UTF-8 inválido vira `�`, moedas fora do mapa usam duas casas (inclusive JPY) e operações triviais com um operando de 60 dígitos são recusadas pelas guardas conservadoras.

## Rotas e pendências

`/health` permaneceu 200 sem consultar banco; `/ready` virou 503 e não vazou a mensagem da exceção. O erro do banco também não é registrado. `POST /health`, `/health/` e rota desconhecida retornam 404; decidir se a barra final deve ser aceita. As rotas de negócio ainda não existem, portanto limites de corpo, paginação e multipart só poderão ser testados em P1-04.

Próximo passo recomendado: abrir tarefa de estabilização com testes de regressão para os itens 1–6 antes de expor P1-04. A exclusão preexistente de `scripts/activate-node.sh` foi preservada.
