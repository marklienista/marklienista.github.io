# FotoCrachá — laboratório 0.12: acesso amplo com limites operacionais

Aplicativo de testes: https://carometro-teste.onrender.com
Código: `marklienista/marklienista.github.io`, branch `carometro-lab-002`, pasta `carometro/`.
Condutor único: https://docs.google.com/document/d/1JSY62EjOjDT73UchbGdGqq3VdD5zs4eQ2UU6PRnb92k/edit

## Decisão aprovada

Marcelo aprovou em 28/10/2026 o uso do escopo `https://www.googleapis.com/auth/drive` para eliminar autorizações separadas do cadastro e das fotografias nas contas convidadas. Essa decisão substitui a hipótese de autorizar cada imagem pelo Picker, de armazenar imagens em planilhas ou de migrar para um pacote único. Os dados permanecem no Google Drive do responsável, com cadastro `carometro.json` e fotografias na subpasta `Fotos`. Nenhum arquivo existente precisa ser renomeado, convertido ou apagado.

**A permissão concedida pelo Google é ampla.** Ela pode permitir ver, criar, editar e excluir arquivos acessíveis à conta, inclusive fora da pasta do FotoCrachá. A aplicação implementa limites operacionais por espaço, mas eles NÃO restringem o alcance do token OAuth. Esse aviso aparece antes da conexão, durante o uso e em Ajuda e privacidade. A escolha exige novo consentimento das contas, não uma alteração silenciosa de autorização.

## Funcionamento

Antes do login a interface fica vazia, sem estudantes demonstrativos. Depois da autorização, a pessoa escolhe o espaço, cola um link de pasta/arquivo ou abre o convite `?space=ID`. A aplicação lê cadastro e fotos diretamente, sem Google Picker e sem selecionar cada fotografia. A lista inicial busca apenas metadados de arquivos chamados `carometro.json`; não baixa o conteúdo dos demais documentos do Drive.

A pasta continua sendo compartilhada pelo Google com papéis Leitor/Editor. Uma conta sem acesso à pasta não recebe acesso por causa do escopo amplo. Quem recebeu apenas leitura não vê controles de edição e o adaptador também recusa gravações. O uso de nova conta durante uma reconexão é bloqueado enquanto existe um espaço ativo, para não gravar alterações em nome de outra pessoa por engano.

O salvamento automático é agrupado após aproximadamente 1,2 segundo sem alterações e serializado na mesma aba. A interface mostra salvamento, confirmação ou erro. Erros interrompem novas tentativas automáticas; reconexão e reabertura são ações explícitas. Atualizações feitas durante um envio permanecem pendentes para a próxima gravação. Não se promete coedição em tempo real: a proteção de versão/conteúdo é de melhor esforço, não uma transação atômica entre contas. Evitar alterações simultâneas.

## Limites operacionais implementados

O adaptador `drive-files.js` mantém internamente o manifesto e as pastas vinculadas ao espaço aberto, e verifica a hierarquia real retornada pelo Google:

- O manifesto deve ter nome `carometro.json`, MIME JSON, schema 1 e tamanho permitido. Seu `drive.folderId` deve coincidir com a pasta-pai real.
- A pasta de fotografias deve pertencer à pasta principal. O código não segue um identificador que redirecione para outra pasta.
- Uma fotografia só é baixada se estiver referenciada no espaço ou tiver sido enviada por esta sessão. Antes de obter o conteúdo, o código confirma pasta-pai, tipo JPG/PNG/WEBP, tamanho e permissão de download.
- Uploads só podem criar fotografias e logotipo na subpasta de fotos vinculada. O manifesto só é criado/atualizado na pasta correspondente ao espaço ativo.
- Compartilhamento e revogação pelo aplicativo só atuam na pasta do espaço ativo, respeitam `canShare` e não removem a propriedade do arquivo.
- Não há operação de exclusão de arquivos no aplicativo. Retirar uma foto do cadastro não apaga automaticamente o arquivo anterior no Drive.
- Token OAuth só fica na memória da página. Não é salvo em URL, localStorage, GitHub, Supabase ou servidor de dados do FotoCrachá. O Client ID e a chave pública do Picker permanecem na configuração, mas o Picker não faz mais parte do fluxo atual.

Essas verificações reduzem erros de implementação, mas não equivalem à segurança de um token limitado por pasta. Comprometimento do código ou do token continua sendo um risco compatível com a autorização ampla. Não afirmar ao usuário que o Google impõe acesso somente à pasta.

## Google Cloud: configuração administrativa a conferir

Projeto Google Cloud existente: número `784125401141`; manter o Client ID OAuth Web já configurado e a origem `https://carometro-teste.onrender.com`. Não criar novas credenciais nem publicar Client Secret.

Em Google Auth Platform → Data Access, declarar `https://www.googleapis.com/auth/drive`. Em Audience, manter o aplicativo em Testing e as contas adultas utilizadas na validação como testadoras. A configuração administrativa não foi editada automaticamente pelo código; a autorização efetiva depende da conta Google e de suas políticas organizacionais. O aplicativo solicita o novo escopo e rejeita respostas que concedam apenas `drive.file`.

Antes de disponibilidade pública, preparar política de privacidade e submeter o acesso restrito à verificação aplicável do Google. Aprovação desta arquitetura por Marcelo, deploy live e testes simulados não equivalem à aprovação pelo Google nem à autorização institucional para tratar dados reais de estudantes.

Referências oficiais:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/oauth2/web/reference/js-reference
- https://developers.google.com/workspace/guides/configure-oauth-consent
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

## Privacidade e continuidade

A aplicação continua estática, com processamento de dados no navegador e armazenamento direto no Google Drive escolhido. Não foi criado servidor intermediário ou banco de estudantes. Recomendam-se conta institucional autorizada ou privada segura, autenticação em duas etapas e convites apenas para pessoas específicas. Quem recebe o convite também concede acesso amplo à própria conta; uma conta dedicada apenas do proprietário não elimina a exposição dos convidados.

Mantenha os dados íntegros: não edite manualmente `carometro.json`, não mova a pasta de fotos e não apague imagens usadas pelo cadastro. Não torne a pasta pública. O Google pode manter seu próprio histórico de revisões; o FotoCrachá não cria um controle paralelo de versões.

O modelo de dados, cadastro de professor, promoção anual, lista piloto CSV/XLSX, captura de imagens, carômetros, crachás e nota temporária de impressão foram preservados. A nota do crachá não entra no cadastro. Nenhuma outra ferramenta do ecossistema ou Supabase foi alterada. `styles.css` permanece como identidade visual base; `access.css` destaca os avisos adicionais.

## Testes desta revisão

Foram executados testes locais com dados e imagens sintéticos e Google simulado:
- 8 verificações de OAuth: escopo amplo, recusa do escopo anterior, identificação da conta, cancelamento e token em memória.
- 20 verificações do adaptador: leitura de cadastro/foto, papéis Leitor/Editor, criação única, conflitos reais versus alterações de metadados, rejeição de pastas/fotos externas e recusa após retirada de permissão.
- 15 verificações funcionais em Chromium com DOM isolado: entrada vazia, aviso antes do login, abertura de cadastro e foto, salvamento de professor/novo estudante/nova foto, segunda conta lendo fotos antigas e novas, bloqueio de edição para Leitor e prévia de crachás com nota não persistida.

As APIs Google nesses testes são simuladas. Não houve teste de novo consentimento real ou tráfego com tokens das contas do usuário. A navegação automática na URL real depende do ambiente e não deve ser confundida com o teste DOM isolado. Nenhuma fotografia real de criança foi acessada ou publicada.

## Próxima validação real

Depois de confirmar o deploy, atualizar a página para 0.12 e usar uma conta adulta testadora. Aceitar o novo acesso amplo, abrir o mesmo espaço existente e conferir a fotografia antiga. Acrescentar uma foto fictícia com a conta Editora, aguardar Tudo salvo e reabrir com a conta convidada. Confirmar que as duas imagens aparecem sem Picker. Testar leitura/edição e retirada de acesso em sequência, sem edições simultâneas. Qualquer bloqueio Google deve ser registrado com a mensagem exata; não desativar proteções nem ignorar alertas para forçar o acesso.

Esta versão continua sendo laboratório, não lançamento.
