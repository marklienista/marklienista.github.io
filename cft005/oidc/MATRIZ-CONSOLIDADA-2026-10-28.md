# CFT-005 — Matriz consolidada, 28/10/2026

## Adendo de 29/10/2026 — alternativa persistente por produto

| Escopo | Estado | Evidência e limite |
|---|---|---|
| BFF A/U1, B/U1, A/U2, B/U2 com PostgreSQL real | PASS | 13 controles em cada combinação, 52/52: próprias 200, outro usuário 404 com caminho SQL/RLS, outro produto 403, JWT estrangeiro 401 após assinatura/azp, corpo owner/product 400 e releitura própria. |
| Preservação por proprietário autenticado | PASS | Quatro conferências: U2 continua revisão 2 após U1; U1 confirma revisão 3 esperada após sua única escrita própria e tentativas U2. U2 confirma suas escritas próprias na revisão 3. |
| Transporte verificado e fechamento da janela | PASS | A/B LIVE com health postgres 200; endpoint externo fixo com TLS/certificado/hostname validados. Só duas redes regionais compartilhadas autorizadas. Ambas removidas ao fim; API vazia/painel bloqueado, health 503 esperado. Não é sonda TCP independente. |
| H01–H24 completos | BLOCKED | Um único perfil Chrome com alternância U1/U2; faltam perfis independentes, coordenador durável, revogação/corrida/SSO e demais critérios integrais. Subcontroles PASS não removem dependências. |
| S01–S14 originais | 9 PASS / 3 BLOCKED / 2 FAIL | Estados da tabela original abaixo preservados. S12/S13 publicados continuam FAIL; não houve mudança em produção ou Apertaquem. |

[Relatório atual](../homologacao/INTEGRACAO-BFF-BANCO.md), [recibos/releituras/rede/hashes](../homologacao/postgres-http-real-evidence.json) e [corroboração pública dos mesmos recibos](../homologacao/postgres-http-server-receipts.json). As tabelas BFF/SPA históricas abaixo mantêm seus escopos. **CFT-005 ABERTO. Único próximo passo: H01/H02 em perfis persistentes independentes P1/U1 e P2/U2.**

**CFT-005 ABERTO.** A prova dos backends confidenciais usa apenas U1/U2 e registros sintéticos próprios, em serviços novos. Não homologa os aplicativos publicados nem substitui os casos de dados/armazenamento dos clientes SPA/Supabase originais. A indisponibilidade da identidade U2 do formulário foi superada na prova BFF: a identidade Google já autorizada foi localizada no painel Auth0 por filtro exato, seu subject distinto foi confirmado e configurado somente nos ambientes protegidos de teste. Não houve vínculo por e-mail, criação de conta ou redefinição de senha. Autorização continua exigindo assinatura, issuer, audience, subject exato, azp e escopo.

## Prova isolada dos backends A/B

| Caso | Resultado | Evidência e limite |
|---|---|---|
| Emissão Auth0 real A/B, U1 | PASS | Troca confidencial e sessão verificadas; nova rodada executada pelo Chrome externo conectado. Nenhuma credencial digitada ou lida pelo agente. |
| JWT real A→B e B→A | PASS | HTTP 401 após assinatura e vínculo do outro cliente, para leitura/escrita. Cada prova completa passou 11/11; a sonda remota não acessa registros. |
| Dados próprios e rótulo alheio | PASS | Dados sintéticos próprios: 200; outro rótulo: 404; outro produto: 403; registro alheio inalterado. Não substitui login positivo U2. |
| Duas identidades positivas U1/U2 | PASS | U2/A e U2/B 11/11 às 15:13 BRT; U1/A e U1/B 11/11 após os testes U2. Quatro combinações, 44 controles PASS, incluindo bloqueio recíproco de leitura/escrita e preservação do registro alheio. Mesmo perfil Chrome, reautenticação explícita sem logout global. |
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

Evidência da nova prova: [duas identidades reais, 44 controles](../oidc-backends/two-user-real-evidence.json). A recusa U2 histórica foi preservada; não foi convertida retroativamente em PASS.

## S01–S14 dos clientes SPA/Supabase originais

Rodada executada pelo agente no Chrome externo em 28/10, 14:41–14:54 BRT, somente nas duas origens SPA de teste. Código preparado em c6b6ba2 e corrigido/implantado em 5a54b40; nenhuma alteração nos produtos publicados. [Eventos sanitizados](./refresh-real-evidence.json). Tempos são observações da interface, sem inspeção de credenciais. A igualdade do UUID validado por getUser foi comparada por pseudônimo em memória; somente o booleano foi persistido.

| Caso | Estado | Limite atual |
|---|---|---|
| S01 A→B, senha e UUID Supabase | PASS | A/B autenticados U1 sem digitar nova senha; mesma identidade validada no servidor e comparada em memória. |
| S02 dois usuários/perfis | BLOCKED | U2 entrou e renovou em B, com identidade diferente de U1 de A. Variante em perfis privados separados não executada; as provas de dados com ambas as identidades passaram nos BFFs. |
| S03 renovação manual A | PASS | 14:41:25.461 BRT e repetição na versão final 14:54:35.973: access/refresh mudaram; getUser confirmou mesma pessoa. Renovação B também PASS às 14:44:25.775. |
| S04 B após renovar A | PASS | Recarga B manteve identidade verificada às 14:44:16.798. A também continuou após renovação B. Nenhum novo login nessas recargas. |
| S05 logout A preserva B | PASS | A sem sessão às 14:53:37; B recarregado ainda verificado às 14:53:41. scope:local no SDK. |
| S06 sair também de B | PASS | B sem sessão às 14:53:46. A reentrou depois sem senha, compatível com sessão central preservada; não é revogação. |
| S07 reentrada Auth0 | PASS | 14:54:24: A verificado com mesma identidade, sem entrada de senha após logout local de ambos. |
| S08 cancelamento/retorno/PKCE | PASS | PKCE real adulterado A/B: HTTP 400 bad_code_verifier, sem sessão inesperada e sem tocar a sessão principal. B sem sessão após abandonar a tela Auth0 antes de autenticar; reentrada sem senha recuperou U1. Retorno duplicado e access_denied sintéticos recusados com URL limpa e sem reflexão. Não foi uma recusa real emitida pelo provedor. |
| S09 expiração/refresh inválido | PASS | B venceu naturalmente às 16:29:13 BRT; às 16:30:29.920, acesso antigo recusado com 403/bad_jwt e sinal de expiração, refresh real renovou e preservou identidade, trocando ambas as credenciais. Revogação local do refresh emitido A às 16:07:45.919 e B às 16:36:04.843: HTTP 400 esperado, sessão ausente; reentrada U1 sem senha PASS. A permaneceu verificado por recarga sem novo login após renovação e revogação B. Primeira classificação A BLOCKED preservada. TTL/relógio intactos; sem equivalência com logout central. |
| S10 persistência por origem | PASS | Recargas A/B após renovação e deploy mantiveram identidade sem login. Logout independente corrobora sessões por origem; não houve leitura de localStorage pelo agente nem reinício completo do Chrome. |
| S11 leitura/escrita U1/U2 | BLOCKED | PASS no recurso sintético BFF: ambas as identidades reais, 44 controles e dados alheios inalterados. SPAs originais não têm recurso de dados sintéticos provisionado; RLS/dados existentes não foram consultados nem homologados por essa prova alternativa. |
| S12 isolamento por produto publicado | FAIL | Mesmo usuário no modelo compartilhado Supabase continua sem fronteira comprovada por produto. Protótipo BFF prova uma alternativa isolada, sem integração aos dados publicados. |
| S13 logout central/revogação | FAIL | Não implementado/homologado. Logout local e reentrada sem senha não constituem revogação central. |
| S14 dependência/CSP/XSS/URLs/logs | BLOCKED | 22 arquivos/headers PASS; nove versões de pacotes sem aviso conhecido na consulta npm. Código sem sinks HTML executáveis/credenciais literais nos dez módulos revisados; startup BFF só mensagens fixas. HTML negativo bloqueado pelo WAF, sem executar app. Grafo transitivo completo do SDK e retenção interna do provedor não atestados. Render documenta ausência de emissão de logs para sites estáticos. |

## Correções e validação

Rodada posterior: controlador de expiração em b3f3643; reautenticação opcional BFF em 89a6790, preservando o fluxo normal sem prompt; PKCE negativo em 314f72a, adaptador JSON corrigido em 82bd23b; interrupção opcional SPA em ecb76c5. As duas primeiras tentativas PKCE BLOCKED continuam na evidência, inclusive a repetição que ainda carregou a implantação antiga durante falha temporária de conexão Render→GitHub. Não promover rejeição local do SDK a prova de verificador recusado no servidor. A/B corrigidos receberam bad_code_verifier HTTP 400, sem sessão inesperada.

SPAs: instrumentação somente de booleanos, identidade pseudonimizada, rejeição de mudança de pessoa e limpeza precoce do callback em c6b6ba2; correção do sentinela de refresh em 5a54b40. Deploys A dep-dbh3clifngtc73f9lreg e B dep-dbh3cmo8v5cc73ea5890 LIVE, dez arquivos HTTP 200 idênticos à branch. Somente esses sites receberam cabeçalhos de proteção. Nenhuma configuração Auth0/Supabase, TTL, registro real ou produto publicado foi alterado. Código BFF b083920 preservado.

Suítes Node dos clientes e sondas: **35/35 PASS**, zero falhas, incluindo rejeição de 403 genérico, revogação local de sessão emitida e proteção contra revogar uma sessão alterada após captura. BFF: 51 cenários PASS (52 testes incluindo o agrupador), repetidos após preparar reautenticação explícita; contrato local backend 91/91 preservado. Fixtures e emissão/renovação real permanecem evidências distintas. A sonda fictícia permanece separada do novo teste de refresh efetivamente emitido. Recursos modificados: somente sites SPA de teste e mapeamento U2/reautenticação dos BFFs de teste. Nenhum registro publicado consultado. [Eventos de navegador](./remaining-browser-evidence.json), [ciclo natural](./lifecycle-real-evidence.json) e [revisão de segurança](./security-review-evidence.json).

Após recusa natural 403, controlador corrigido em aa8da0a; mensagem da interface não promove resultado inconclusivo a sucesso e modo exclusivo permite testar revogação local separadamente. Arquivos inicialmente misturados pelo cache foram recusados no gate de publicação; versão pública 20261028b, commit f0e9ed3, conferida em seis respostas antes de iniciar os novos testes. Deploys A dep-dbh4f1u7bikc73eo576g e B dep-dbh4f2sipgvc73doj3qg LIVE. Nenhuma inferência sobre expiração a partir da revogação local.

Resultado final permitido desta rodada, 16:37 BRT: **9 PASS, 3 BLOCKED e 2 FAIL** na matriz S01–S14. Expiração/renovação B, revogação local A/B, recuperação U1 e continuidade A passaram em navegador real. As tentativas iniciais BLOCKED foram preservadas. Os 44 controles reais U1/U2 dos BFFs e os 35 testes locais dos clientes/sondas continuam separados da homologação publicada. Evidências finais em lifecycle-real-evidence.json e remaining-browser-evidence.json; nenhuma nova repetição está prevista.

Preparação posterior, sem alteração dos estados acima: [contrato de homologação por produto v1](../homologacao/CONTRATO-HOMOLOGACAO-POR-PRODUTO.md), [roteiro de 24 casos](../homologacao/ROTEIRO-TESTES.md) e [evidência da preparação](../homologacao/preparation-evidence.json). O novo conjunto começa 0 PASS, 0 FAIL, 24 BLOCKED; quatro fixtures novas estão definidas, mas não foram gravadas em banco. Avaliador de recibos 22/22 PASS, sem rede ou integração real. Nenhum deploy, recurso de banco, alteração Auth0, dado real ou produto publicado nesta etapa.

Banco identificado em etapa posterior: [novo Render Postgres Free exclusivo](../homologacao/ESCOLHA-BANCO-HML.md), My Workspace/Virginia, nome proposto cft005-hml-db-teste, PostgreSQL 17, 1 GB. Inventário de zero Postgres e região A/B conferidos; sem criação ou SQL. [Evidência de identificação](../homologacao/database-selection-evidence.json). Gratuidade temporária: expiração em 30 dias após criação. Papéis separados, grants/RLS e rede ainda BLOCKED, sem promover casos integrados ou publicados.

Resultado posterior: [banco novo criado e 84 controles SQL reais PASS](../homologacao/BANCO-RLS-RESULTADO.md), ID dpg-dbh8tghsrm7s73f4tc9g-a, Free/Virginia. Logins A/B exclusivos, RLS forçada, bloqueios por produto/proprietário, quatro registros íntegros e acesso externo fechado. [Recibo SQL](../homologacao/database-real-evidence.json). Sem adaptador HTTP/identidade ou coordenador: não altera a matriz original nem promove os 24 casos integrados. Expira em 27/11/2026 às 21:09 BRT; nenhuma alteração publicada.

**Único próximo passo:** integrar apenas os BFFs de teste ao banco pela rede interna, com credenciais novas e exclusivas protegidas, derivando proprietário do principal OIDC validado e repetindo os controles HTTP U1/U2. S02/perfis separados, S11/dados SPA e S14 integral mantêm limites; S12/S13 publicados FAIL; CFT-005 ABERTO.
