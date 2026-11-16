# Aurora — Auditoria técnica preliminar

Data: 2026-11-15  
Escopo: leitura estática da branch `hardening/atomic-offline-performance`, inspeção read-only do schema/RLS e advisors do Supabase.  
Status: diagnóstico preliminar; não equivale a homologação funcional nem auditoria de segurança independente.

## Proteção de produção

- A branch `main` não foi alterada.
- Nenhuma migration foi aplicada.
- Nenhum registro foi inserido, atualizado ou excluído.
- O schema atual de produção ainda não contém `transactions.source_key`; a migration desta branch não está implantada.
- A tabela `card_debt_installments` contém 13 registros no momento da inspeção: 11 Nubank e 2 Mercado Pago, todos pendentes.
- Foi encontrada 1 transação legada que corresponde ao padrão de projeção de cartão. A migration prevê backfill para ela.

## O que foi validado

- GitHub Actions run `43777622490`: conclusão `success`.
- O job executou verificações de sintaxe dos scripts inline, `debt.js`, `sw.js` e parse do manifesto.
- RLS está habilitada em `transactions`, `card_debt_installments` e `app_change_requests`.
- As policies lidas para transações e parcelas restringem acesso por `auth.uid() = user_id`.
- As RPCs de fluxo existentes usam `SECURITY INVOKER`.
- Não foi executado teste de navegador, integração, concorrência ou migração em banco isolado.

## Achados prioritários

### P0 — Migração ainda não homologada

A nova implementação de dívidas chama RPCs que dependem de `transactions.source_key` e de funções SQL criadas pela migration `20261115235900_atomic_card_debt_operations.sql`. A coluna e as funções ainda não existem em produção. Publicar o JavaScript sem a migration compatível fará operações falharem.

A migration precisa ser testada em banco descartável antes de qualquer execução em produção. Validar também grants, RLS, rollback e os dados legados.

### P0 — Operações offline incompletas

A fila offline atual cobre a criação de lançamentos do fluxo principal. Edição, exclusão e alteração de status não entram na fila. O módulo de dívidas também não possui fila offline para CRUD, pagamento ou reordenação.

Portanto, não anunciar “CRUD offline” nem “offline completo”. O comportamento deve ser explicitamente limitado até que todas as operações tenham estratégia idempotente, resolução de conflitos e sincronização testada.

### P0 — Service worker pode remover caches alheios

No evento `activate`, o código exclui toda chave de Cache Storage cujo nome seja diferente de `aurora-cache-v48`. Cache Storage é compartilhado por origem, não isolado pelo escopo do service worker. Em `sauloobarboza.github.io`, isso pode apagar caches de outros PWAs/projetos publicados na mesma origem.

Corrigir a limpeza para remover somente caches com prefixo exclusivo do Aurora e manter estratégia de migração/rollback de versões.

### P1 — Importação CSV pode colidir compras legítimas

A chave de idempotência CSV é calculada a partir do cartão, conteúdo da linha e número da parcela. Duas compras legítimas com todos os campos idênticos podem produzir a mesma chave e uma delas ser descartada como duplicada.

A chave precisa priorizar identificador estável do banco (quando existir) e tratar linhas realmente idênticas sem confundir duplicidade de reimportação com compras distintas. Criar fixtures de CSV realistas e testes de reimportação, linhas duplicadas, mudança de ordem e colunas.

### P1 — Validações nulas incompletas na RPC de sincronização

A função `sync_card_debt_projection` não rejeita explicitamente `p_card IS NULL` nem `p_month IS NULL`. A expressão `p_card NOT IN (...)` resulta em NULL quando o argumento é NULL; em PL/pgSQL, um IF NULL não entra no bloco. Adicionar validações explícitas antes de consultar ou excluir a projeção.

Na mesma função, `min(i.due_date)` considera todas as parcelas do mês, inclusive pendentes, enquanto o total soma somente as pagas. Definir e testar qual data deve representar a projeção; se for a data de uma parcela paga, filtrar o MIN por status pago.

### P1 — Histórico de transações sem paginação

`loadEntries` consulta todo o histórico em uma única requisição. O limite máximo de linhas do PostgREST/Supabase pode truncar históricos extensos. Implementar paginação determinística (ou outra estratégia comprovada) e testar acima do limite configurado, preservando o saldo acumulado desde o saldo inicial.

### P1 — Proteção contra senhas comprometidas desativada

O Supabase Security Advisor reporta `auth_leaked_password_protection` como WARN. Avaliar e habilitar a proteção contra senhas vazadas nas configurações de Auth, após validar impacto no fluxo de cadastro/alteração de senha.

### P2 — Alertas de performance do Supabase

O advisor aponta:
- FK `app_change_requests_user_id_fkey` sem índice de cobertura.
- Índices reportados como não utilizados: `transactions_user_date_idx`, `transactions_series_idx` e `card_debt_installments_user_due_sort_idx`.

Não remover índices automaticamente. Conferir planos de execução, carga real e uso antes de qualquer alteração.

### P1 — Ícone maskable não é independente

`icon-maskable-512.png` tem o mesmo blob que `icon-512.png`. O manifesto declara propósito maskable, mas não existe arte própria com safe zone comprovada. Criar/validar arte maskable separada e conferir dimensões reais dos PNGs.

## Plano de correção

1. Criar banco de homologação descartável e testar migration sem tocar produção.
2. Corrigir isolamento de caches do service worker.
3. Corrigir validações e semântica temporal das RPCs de projeção.
4. Corrigir estratégia de idempotência CSV com arquivos de teste.
5. Implementar paginação do histórico e provar saldo acumulado.
6. Definir escopo offline honesto; depois implementar fila completa com idempotência, retry, conflitos e testes.
7. Executar testes de integração para create/edit/delete/pay/reorder/import e falhas parciais.
8. Fazer homologação visual e funcional em Android, desktop, temas claro/escuro e rede offline/instável.

## Critério de publicação

Não fazer merge nem aplicar migration em produção até:
- backup/exportação verificável;
- migration validada em banco isolado;
- testes de integração aprovados;
- verificação de RLS/grants;
- teste de regressão dos cálculos;
- teste offline/online e atualização do service worker;
- aprovação explícita do proprietário para a publicação.
