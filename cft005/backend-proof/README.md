# CFT-005 — Prova isolada de autorização por produto no backend

**PASS na prova local: 91/91 cenários HTTP. CFT-005 continua ABERTO.**

Executada em 26/10/2026, 15:35 BRT (18:35 UTC), com Node v24.19.0 e jose 6.2.13. Há duas pessoas fictícias U1/U2, dois produtos A/B e quatro registros exclusivamente em memória. O servidor foi aberto em `127.0.0.1` numa porta aleatória e encerrado antes da gravação da evidência. Nenhum aplicativo publicado foi alterado; não houve conexão com Auth0, Supabase, Render, banco ou conta real.

## O que foi implementado

- `gateway.mjs`: API HTTP com verificação real de duas assinaturas ES256 por `jose`. Uma identifica a pessoa e o cliente autorizado; a outra prova posse da chave privada do backend A ou B. A API recebe somente chaves públicas e mapeamentos fixos de confiança. Não possui rota para registrar chaves, emitir tokens ou escolher produtos a partir de um JWT genérico.
- A assinatura da chamada vincula método, destino configurado no servidor, hash do corpo e hash do access token, além de audience, prazo curto e nonce de uso único. A verificação de replay é atômica dentro desse processo. Mudar requisição, token ou destino invalida a chamada.
- Produto é derivado do mapeamento backend autenticado→cliente→produto. Proprietário vem do subject verificado e de mapeamento explícito. A rota é um recurso solicitado, não fonte de autoridade. Origin, CORS, cabeçalhos de aplicativo/usuário e conteúdo do navegador não concedem acesso.
- Registros ficam privados numa closure da API. GET/PUT exigem, juntos, produto e pessoa correspondentes, além do escopo da operação. Não há rota genérica de dados; escritas não podem trocar proprietário ou produto.
- `fixtures.mjs`: emissor e chamadores inteiramente sintéticos, com chaves novas não exportáveis por execução. Chaves privadas e JWTs existem somente em memória; não são gravados ou impressos. O assinador de fixtures não faz parte de um servidor de login.
- `proof.test.mjs`: chamadas HTTP reais usando `node:http` e verificação dos códigos de resposta, conteúdo sintético e preservação dos registros. Não substitui assinatura ou autorização por mocks. Erros HTTP contêm apenas códigos fixos; o arquivo de evidências contém somente campos permitidos, status, rótulos sintéticos e hashes dos fontes.

Este experimento usa um perfil de token **sintético**, com `typ=at+jwt` e `azp`, e uma assertion de serviço experimental `cft005-service+jwt`. Não é um servidor OAuth, implementação do padrão DPoP, cliente Auth0 pronto ou biblioteca de autenticação para produção. O formato e a validação devem ser adequados ao perfil real do emissor antes de integrar.

## Resultados comprovados

| Cenários | Verificação | Resultado observado |
|---|---|---|
| P01–P12 | Ler, escrever e reler dados próprios U1/U2 em A/B | 12 PASS; HTTP 200 e valores esperados |
| P13–P20 | Leitura e escrita de outra pessoa, nos dois produtos | 8 PASS; HTTP 404, sem conteúdo do registro |
| P21–P28 | Mesmo usuário entre produtos, token copiado A↔B e ID cruzado | 8 PASS; HTTP 403/404 |
| P29–P33 | Bearer sem backend, backend sem pessoa, chave falsa/desconhecida ou rebatizada | 5 PASS; HTTP 401 |
| P34–P47 | Assinatura, issuer, audience, prazo, subject, tipo, key ID, JWKS e JWT Supabase genérico | 14 PASS; HTTP 401 |
| P48–P51 | Cliente não permitido, perfil ambíguo e escopo insuficiente | 4 PASS; HTTP 403 |
| P52–P64 | Assinatura de serviço com claims, prazo, nonce, método, destino ou hashes inválidos | 13 PASS; HTTP 401 |
| P65–P72 | Replay sequencial/simultâneo, corpo/token adulterados, alg none e JWT malformado | 8 PASS; uma única aceitação no replay simultâneo |
| P73–P80 | Origin ausente/forjado e cabeçalhos falsos de produto/usuário/proxy | 8 PASS; acesso próprio 200, cruzado 403 |
| P81–P87 | Produto/proprietário no corpo, acesso direto, JSON inválido/excedente e Host forjado | 7 PASS; HTTP 400/401/404/413 |
| P88–P91 | Integridade dos quatro registros após todas as escritas negadas | 4 PASS; valores legítimos preservados |

O Node informa 92 testes PASS porque inclui o teste que contém os 91 cenários. [evidence.json](./evidence.json) registra os 91 casos, os hashes SHA-256 dos fontes em UTF-8/LF e `serverClosed=true`. Não contém tokens, códigos OAuth, provas assinadas ou material privado.

As duas suítes OIDC anteriores também foram repetidas: 22/22 PASS. Auditoria npm da única dependência de produção retornou zero vulnerabilidades conhecidas em todas as severidades nesta consulta; isso não é prova de ausência de falhas. A versão e a integridade de jose estão fixadas em `package.json` e `pnpm-lock.yaml`. Instalação feita com scripts desativados.

Na primeira execução, 90/91 cenários passaram. O cenário de Host falhou porque `fetch` substituía o cabeçalho antes de transmiti-lo. O cliente de teste foi corrigido para `node:http`; o Host adulterado passou a chegar efetivamente à API e foi rejeitado com 400. O resultado final foi repetido após acrescentar verificação de erros sanitizados e do encerramento do servidor.

## Reproduzir sem infraestrutura externa

Na pasta desta prova, com Node e pnpm disponíveis:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
node --test proof.test.mjs
```

Depois da instalação, a execução usa somente loopback. Não lê `.env`, configuração pública dos clientes, credenciais do computador ou bancos. O processo termina e todos os dados/chaves de fixtures deixam de existir; apenas a evidência sanitizada é salva. Não publicar a pasta como serviço e não usar o emissor de fixtures como autenticação real.

## Limites e status da matriz original

| Requisito | Prova isolada desta pasta | Sistema A/B existente |
|---|---|---|
| Separação de pessoas (S02/S11, parte backend) | PASS com identidades assinadas e dados sintéticos | BLOCKED para duas contas reais de teste e navegador |
| Separação de produtos (S12) | PASS para as fronteiras desta API local | FAIL: o acesso direto compartilhado existente não foi substituído |
| Sessões, refresh e navegador (S01, S03–S10) | Fora do escopo desta API | Status anterior preservado; sem homologação real nova |
| Logout central (S13) | Não implementado nesta prova | FAIL anterior preservado |
| Segurança operacional (S14) | Assinaturas, entradas, replay e respostas cobertos localmente | Sem homologação de hospedagem, logs e navegador |

Não foram implementados Universal Login, troca de código OIDC com credencial de backend, state/nonce/PKCE do fluxo real, cookies, CSRF, TLS, rotação/JWKS reais, revogação/sessões do provedor, armazenamento durável ou papéis mínimos de banco. O cache de replay é local ao processo, não distribuído. Assinaturas de requisição não impedem corrida com prova ainda não usada que tenha sido roubada; TLS e proteção das chaves continuam necessários. Os chamadores são dois principais criptográficos num harness de teste, não dois BFFs hospedados em processos/domínios distintos.

Não há prova sobre RLS, RPC, views, Storage ou Realtime do projeto atual. O desaparecimento de uma rota de dados desta API não demonstra fechamento das rotas existentes. Um backend com `service_role` amplo ou que aceite produto escolhido livremente pelo frontend continuaria inadequado.

**Único próximo passo:** integrar este contrato a dois backends de teste com clientes OIDC confidenciais distintos no mesmo IdP e recursos sintéticos privados, comprovando emissão real, ausência de bypass e a matriz S01–S14 no navegador. Preservar os aplicativos publicados. Só então reavaliar o gate S12 do sistema real.

Fontes: [jose](https://github.com/panva/jose), [JWT BCP / RFC 8725](https://www.rfc-editor.org/rfc/rfc8725), [Auth0: clientes confidenciais](https://auth0.com/docs/get-started/applications/confidential-and-public-applications), [Auth0: validação de access tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens). O padrão [DPoP / RFC 9449](https://www.rfc-editor.org/rfc/rfc9449) foi consultado para distinguir a prova de um protocolo padronizado; não declarar conformidade com ele.
