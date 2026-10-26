# CFT-005 — Continuidade Windows, 26/10/2026

**CFT-005 ABERTO. Isolamento por produto FAIL; prova integrada BLOCKED.**

Branch `cft005-oidc-dominios` sincronizada a partir de `043324c004d7bc99bc6b158457325ffec9cf4a7c`, em checkout separado. O checkout anterior e os aplicativos em uso foram preservados.

## Evidências desta rodada

- Node v24.19.0: duas suítes executadas antes da alteração, 9+10 = 19/19 PASS. Três regressões adicionais falharam antes da correção; depois, 11+11 = 22/22 PASS, zero falhas. São contratos e interface simulados; não usam Auth0 nem banco reais.
- Comando: `node --test cft005/oidc/identity.test.mjs cft005/oidc/session-contract.test.mjs`. Sintaxe de app.mjs e identity.mjs e `git diff --check`: PASS.
- GET público de A e B: HTTP 200, 2.168 bytes cada, mesmo SHA-384 `p1oC4ter+Ex48Hw9sOysHIy+I3ROMTCJm51BmJ4TSZScngjHR7IbSlzu9AJmy2fn`; botão de refresh presente. Isso prova disponibilidade do HTML, não autenticação, independência ou refresh. Nenhum request autenticado foi feito.
- Chrome externo disponível, porém a primeira leitura foi interrompida pelo mecanismo Computer Use: não conseguiu determinar a URL atual no Windows com confiança para aplicar a política. Nenhuma página de login, sessão ou dado do usuário foi lido. Sem novas ações após o bloqueio. Não usar navegador interno vazio como substituto de um perfil externo autenticado.
- Nenhuma segunda conta sintética autorizada foi identificada/verificada no contexto acessível. Não presumir que a conta anteriormente usada é sintética. S02/S11 bloqueados; não criar usuários nem consultar registros reais para contornar o bloqueio.
- SDK 2.117.2 fixado: CDN HTTP 200; bundle comparado em memória com o tarball oficial npm, cuja integridade foi verificada. SHA-384 `Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok`. Nenhum pacote instalado/executado nessa comparação.
- Public config versionado: chave do tipo publicável, não `sb_secret_`, duas callbacks. Valores da chave não foram copiados ao relatório. Corrigida afirmação desatualizada do README sobre ausência de config.json.

## Matriz consolidada S01–S14

Status se refere ao requisito real completo. PASS local ou relato histórico é explicitamente separado; não substitui execução no navegador.

| Caso | Status | Evidência e limite |
|---|---|---|
| S01 A→B, senha e UUID | BLOCKED | PASS histórico relatado pelo titular e correlação parcial de backend mantidos. Sem confirmação independente nesta rodada. |
| S02 dois usuários/perfis | BLOCKED | Segunda conta sintética não verificada e navegador indisponível. Nenhum acesso cruzado real tentado. |
| S03 renovação manual A | BLOCKED | Contrato local PASS; HTTP confirma botão publicado. Refresh real não executado. |
| S04 B após refresh de A | BLOCKED | Simulação local PASS; sessões reais não observadas. |
| S05 logout A preserva B | BLOCKED | `scope:local` e simulação PASS. Regressão de logout após erro corrigida localmente. Sem teste real. |
| S06 logout B/IdP | BLOCKED | Simulação PASS; cookie central não observado. Logout local não comprova logout Auth0. |
| S07 reentrada Auth0 | BLOCKED | Sem navegador autenticado acessível. Relato A→B não prova reentrada após logout. |
| S08 cancelamento/retorno/PKCE | BLOCKED | Validação e mensagens locais PASS, incluindo callback malformado. Cancelamento, PKCE e limpeza real da URL não observados no navegador. |
| S09 expiração/refresh inválido | BLOCKED | Contratos locais PASS, incluindo erros estruturados e recuperação do logout. Sem expiração natural ou revogação real; TTL preservado. |
| S10 persistência por origem | BLOCKED | SDK configurado e armazenamento simulado PASS. Reload e armazenamento reais não observados. |
| S11 leitura/escrita U1/U2 | BLOCKED | Sem duas contas sintéticas verificadas. Nenhuma consulta ou escrita em registros reais. SQL histórico não substitui esta prova. |
| S12 isolamento por produto | FAIL | Falha arquitetural histórica continua: token compartilhado não autoriza produto. Proposta de backend documentada, ainda sem implementação/prova. Não reconsultado dado real. |
| S13 logout central/revogação | FAIL | Fluxo central não implementado; código atual chama somente logout local. Exercício real de revogação também bloqueado. |
| S14 dependência/CSP/XSS/sigilo | BLOCKED | Revisão e correções locais PASS: SRI, textContent, mensagens fixas, retorno restrito, sem log de tokens. Homologação no navegador e política de logs do callback continuam pendentes. |

Total dos requisitos reais nesta rodada: 0 PASS, 2 FAIL, 12 BLOCKED. Isso não apaga o PASS relatado anterior de SSO nem os 22 PASS locais.

## Correções na branch, sem deploy

1. Falhas de refresh/verificação preservam o botão de logout local; uma verificação bem-sucedida permite renovar novamente. Antes, falhar no refresh podia prender credenciais locais sem ação de saída disponível.
2. Códigos e nomes estruturados do SDK são classificados independentemente da mensagem: PKCE perdido/expirado e refresh revogado recebem mensagens fixas adequadas, sem refletir detalhes privados. Erro de rede não é rotulado como revogação.
3. Callback recusa userinfo, fragmentos e parâmetros de tokens também quando retorna erro, antes da troca de código. A limpeza da URL já existente foi mantida.
4. SRI SHA-384, `crossorigin=anonymous` e `referrerpolicy=no-referrer` adicionados ao SDK fixado em ambas as páginas. CSP e uso de textContent já existentes mantidos. Isso reduz risco de alteração do CDN; não prova ausência universal de XSS.

Limites: correções não implantadas em Render; não alegar que o HTML publicado já possui SRI novo. Os clientes respondem sem cabeçalhos HTTP CSP e Referrer-Policy, embora tenham meta tags; `frame-ancestors` exigiria cabeçalho. O código de callback chega ao servidor na requisição inicial, antes da limpeza via JavaScript: a supressão em logs da hospedagem precisa ser comprovada sem exportar valores sensíveis. Não foram coletados logs de autenticação, senhas, tokens, códigos, capturas de login ou segredos.

## Único próximo passo

Executar uma prova integrada isolada de backend por produto conforme [avaliação](./AUTORIZACAO-POR-PRODUTO.md), com navegador externo controlável e duas contas sintéticas autorizadas, repetindo S01–S14 e os acessos negativos. Só essa prova pode remover o gate por produto; não iniciar migração ou declarar CFT-005 concluído.

Restrições respeitadas: sem mudança em aplicativos publicados, dados reais, usuários, TTL global, OAuth Server beta, credenciais, plano pago ou Apertaquem.
