# CFT-005 — Matriz consolidada, 28/10/2026

**CFT-005 ABERTO.** A prova dos backends confidenciais usa apenas U1/U2 e registros sintéticos próprios, em serviços novos. Não homologa os aplicativos publicados nem substitui a matriz dos clientes SPA/Supabase originais. U2 está BLOCKED porque o titular não dispõe da credencial da identidade Auth0 cadastrada; a identidade Google com o mesmo e-mail não foi adicionada por correspondência de e-mail.

## Prova isolada dos backends A/B

| Caso | Resultado | Evidência e limite |
|---|---|---|
| Emissão Auth0 real A/B, U1 | PASS | Troca confidencial e sessão verificadas; nova rodada executada pelo Chrome externo conectado. Nenhuma credencial digitada ou lida pelo agente. |
| JWT real A→B e B→A | PASS | HTTP 401 após assinatura e vínculo do outro cliente, para leitura/escrita. Cada prova completa passou 11/11; a sonda remota não acessa registros. |
| Dados próprios e rótulo alheio | PASS | Dados sintéticos próprios: 200; outro rótulo: 404; outro produto: 403; registro alheio inalterado. Não substitui login positivo U2. |
| Duas identidades positivas U1/U2 | BLOCKED | Identidade U2 prevista indisponível. Nenhuma criação, redefinição ou vinculação de conta. |
| Logout local A, continuidade B | PASS | Relato da interface A e novo recibo B sem novo login B, preservados da rodada anterior. |
| Logout local B, reentrada A sem senha | PASS | Relato humano e autenticação/recibo A 11/11; novo fluxo automático U1 também não exigiu entrada de credencial. Não comprova logout central. |
| Retornos inválidos/sem transação | PASS | 8 verificações HTTPS reais, com 400/303/401 esperados e sem cookie de sessão. |
| Interromper na tela Auth0 antes de autenticar | PASS | Relato humano: nova janela sem sessão; contadores sem novo callback/sucesso. Não foi um callback access_denied do provedor. |
| Recarregar A e fechar/reabrir a aba | PASS | Interface A/U1 observada pelo agente; prova 11/11 após reabrir, sem novo login. Não foi reinício integral do navegador dentro do prazo. |
| Vencimento local A | PASS | Às 13:48:24.214 BRT, Sem sessão local; antes, prova 11/11 às 13:46:18.252. Nenhuma nova entrada ou renovação; limite local máximo quinze minutos. |
| B continua após vencer A | PASS | B/U1 às 13:48:25.171 BRT e prova 11/11 às 13:48:30.887, sem novo login B. Contadores e recibos anteriores preservados nos dois serviços. |
| Cabeçalhos HTTP dos backends | PASS | Quatro respostas públicas, CSP restritiva, no-store, no-referrer e nosniff. Não prova ausência universal de XSS ou retenção interna dos provedores. |

O primeiro recibo A desta rodada ficou BLOCKED, com oito controles locais PASS e etapa remota não concluída. A tela B mostrava inicialização do Render. Após o serviço estar disponível, a repetição passou 11/11. O recibo bloqueado foi preservado, sem conversão retroativa para PASS.

Evidências: [sessões automáticas](../oidc-backends/browser-session-evidence.json), [cabeçalhos](../oidc-backends/http-security-headers-evidence.json), [emissão e provas anteriores](../oidc-backends/real-login-evidence.json), [reentrada](../oidc-backends/session-reentry-evidence.json), [interrupção](../oidc-backends/login-abandonment-evidence.json), [retornos inválidos](../oidc-backends/anonymous-callback-evidence.json) e [limite U2](../oidc-backends/u2-login-denial-evidence.json).

## S01–S14 dos clientes SPA/Supabase originais

Os estados abaixo mantêm o escopo original do README. As correções locais desses clientes ainda não foram implantadas nas origens antigas; a rodada atual não iniciou novo fluxo OAuth nesses clientes. PASS de BFF não vira PASS de refresh/sessão Supabase.

| Caso | Estado | Limite atual |
|---|---|---|
| S01 A→B, senha e UUID Supabase | BLOCKED | Relato histórico preservado; sem nova homologação SPA. BFF usa identidade OIDC própria. |
| S02 dois usuários/perfis | BLOCKED | Falta login positivo da segunda identidade prevista. |
| S03 renovação manual A | BLOCKED | Contrato local PASS; refresh Supabase real pendente. Backends aprovados não recebem refresh grant. |
| S04 B após renovar A | BLOCKED | Não houve refresh Supabase real. Independência BFF é uma prova separada. |
| S05 logout A preserva B | BLOCKED | PASS no BFF não exercita o SDK Supabase original. |
| S06 logout B/IdP | BLOCKED | Logout local BFF passou; sessão/fluxo central do SPA não foi homologado. |
| S07 reentrada Auth0 | BLOCKED | Reentrada BFF sem nova senha passou; fluxo SPA original permanece sem nova prova. |
| S08 cancelamento/retorno/PKCE | BLOCKED | BFF: abandono e oito barreiras reais PASS. Manipulação PKCE no navegador e callback de recusa real não testados. |
| S09 expiração/refresh inválido | BLOCKED | Vencimento local BFF não equivale a expiração JWT, revogação ou refresh Supabase inválido. TTL global preservado. |
| S10 persistência por origem | BLOCKED | Persistência BFF observada; SDK/armazenamento Supabase original não revalidado. |
| S11 leitura/escrita U1/U2 | BLOCKED | Dados negativos sintéticos U1 passaram; duas identidades positivas não comprovadas. |
| S12 isolamento por produto publicado | FAIL | Mesmo usuário no modelo compartilhado Supabase continua sem fronteira comprovada por produto. Protótipo BFF prova uma alternativa isolada, sem integração aos dados publicados. |
| S13 logout central/revogação | FAIL | Não implementado/homologado. Logout local e reentrada sem senha não constituem revogação central. |
| S14 dependência/CSP/XSS/URLs/logs | BLOCKED | Correções SPA apenas na branch; cabeçalhos BFF PASS não homologam os clientes antigos nem retenção interna do provedor/host. |

## Correções e validação

As correções de diagnóstico sem erros brutos, validação de cliente/subject e recuperação de logout permanecem na branch de testes. O código de execução BFF é o de b0839202423600018b8bd08fc364b5ab090ec899; B usa commit posterior somente de evidências, com executáveis idênticos. Nesta rodada não houve alteração de executável, configuração, TTL ou deploy.

Mantidos os resultados anteriores: 22/22 das duas suítes Node originais, 51/51 cenários do BFF e 91/91 cenários do contrato local de backend. São testes locais/fixtures, não emissões Auth0 reais. Não foram repetidos porque nenhuma implementação mudou. As novas observações de navegador e HTTP reais estão separadas nas evidências acima.

**Único próximo passo:** preparar a rodada de renovação manual real nos clientes SPA isolados de teste, conferindo a implantação da branch corrigida e o tratamento de callback/logs antes de autenticar. Aplicativos publicados, dados reais e Apertaquem preservados.
