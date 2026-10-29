# CFT-005 — H01/H02 com dois perfis do Chrome

Roteiro preparado em 29/10/2026. Apenas os dois BFFs de teste e as identidades U1/U2 já autorizadas. O operador informou que abriu o segundo perfil; o controle conectado ainda expõe somente um perfil Chrome. As observações do segundo perfil serão manuais e terão essa origem registrada. Nenhum PASS está antecipado.

## Antes de começar

O executor deve confirmar a janela temporária restrita do banco, health 200/ready=true/storage=postgres em A/B e contadores sanitizados de entrada. Não iniciar a rodada com os serviços indisponíveis. A janela anterior foi encerrada corretamente; a nova usa somente as mesmas duas redes regionais aprovadas, sem IP pessoal ou alteração em produção. O executor fecha novamente a janela ao terminar.

Use dois perfis Chrome diferentes, P1/U1 e P2/U2, não apenas duas janelas do mesmo perfil. Deixe uma aba vazia aberta em cada perfil para manter suas janelas abertas durante o teste de fechar/reabrir as abas A/B.

## H01 — quatro entradas

Em cada perfil, copie os endereços para a barra daquele perfil. Um clique em link no chat pode abrir o navegador padrão em outro perfil.

- [A — iniciar entrada com escolha da conta](https://cft005-bff-a-teste.onrender.com/auth/login/choose)
- [B — iniciar entrada com escolha da conta](https://cft005-bff-b-teste.onrender.com/auth/login/choose)

Comece no perfil P2 usando a conta U2 autorizada; use Continuar com Google e escolha essa conta. Repita A e B. Depois faça A e B no perfil P1 com U1. Senha, se exigida, é preenchida somente pelo operador no provedor.

| Perfil / página | Mensagem esperada |
|---|---|
| P1 / A | Produto A · U1 |
| P1 / B | Produto B · U1 |
| P2 / A | Produto A · U2 |
| P2 / B | Produto B · U2 |

Confira as quatro páginas antes de continuar. Este teste usa somente Entrar e o rótulo de sessão. Não precisa executar a prova que altera os registros sintéticos.

## H02 — recarga e reabertura

Faça a sequência logo após as quatro entradas, idealmente em até dez minutos.

1. Recarregue uma vez cada uma das quatro páginas. Confira que cada uma preserva o rótulo da tabela sem clicar novamente em Entrar.
2. Feche somente as abas A/B de cada perfil, mantendo a aba vazia e a janela do perfil abertas.
3. Reabra as páginas iniciais abaixo na barra do mesmo perfil. Estas páginas consultam a sessão existente e não iniciam um novo login.

- [A — página inicial para reabertura](https://cft005-bff-a-teste.onrender.com/)
- [B — página inicial para reabertura](https://cft005-bff-b-teste.onrender.com/)

4. Confira novamente os quatro rótulos, sem clicar em Entrar, e deixe as páginas abertas. Se uma página perder a sessão, informe qual e a mensagem visível; não tente corrigir antes de registrar o resultado.

## Resposta sanitizada do operador

Informe somente os rótulos observados, não URLs de retorno, códigos, tokens, cookies ou senhas. Preencha cada campo pelo que realmente apareceu:

| Página | Após entrar | Após recarregar | Após fechar/reabrir |
|---|---|---|---|
| P1 / A | a informar | a informar | a informar |
| P1 / B | a informar | a informar | a informar |
| P2 / A | a informar | a informar | a informar |
| P2 / B | a informar | a informar | a informar |

Confirme também: os dois perfis são diferentes? Foi necessário clicar em Entrar ou autenticar novamente durante recarga/reabertura? Houve interrupção ou demora acima de quinze minutos?

O executor conferirá os contadores públicos sanitizados e registrará a evidência humana separada da observação automatizada. Contadores não demonstram sozinhos isolamento de perfil. Se faltar uma observação exigida, o caso permanece BLOCKED; um erro observado não é convertido em PASS por repetição silenciosa. A matriz publicada e os 52 controles HTTP anteriores mantêm seus escopos.
