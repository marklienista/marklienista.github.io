# CFT-005 — Roteiro dos gates restantes

**Atualização — 29/10/2026:** H01/H02 foram executados manualmente pelo operador e passaram no candidato BFF/PostgreSQL; [recibo e limites](H01-H02-RESULTADO.md). Restam 22 gates BLOCKED. Próximo bloco H03–H13 exige nova baseline positiva e os critérios completos de cada caso. Não reabrir a janela de rede encerrada até a rodada estar pronta. A preparação abaixo é histórica; não constitui resultado corrente.

Preparação em 28/10/2026; versão CFT005-HML-1. Todos os casos abaixo começam **BLOCKED**, sem recibo da nova integração persistente. Os resultados anteriores da matriz S01–S14 não mudam. A fonte exata dos critérios é [plan.mjs](./plan.mjs); o [contrato](./CONTRATO-HOMOLOGACAO-POR-PRODUTO.md) define a fronteira.

## Ordem de execução no ambiente isolado

1. Identificar destino novo HML gratuito, conferir ausência de dados reais, papéis separados e inventário de interfaces. Registrar apenas o rótulo/versão do ambiente; credenciais nos campos protegidos dos serviços. Banco e coordenador ainda não existem nesta preparação.
2. Implementar o adaptador persistente A/B, RLS/grants e registro durável de sessões/épocas com ordenação de escritas. Preservar mapas e recibos históricos. Conferir versão/hashes em ambos os serviços de teste antes de autenticar.
3. Abrir P1/U1 e P2/U2 em contextos independentes; entrar A/B em cada. Comparar identidade em memória e persistir só igualdade/diferença booleana. Conferir quatro controles positivos H01/H03 antes das negativas.
4. Executar H04–H13 nas quatro combinações, mudando uma dimensão por vez. Depois de toda escrita negada, reler o registro pelo proprietário para confirmar valor e revisão intactos. Não consultar registros externos aos quatro IDs HML.
5. Executar H14–H19 e H24 só depois de o registro de revogação existir. Para H18, exigir sessão/tenant SSO que não afete aplicativos publicados; se indisponível, conservar BLOCKED e continuar revisão. Não realizar logout central no tenant compartilhado nesta preparação.
6. Executar H20–H23 sobre a versão integrada. Um bloqueio pelo WAF não satisfaz o teste XSS da aplicação. Auditar configuração de retenção sem exportar logs contendo credenciais.
7. Preencher cópia local sanitizada do modelo, avaliar critérios e anexar somente relatório validado e evidências sanitizadas ao CFT-005. PASS em HML não altera automaticamente S12/S13 publicados.

## Casos preparados

| Caso | Gate | Procedimento e resultado exigido |
|---|---|---|
| H01 | S02 | P1/U1 e P2/U2, A/B: quatro sessões verificadas; perfis independentes, identidades distintas. |
| H02 | S02 | Recarregar e fechar/reabrir as quatro abas sem novo login; identidade preservada por perfil. Não exige reinício completo do navegador. |
| H03 | S11 | Criar/gravar somente as quatro fixtures HML; ler por seu proprietário; quatro leituras e quatro escritas 200 com releitura idêntica via adaptador persistente. |
| H04 | S11 | U1→U2 e U2→U1 em A/B: quatro leituras e quatro escritas 404; nenhuma divulgação nem mudança alheia. |
| H05 | S11 | Injetar proprietário/produto diferente no corpo de quatro escritas: negar sem reassociação nem linha extra. |
| H06 | S11 | Papel não dono, sem bypass: SELECT próprio visível; outro filtrado; UPDATE alheio zero; troca de dono viola WITH CHECK; linha alheia intacta. Repetir A/B e U1/U2. |
| H07 | S12 | Mesmo usuário A→B e B→A para ambos os usuários: quatro leituras e quatro escritas 403, dados intactos. |
| H08 | S12 | Usar conexão de execução A para alcançar B e vice-versa: permissão negada; SET ROLE/membership não pode elevar. Nenhuma credencial administrativa compartilhada. |
| H09 | S12 | Sonda interna usa JWT real A em B e B em A: 401 após validar assinatura e identificar cliente incompatível. Nunca exportar bearer ao executor ou ao navegador. |
| H10 | S12 | Rotas de dados recusam bearer direto do navegador e JWT Supabase compartilhado; não há conversor de produto arbitrário. Testar só os quatro registros HML. |
| H11 | S12 | Origin ausente/forjado não concede produto; manter CSRF válido e confirmar que a política de produto foi atingida. Se a checagem Origin interceptar antes, o caso continua BLOCKED; usar sonda interna sem dados que avalie a mesma política, sem enfraquecer a rota pública. |
| H12 | S11/S12 | Inventariar seis superfícies: REST, GraphQL, RPC, views, Storage, Realtime. Provar negativas nas habilitadas e indisponibilidade/grants das desabilitadas. |
| H13 | S11 | Reusar pool na sequência U1/U2; contexto só na transação, limpo após commit/rollback; dados alheios intactos. |
| H14 | S13 | Logout local A: A 401, B 200 e U2 200; não chamar logout central. |
| H15 | S13 | Revogar conjunto HML U1: reconhecer só após commit durável; cookies antigos A/B 401, U2 200; escrita concorrente ordenada, época antiga não reativa. |
| H16 | S13 | Indisponibilizar coordenador somente HML: ler/escrever protegido negado, sem cache positivo ou falso reconhecimento; limpeza local continua disponível. |
| H17 | S13 | Comandos sem assinatura, para cliente/destino errado e replay: negar; replay não afeta login novo; U2 intacto. |
| H18 | S13 | Encerrar SSO Auth0 apenas em fronteira isolada: retorno fixo/state, sem open redirect, sem logout Google ou efeito publicado. Não deduzir resultado só de pedido de senha. |
| H19 | S13 | Cookie/época antiga e bearer anterior não criam sessão; nova entrada deve usar nova época. BFF atual não tem refresh grant, não inventar renovação. |
| H20 | S14 | Inventariar grafo completo da distribuição; lock/integridade, triagem de avisos e hashes implantados conferidos. |
| H21 | S14 | Marcador inerte chega à aplicação e é tratado como texto, sem execução/reflexão/exfiltração; CSP efetiva. Se WAF interceptar, BLOCKED. |
| H22 | S14 | Callback limpo, referrer protegido, retorno arbitrário negado, descrição do provedor não refletida; não copiar URL/código real. |
| H23 | S14 | Conferir logs sanitizados da aplicação e política de retenção de host/IdP sem exportar conteúdo bruto; desconhecido não vira PASS. |
| H24 | S12/S13 | Reiniciar apenas o novo destino HML e repetir corrida: linhas e revogações persistem, privilégios continuam separados, produção intacta. |

## Ferramentas locais de preparação

Da raiz do repositório:

```powershell
node --test cft005/homologacao/evaluate.test.mjs
node cft005/homologacao/evaluate.mjs cft005/homologacao/receipt.prepared.json
```

O segundo comando deve terminar com código **2** e relatório BLOCKED (0 PASS, 0 FAIL, 24 BLOCKED). Código 0 exige todos os critérios observados; código 1 significa FAIL ou modelo inválido. Nenhum comando envia requisições, lê variáveis de ambiente, carrega credenciais ou modifica banco/serviço. Não há executor de provisionamento neste pacote.

O teste local do avaliador verifica prevenção de falsos PASS e rejeição de campos imprevistos; não testa Auth0, navegador, SQL ou produto. Os recibos completos construídos na suíte são fixtures e não devem ser exportados como evidência real. Não preencher um resultado porque foi esperado no plano. A evidência da preparação deve declarar explicitamente que os 24 casos não foram executados.
