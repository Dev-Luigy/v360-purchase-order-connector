# Diagramas

Diagramas derivados do código. O [guia do projeto](../PROJECT-GUIDE.md) explica
como navegar por eles e pelo restante da implementação.

| Diagrama                                               | Responde                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [classes.mmd](classes.mmd)                             | Quais são os principais tipos do domínio, casos de uso, portas e adaptadores e como se relacionam.   |
| [ingestion-process.mmd](ingestion-process.mmd)         | Como inicialização/recuperação, ingestão, reconciliação, conferência e consulta percorrem o sistema. |
| [contrato-normalizado.puml](contrato-normalizado.puml) | Quais objetos do contrato normalizado existem, seus campos e cardinalidades.                         |
| [portas-e-consumo.puml](portas-e-consumo.puml)         | Quem produz e consome objetos do contrato e quais componentes cumprem as portas.                     |

**O diagrama é derivado do código, não o contrário.** A fonte da verdade é `src/domain/**` e `src/application/ports/**`; as decisões estão em [docs/decisions](../decisions/README.md). Divergiu do código, o código está certo: corrija o `.puml` e renderize de novo, no mesmo commit que mudou o contrato.

## Renderizar e visualizar

Arquivos `.mmd` usam Mermaid e podem ser visualizados por GitHub e editores com
preview Mermaid. A fonte permanece no repositório e é o artefato editável.

Os arquivos `.puml` têm SVG versionado ao lado. Para renderizá-los:

Não há PlantUML, Java ou Graphviz nesta máquina, e instalar ferramenta de sistema é do usuário ([AGENTS.md](../../AGENTS.md)). A renderização usa o servidor público de <https://plantuml.com/>:

```sh
node scripts/render-diagrams.mjs         # grava os .svg
node scripts/render-diagrams.mjs --urls   # só imprime as URLs, sem acessar a rede
```

Isso **envia a fonte do diagrama para um servidor público**. Vale para estes dois, que descrevem o contrato e não têm segredo nem dado real de cliente. Não vale para diagrama que descreva dado de cliente ([AGENTS.md](../../AGENTS.md)).

`--urls` imprime também a URL `/uml/`, que abre o diagrama no editor do próprio site para experimentar uma mudança antes de escrevê-la no arquivo.

## O que ainda não está desenhado

- **Modelo entidade-relacionamento das tabelas:** pertence a P1-02, junto com o schema. Tabela não é objeto: chave, índice e escala do `NUMERIC` só existem depois do schema.
- **Sequência de uma carga e de uma conferência:** faz sentido depois de P1-03, quando houver comportamento a descrever em vez de intenção.
- **Implantação e observabilidade:** [ADR-005](../decisions/ADR-005-observabilidade.md) adiou a implementação para depois do marco `parte-1`.
