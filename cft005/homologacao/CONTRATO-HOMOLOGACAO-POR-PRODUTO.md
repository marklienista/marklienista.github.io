# CFT-005 — Contrato de homologação por produto, versão 1

**Atualização — 29/10/2026, 09:36 BRT:** nova rodada em dois perfis: 52 controles HTTP PostgreSQL PASS e preservação manual dos quatro registros (revisões 3 → 4 somente na escrita própria). H03/H04/H07/H09 completos PASS, somados a H01/H02: **6 PASS, 0 FAIL, 18 BLOCKED**. [Resultado e limites](./H03-H13-RESULTADO.md). H05/H06/H08/H10–H13 ainda exigem complementos técnicos; o runner não comprova esses gates inteiros. Rede novamente fechada, health 503 esperado. Sem mudança executável/deploy. Próximo passo único: instrumentar/completar os sete gates técnicos restantes do bloco, sem repetir estes cliques manuais. CFT-005 ABERTO; os adendos abaixo são históricos.

**Estado atual — 29/10/2026:** H01/H02 PASS por execução manual em dois perfis U1/U2, com persistência após recarga e reabertura, intervalo aproximado de 11 minutos. Contrato: **2 PASS, 0 FAIL, 22 BLOCKED**. [Evidências e limites](./H01-H02-RESULTADO.md). Contadores corroboram quatro logins; B inclui um início extra sem callback. Rede temporária novamente fechada. A observação manual autorizada supre a indisponibilidade de controle do segundo perfil; não é atestação automatizada. A regra histórica de manter BLOCKED quando não há observação não impede registrar a execução humana efetivamente relatada. Próximo passo único: H03–H13 com nova baseline nos dois perfis. CFT-005 ABERTO. Os adendos abaixo preservam os estados anteriores.

**Adendo atual — 29/10/2026:** [integração BFF/PostgreSQL comprovada](./INTEGRACAO-BFF-BANCO.md): 52 controles HTTP reais PASS com U1/U2, quatro conferências de preservação, TLS verificado e rede temporária fechada ao término. A alternativa persistente está provada nesse escopo; o contrato completo continua BLOCKED por perfis independentes e demais dependências, inclusive coordenador/revogação/SSO. Próximo passo: H01/H02 com P1/U1 e P2/U2 separados. Os adendos e a versão 1 abaixo são históricos; não representam a situação atual de provisionamento/integração.

Adendo anterior: [integração BFF/banco preparada e bloqueio TLS real](./INTEGRACAO-BFF-BANCO.md). Credenciais exclusivas salvas; nenhum backend integrado chegou a LIVE. Alternativa externa com certificado verificável e allowlist temporária exata preparada, aguardando confirmação de rede. As declarações originais abaixo preservam o histórico v1; os 24 gates completos continuam BLOCKED.

Adendo mais recente: [banco criado, papéis exclusivos e RLS comprovados em 84 controles SQL](./BANCO-RLS-RESULTADO.md). Sem conexão dos BFFs ao banco ou homologação publicada. Declarações originais de recurso não provisionado abaixo permanecem como histórico v1.

Adendo posterior: [banco HML identificado](./ESCOLHA-BANCO-HML.md) — candidato novo Render Postgres Free, My Workspace/Virginia, ainda não provisionado. As referências abaixo a destino não escolhido descrevem a preparação original v1, preservada no commit 66828da0e0bca0bb37e232404222987e0090717d. A fronteira de segurança não mudou; a capacidade real dos papéis/grants/RLS continua BLOCKED.

28/10/2026. Branch `cft005-oidc-dominios`. Estado: **PREPARADO, execução integrada BLOCKED**. O contrato define o candidato a homologar; não registra implantação, contratação nem aprovação de produção. Sua aprovação exige os recibos reais descritos abaixo.

## Base preservada

A [matriz original](../oidc/MATRIZ-CONSOLIDADA-2026-10-28.md) permanece **9 PASS, 3 BLOCKED e 2 FAIL**. Renovação/expiração real e revogação local dos clientes isolados passaram; o primeiro BLOCKED de expiração A continua no histórico. Os BFFs já comprovaram emissão Auth0 com clientes confidenciais distintos e 44 controles reais U1/U2, mas seus registros são mapas privados em memória. Isso não comprova RLS, persistência, acesso direto aos dados ou isolamento dos aplicativos publicados.

As identidades autorizadas U1/U2 continuam as existentes, vinculadas por subject exato no ambiente protegido. O contrato e os arquivos não contêm e-mails, subjects, UUIDs reais, pseudônimos de identidade ou segredos. Não criar usuários nem redefinir senha. O `auth0` de formulário e o Google do mesmo e-mail são identidades distintas; não vinculá-las automaticamente.

## Fronteira escolhida para a homologação

O candidato é **BFF confidencial por produto, recurso persistente privado por produto e autorização de proprietário em cada operação**. Cada domínio conserva sua sessão local; a pessoa pode usar SSO no IdP comum. A identificação do produto vem da configuração imutável do servidor e do cliente OIDC validado criptograficamente, nunca de Origin, CORS, JavaScript, cabeçalho `app_id`, query, corpo, `user_metadata` ou escolha livre do navegador.

| Camada | Contrato exigido | Situação atual |
|---|---|---|
| Identidade | Authorization Code confidencial, PKCE/state/nonce, issuer fixo, JWKS, algoritmo RS256 permitido, audience, exp/nbf, escopo, subject exato e `azp` exclusivo | Comprovado nos dois BFFs de teste |
| Perfil de token | Perfil Auth0 atual com `azp`; rejeitar `client_id`/tipos ambíguos e ID Token como bearer de dados | Política existente; não alterar perfil para passar teste |
| Sessão web | Cookie opaco host-only, Secure, HttpOnly; transação descartável; escrita com CSRF. Rotas de dados rejeitam bearer do navegador | Comprovado no protótipo; persistência de sessão ainda em memória |
| Produto A | Papel de banco `cft005_hml_a`, credencial exclusiva, somente recurso A | Nome proposto; recurso/papel não provisionados |
| Produto B | Papel `cft005_hml_b`, credencial exclusiva, somente recurso B | Nome proposto; recurso/papel não provisionados |
| Proprietário | Mapeamento do principal OIDC verificado para U1/U2; contexto de transação criado pelo backend e limpo ao liberar a conexão | Adaptador persistente não implementado |
| Revogação | Registro durável de sessões/épocas somente HML, consultado em toda operação protegida, com falha fechada | Não implementado; logout local não satisfaz |

O desenho lógico é `navegador A → BFF A → recurso privado A`, e o equivalente para B. Não adicionar uma API central de dados nesta fase. Se futuramente houver API central, ela deverá autenticar também o serviço chamador com mTLS ou prova assinada vinculada à requisição, verificando serviço, cliente, produto e pessoa em conjunto; só um bearer copiado não basta. A prova local antiga de serviço assinado não atesta essa integração hospedada.

Alvos existentes permitidos para uma futura implantação do candidato: somente `cft005-bff-a-teste.onrender.com` e `cft005-bff-b-teste.onrender.com`, com os clientes confidenciais já criados. Os clientes SPA `cft005-login-a-teste.onrender.com` e `cft005-login-b-teste.onrender.com` são controles históricos separados, sem alteração nesta preparação. Destino persistente e coordenador ainda não têm ID/origem; a futura ficha de implantação deve registrar seus IDs exatos, confirmar custo zero e ausência de vínculo com produção antes de qualquer escrita. Não expandir a lista por hostname recebido de requisição ou variável não revisada.

## Dados e privilégios

O destino precisa ser um banco descartável **exclusivo de homologação**, com custo zero verificado antes de provisionar. Nenhum destino foi escolhido ou criado nesta preparação. Não usar o projeto Supabase compartilhado atual nem adicionar tabela, schema ou política nele. Se não houver capacidade gratuita isolada, manter o provisionamento BLOCKED, sem contratar ou reaproveitar dados reais.

Modelo proposto: schemas privados distintos `cft005_hml_a` e `cft005_hml_b`, uma relação `records` em cada, chave `(owner_label, record_id)`, coluna de produto fixa por constraint, valor textual sintético e revisão inteira. Cada papel de execução terá somente SELECT/INSERT/UPDATE sobre sua relação; sem DELETE, TRUNCATE, CREATE, propriedade de objetos, BYPASSRLS, superusuário ou associação que permita assumir o outro papel. Proprietário dos objetos será um papel administrativo diferente, não usado pelos BFFs. Se o serviço gratuito não permitir essa separação, avaliar bancos independentes em outro passo; não enfraquecer os privilégios para prosseguir.

RLS será habilitada e forçada. SELECT/UPDATE usarão o proprietário da transação; INSERT e UPDATE terão WITH CHECK para impedir mudança de proprietário. A política também verifica produto fixo da relação. Contexto ausente ou inválido deve negar tudo. O contexto é uma asserção do backend já autenticado, não uma credencial que o navegador possa definir. A credencial A comprometida não poderá alcançar B; dentro de A, a integridade do backend continua fazendo parte da fronteira de confiança. Queries parametrizadas, sem SQL arbitrário, e contexto SET LOCAL em transação impedem vazamento entre conexões reutilizadas. Testar o papel real de execução, sem usar dono, `postgres` ou `service_role` como prova de RLS.

| Fixture nova | Produto | Proprietário lógico | Conteúdo |
|---|---|---|---|
| HML-A-U1 | A | U1 | synthetic-A-U1-v1 |
| HML-A-U2 | A | U2 | synthetic-A-U2-v1 |
| HML-B-U1 | B | U1 | synthetic-B-U1-v1 |
| HML-B-U2 | B | U2 | synthetic-B-U2-v1 |

Os quatro registros pertencem ao novo ensaio, sem importar, copiar ou consultar linhas publicadas. Não migrar os mapas atuais nem sobrescrever os recibos anteriores. Valores novos devem usar revisão v2 apenas no próprio registro; a recusa cruzada exige releitura pelo proprietário e confirmação de valor/revisão inalterados. Ausência de permissão pode aparecer como erro SQL 42501; RLS pode filtrar silenciosamente e retornar zero linhas. Nenhum desses casos prova isolamento sem controle positivo e confirmação de que a linha alheia permaneceu intacta.

Inventariar REST, GraphQL, RPC, views, Storage e Realtime do destino. Interfaces habilitadas precisam de prova negativa real; interfaces não utilizadas precisam de verificação de indisponibilidade/ausência de grant, não de um N/A sem evidência. Nenhum acesso direto aos quatro registros por JWT Supabase compartilhado. Não expor os schemas privados via Data API, não usar função SECURITY DEFINER para superar erro, não manter EXECUTE de PUBLIC em funções que alcancem os dados. Views devem respeitar os privilégios do chamador ou ficar inacessíveis. Privilégios padrão precisam ser conferidos: não presumir que tabela nova é privada.

## Contrato de sessões e logout

Definir três operações diferentes na interface de homologação:

1. **Sair deste produto:** elimina apenas a sessão local atual; o outro produto e U2 continuam válidos. Continua sendo a operação existente.
2. **Encerrar sessões de homologação:** comando autenticado e protegido contra CSRF avança uma época durável de U1 no registro HML; A/B recusam suas sessões antigas na próxima operação protegida. U2 não muda. Nenhum token antigo pode criar nova sessão ou reduzir a época. Não chamar isso de encerramento de Auth0/Google.
3. **Sair do SSO Auth0:** fluxo OIDC separado, retorno fixo permitido e state validado, em tenant/sessão isolados dos aplicativos publicados. Não executar sobre o tenant compartilhado sem uma fronteira que preserve as sessões publicadas. Não usar logout federado Google e não interpretar ausência de senha como prova de falha ou sucesso: o Google pode conservar sua própria sessão.

A alternativa sem serviço pago é um **coordenador de revogação do conjunto HML**, não o back-channel gerenciado. Cada BFF autentica comandos ao coordenador com credencial de serviço exclusiva; a prova deve vincular método, destino, corpo, nonce de uso único, emissão e validade curta. Nenhum browser escolhe subject livremente; o comando deriva U1 da sessão autenticada e do mapeamento confiável. Estado durável e controle de replay são obrigatórios. Reiniciar o coordenador não pode apagar a revogação. Consulta indisponível nega operações protegidas; não usar cache positivo para permitir uma sessão cuja revogação é desconhecida.

O ponto de conclusão do comando é o commit durável da nova época. Toda operação protegida deve obter uma autorização linearizada no registro; escritas mantêm o bloqueio/autorização até o commit ou usam fencing validado no commit. O comando aguarda o término de operações anteriores antes de reconhecer sucesso. Operações iniciadas depois do reconhecimento não podem ler ou escrever com a época antiga. É preciso provar a ordenação em H15/H24; uma consulta à época seguida de escrita sem esse controle tem janela de corrida e falha o contrato. Indisponibilidade não pode produzir reconhecimento de sucesso. O protocolo concreto e o armazenamento ainda exigem implementação e prova; o desenho não é evidência de funcionamento.

O Auth0 documenta back-channel OIDC como recurso Enterprise. Não habilitar, contratar ou contornar essa dependência. O registro HML não pretende revogar access tokens no emissor nem refresh grants dos clientes BFF atuais, que não foram aprovados. Os testes de refresh Supabase já concluídos continuam separados. **S13 só poderá ser proposto como PASS no escopo HML quando houver prova da revogação coordenada e do encerramento SSO seguro; S13 publicado continua FAIL.**

## Perfis e execução

Usar dois perfis persistentes do navegador, P1/U1 e P2/U2, ou contextos privados comprovadamente independentes. Duas abas do mesmo perfil não satisfazem S02. Evitar abrir um cliente normal paralelo durante uma captura sem auto-refresh. Somente as identidades já autorizadas; senha fica no provedor, nunca no script, terminal ou documento. O agente inspeciona apenas rótulos e recibos sanitizados. Se o segundo contexto não puder ser controlado, manter H01/H02 e os dependentes BLOCKED; não simular separação.

Os 24 casos H01–H24 estão definidos em [plan.mjs](./plan.mjs) e detalhados no [roteiro](./ROTEIRO-TESTES.md). Eles são **novos gates integrados**, não reexecução automática dos 44 controles históricos. Uma falha de rede, tela Render indisponível, WAF ou CSRF que intercepta antes da política alvo não prova negação de produto. Primeiro fazer o controle positivo no mesmo ambiente/versão; depois alterar somente a dimensão atacada. Registrar evidência do caminho atingido sem JWT ou identificador real.

## Critérios e recibos

PASS exige todos os critérios exatos do caso, controle positivo correspondente, pré-requisitos satisfeitos e observação real da versão integrada. FAIL indica comportamento divergente observado; BLOCKED indica pré-requisito/execução faltante. Casos não executados não recebem PASS. Os 24 casos podem ser avaliados offline por `evaluate.mjs`, que somente valida forma e critérios dos recibos do executor. O avaliador **não autentica o autor nem atesta que a observação ocorreu**; documentos/snapshots sanitizados devem permitir a revisão humana.

`receipt.prepared.json` começa sem observações e com todos os pré-requisitos falsos. É modelo de preenchimento **após** prova real, não autorização ou declaração de fatos. Aceita apenas campos previstos, booleanos, contagens/status esperados, rótulos de caso, instante UTC e fonte enumerada. Não aceita texto livre, URL, corpo, cabeçalho, JWT, cookie, código OAuth, CSRF, Client Secret, senha, subject ou pseudônimo. Não colar dados brutos no modelo; sua rejeição não torna seguro gravar um segredo em disco antes da validação. Datas e rótulos de execução não são credenciais. O relatório tem sempre `publishedHomologation=NOT_GRANTED`.

Registrar screenshots somente da área sanitizada, versão implantada/hashes, resposta esperada/observada e preservação dos outros registros/sessões. Não capturar tela de senha, abas de credenciais, URL OAuth ou armazenamento do navegador. Revisão de S14 exige o grafo completo efetivamente distribuído, lock/integridade, triagem de avisos, CSP e marcador XSS inerte que chegue ao aplicativo. Um 403 do WAF mantém o caso da aplicação BLOCKED. Retenção interna desconhecida de host/IdP fica explicitamente BLOCKED; não exportar logs brutos para tentar provar ausência de segredos.

## Preservação, encerramento e próximo passo

Nenhum deploy, migração, banco, sessão central, grant OIDC, TTL, usuário, app publicado ou Apertaquem foi alterado nesta preparação. Não existe script de deploy/migração neste diretório. A limpeza futura só pode atingir os quatro IDs do novo ensaio e os novos recursos HML após conferir o destino exato; não excluir usuários, históricos ou recursos publicados. Se houver custo ou falta de fronteira isolada, parar o provisionamento correspondente e registrar BLOCKED.

S02/S11/S14 permanecem BLOCKED e S12/S13 publicados FAIL até as provas exigidas; mesmo 24 PASS em HML não autoriza uma publicação. **CFT-005 ABERTO.**

**Único próximo passo:** verificar e identificar um destino persistente gratuito exclusivo de homologação e sua capacidade de papéis separados, antes de implementar o adaptador A/B e o registro de revogação descritos neste contrato. Não alterar o projeto compartilhado para suprir a falta desse destino.

## Referências verificadas em 28/10/2026

- [Auth0 — validação de access tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens): assinatura, audience e permissões; a política exclusiva de cliente deste contrato é adicional.
- [Auth0 — camadas de logout](https://auth0.com/docs/authenticate/login/logout) e [endpoint OIDC](https://auth0.com/docs/authenticate/login/logout/log-users-out-of-auth0): sessão da aplicação, Auth0 e IdP precisam de tratamento distinto.
- [Auth0 — back-channel OIDC](https://auth0.com/docs/authenticate/login/logout/back-channel-logout): dependência Enterprise; não é a alternativa gratuita proposta.
- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api): combinar grants e políticas e testar o papel correto; avaliar todos os caminhos habilitados.
- [PostgreSQL — row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): dono/BYPASSRLS e privilégios sobre a tabela inteira exigem tratamento próprio.
- [Changelog Supabase](https://supabase.com/changelog): índice consultado. [TLS CBC](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) anuncia mudança a partir de 10/11/2026; exigir TLS moderno, sem alterar serviço agora. [PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) exige conferir a versão/extensões do futuro destino; não se executaram detecções em banco real.
