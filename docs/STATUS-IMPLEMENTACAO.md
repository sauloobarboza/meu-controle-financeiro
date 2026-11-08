# AURORA — status da reforma

Data: 08/11/2026

## Escopo desta branch

Implementação em branch separada: `aurora/reforma-completa-2026-11`. A versão principal do GitHub Pages ainda não recebeu esta reforma.

### Implementado no código

- Navegação por telas Hoje, Meses e Ajustes.
- Captura rápida: valor obrigatório, data de hoje, situação simples e categoria padrão.
- Chips de descrições frequentes, preenchimento pelo histórico e até cinco lançamentos seguidos sem reabrir o formulário.
- Situações de tela unificadas em Pago/recebido, A pagar/a receber e Atrasado, mantendo os quatro valores legados no banco.
- Funções centrais `Calc` para cálculos de saldo e resultado mensal.
- Listas de lançamentos responsivas, edição ao tocar e pagamento em um toque.
- Recorrência e parcelamento por série, com edição/exclusão de uma ocorrência ou da ocorrência e seguintes.
- Ajustes com saldo inicial, categorias, CSV, Central de Melhorias, instalação e gestão de séries.
- Visões Mês, Ano e Acumulado; gráfico de barras e detalhamento anual por categoria/conta.
- Fila offline local com UUID, reenvio por upsert e tentativa de sincronização ao recuperar conexão.
- Painel Para revisar e resumo da semana.
- Atalhos PWA Novo gasto e Falar; cache atualizado para v14.
- RPC transacional `apply_transaction_batch` para criação/edição em lote sem gravação parcial.
- Remoção do bloco de gráficos antigos ocultos, funções de gráfico sem uso e 61 regras CSS legadas sem referência.
- Melhorias de acessibilidade: alvos de toque de 44 px, texto mínimo de 12 px, foco visível e ícones SVG consistentes para navegação.

## Banco de dados e segurança

- Adicionadas somente as colunas `transactions.series_id uuid` e `transactions.needs_review boolean not null default false`.
- Criado índice parcial para séries por usuário e data.
- Nenhuma tabela ou coluna existente foi removida ou renomeada.
- Os 109 lançamentos existentes foram preservados; nenhuma alteração em massa de status foi executada.
- As políticas RLS de SELECT, INSERT, UPDATE e DELETE de `transactions` continuam limitadas a `auth.uid() = user_id`.
- RPC usa `SECURITY INVOKER`, valida `auth.uid()`, não tem permissão de execução para anon e não faz exclusões.

## Ainda depende de validação ou configuração

1. **Notificações push agendadas:** não configuradas. Exigem chaves VAPID, Secrets no Supabase, armazenamento de subscriptions e agendamento. Não foi possível definir Secrets pelo conector disponível; não inventar ou embutir chaves no frontend.
2. **Categorias:** personalizadas por usuário no armazenamento local do aparelho; ainda não sincronizam entre dispositivos.
3. **Offline:** a fila de novos lançamentos é local e sincroniza ao voltar a rede. O histórico completo não fica disponível offline e a autenticação inicial ainda depende de uma sessão já existente.
5. **Revisão visual:** falta conferir fisicamente em 360, 390 e 768 px e verificar todos os alvos de toque e ícones.
6. **Limpeza final:** o bloco antigo de gráficos foi removido; a limpeza integral das regras CSS antigas ainda precisa de revisão para evitar remover estilos usados.

## Validação já executada

- Workflow GitHub Actions `AURORA validation`: sucesso no commit `7122d8aa3b27d9e3e169b550d01fa5d51f7984f1`.
- Verificou sintaxe do JavaScript inline, service worker e JSON do manifest.
- Edge Function v7 publicada com JWT obrigatório.
- Colunas, índice, migrações, RLS e privilégios da RPC verificados no Supabase.

**Não publicar em produção até passar o checklist ponta a ponta com conta de teste e dados fictícios.**
