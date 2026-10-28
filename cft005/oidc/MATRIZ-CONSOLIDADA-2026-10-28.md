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

Rodada executada pelo agente no Chrome externo em 28/10, 14:41–14:54 BRT, somente nas duas origens SPA de teste. Código preparado em c6b6ba2 e corrigido/implantado em 5a54b40; nenhuma alteração nos produtos publicados. [Eventos sanitizados](./refresh-real-evidence.json). Tempos são observações da interface, sem inspeção de credenciais. A igualdade do UUID validado por getUser foi comparada por pseudônimo em memória; somente o booleano foi persistido.

| Caso | Estado | Limite atual |
|---|---|---|
| S01 A→B, senha e UUID Supabase | PASS | A/B autenticados U1 sem digitar nova senha; mesma identidade validada no servidor e comparada em memória. |
| S02 dois usuários/perfis | BLOCKED | Falta login positivo da segunda identidade prevista. |
| S03 renovação manual A | PASS | 14:41:25.461 BRT e repetição na versão final 14:54:35.973: access/refresh mudaram; getUser confirmou mesma pessoa. Renovação B também PASS às 14:44:25.775. |
| S04 B após renovar A | PASS | Recarga B manteve identidade verificada às 14:44:16.798. A também continuou após renovação B. Nenhum novo login nessas recargas. |
| S05 logout A preserva B | PASS | A sem sessão às 14:53:37; B recarregado ainda verificado às 14:53:41. scope:local no SDK. |
| S06 sair também de B | PASS | B sem sessão às 14:53:46. A reentrou depois sem senha, compatível com sessão central preservada; não é revogação. |
| S07 reentrada Auth0 | PASS | 14:54:24: A verificado com mesma identidade, sem entrada de senha após logout local de ambos. |
| S08 cancelamento/retorno/PKCE | BLOCKED | Callback real observado sem query após limpeza precoce; fixtures PKCE PASS. Cancelamento/PKCE adulterado reais no SPA ainda não executados. Provas BFF separadas. |
| S09 expiração/refresh inválido | BLOCKED | Parte refresh fictício PASS: A/B HTTP 400 esperado, sessão principal preservada. Primeira sonda de formato BLOCKED preservada e corrigida. Expiração natural do access token e refresh real revogado não exercitados; TTL intacto. |
| S10 persistência por origem | PASS | Recargas A/B após renovação e deploy mantiveram identidade sem login. Logout independente corrobora sessões por origem; não houve leitura de localStorage pelo agente nem reinício completo do Chrome. |
| S11 leitura/escrita U1/U2 | BLOCKED | Dados negativos sintéticos U1 passaram; duas identidades positivas não comprovadas. |
| S12 isolamento por produto publicado | FAIL | Mesmo usuário no modelo compartilhado Supabase continua sem fronteira comprovada por produto. Protótipo BFF prova uma alternativa isolada, sem integração aos dados publicados. |
| S13 logout central/revogação | FAIL | Não implementado/homologado. Logout local e reentrada sem senha não constituem revogação central. |
| S14 dependência/CSP/XSS/URLs/logs | BLOCKED | SDK 2.117.2/SRI conferido, dez arquivos e cabeçalhos HTTP PASS, limpeza antes do SDK e erros sanitizados implantados nos SPAs. Não é revisão XSS integral nem prova de retenção interna do host/provedor. |

## Correções e validação

SPAs: instrumentação somente de booleanos, identidade pseudonimizada, rejeição de mudança de pessoa e limpeza precoce do callback em c6b6ba2; correção do sentinela de refresh em 5a54b40. Deploys A dep-dbh3clifngtc73f9lreg e B dep-dbh3cmo8v5cc73ea5890 LIVE, dez arquivos HTTP 200 idênticos à branch. Somente esses sites receberam cabeçalhos de proteção. Nenhuma configuração Auth0/Supabase, TTL, registro real ou produto publicado foi alterado. Código BFF b083920 preservado.

Duas suítes Node originais repetidas: **27/27 PASS**, zero falhas. BFF 51/51 e contrato local backend 91/91 preservados da rodada anterior, sem nova alteração nesses executáveis. Fixtures e emissão/renovação real permanecem evidências distintas. A sonda corrigida não usa refresh emitido, não revoga sessão e não prova logout central. Nenhum registro de aplicativo foi consultado nesta rodada.

**Único próximo passo:** executar um ensaio isolado do ciclo de validade de um token realmente emitido, incluindo recuperação após falha de renovação, sem mudar TTL global ou revogar sessões de produtos publicados. Expiração natural e refresh inválido emitido continuam sem comprovação. U2 permanece BLOCKED; S12/S13 publicados FAIL; CFT-005 ABERTO.
