# FotoCrachá — carômetros e crachás (laboratório 0.10)

Aplicação de testes: https://carometro-teste.onrender.com
Fonte única de código: GitHub `marklienista/marklienista.github.io`, branch isolada `carometro-lab-002`, diretório `carometro/`.
Condutor do projeto (mesmo documento anterior): https://docs.google.com/document/d/1JSY62EjOjDT73UchbGdGqq3VdD5zs4eQ2UU6PRnb92k/edit

## Nome público e continuidade dos dados

Nome público aprovado em 27/10/2026: **FotoCrachá**. `Carômetro` continua sendo o nome de **um dos formatos impressos**. O domínio de laboratório `carometro-teste.onrender.com`, o nome do serviço Render, a pasta do código, o ID do projeto Google Cloud e o nome interno `carometro.json` não foram trocados: preservar esses identificadores mantém a descoberta e leitura dos arquivos anteriormente gravados. Novos espaços criam a pasta `FotoCrachá — [escola]` no Drive; pastas antigas `Carômetro — [escola]` não são movidas ou renomeadas.

O nome exibido na **tela de consentimento Google OAuth** pertence ao Google Cloud Auth Platform e pode ainda estar como Carômetro. Alterá-lo é uma ação administrativa separada no Google Cloud; a mudança no site não o altera automaticamente.

## Como funciona

O responsável conecta sua própria conta Google com **Conectar ao Google Drive**, escolhe a conta no popup e autoriza o escopo restrito `drive.file`. Não informa IDs ou chaves. Cadastros e fotografias podem ser armazenados em uma pasta do Drive do responsável. O app não tem sistema próprio de reconhecimento facial e não envia imagens a IA. Somente usar dados fictícios até homologar privacidade e colaboração.

- **Turmas:** nome, ano e nome opcional do **professor(a) da turma**, cadastrado/alterado em **Editar turma**. O professor fica associado à turma daquele ano, não ao estudante. Ao promover estudantes, uma nova turma do ano seguinte começa sem professor pré-definido. Os dados são gravados no mesmo manifesto que nomes, turmas e fotos.
- **Carômetro:** impressão existente em grade de fotografias, com nome da escola e logotipo quando cadastrado. O professor(a) aparece no cabeçalho quando há somente uma turma, ou ao lado de cada estudante quando houver várias. A exibição de matrícula/RA continua opcional apenas neste formato.
- **Crachás:** em **Imprimir → O que deseja imprimir? → Crachás**, escolher selecionados/turma/ano inteiro, **Com fotografia** ou **Apenas nome**, e opcionalmente digitar informações adicionais. Imprime 8 cartões de **86 × 54 mm** por folha A4, organizados em 2 colunas × 4 linhas, com marca de recorte; inclui nome, turma, professor cadastrado e logo se existente. Nunca imprime a matrícula/RA nos crachás.
- **Informações adicionais:** um único texto opcional, com no máximo 120 caracteres, repetido no lote de crachás (ex.: nome do passeio, contato institucional). É **transitório na tela**: não há campo no modelo, não vai para Google Drive, não fica em `localStorage`, não mantém versões, não aparece nos carômetros e é limpo ao criar novo espaço ou recarregar a página. Evite dados pessoais dos estudantes.
- **PDF:** o app prepara a grade no navegador; **Imprimir / Salvar PDF** abre a janela de impressão local. Recomendações: papel **A4 retrato**, **escala 100% / tamanho real**, sem cabeçalhos ou rodapés do navegador. Confira uma régua no primeiro teste físico; impressoras podem impor margens/escala próprias. Não existe armazenamento separado de PDFs.

## Modelo e migração

`schema_version: 1` permanece intocado. O atributo opcional `classes[].teacher` é preenchido com string vazia ao abrir carômetros antigos. Não é necessário migrar o banco, criar outra pasta, duplicar documentos nem fazer backup extra. Novos nomes de pasta não alteram o nome interno do manifesto. Todos os textos são montados como nós DOM com `textContent`, sem injetar HTML escrito por usuários. Fotos continuam em URLs temporárias do navegador até upload.

## Integração Google Cloud

Projeto Google Cloud número `784125401141`; Client ID OAuth Web público já está centralizado em `config.js`. Origem JavaScript autorizada de laboratório: `https://carometro-teste.onrender.com`. Scope `https://www.googleapis.com/auth/drive.file`. Marcelo confirmou em 25/10/2026 que uma conta conseguiu conectar após cadastrar usuários de teste; isso **não prova ainda** salvar/reabrir arquivos nem compartilhar fotografias. A chave pública **restrita** do Google Picker ainda está pendente; selecionar arquivos de convidados não foi homologado. Não inserir `client_secret` nem tokens de usuários no repositório.

## Testes necessários antes de dados reais

1. Abrir no navegador com conta Google de adulto autorizada no modo Testing, criar turma e professor, salvar, recarregar e reabrir; verificar professor e cadastros.
2. Com alunos fictícios, comparar carômetro antigo com a nova impressão, conferir professor no cabeçalho ou nos cartões.
3. Gerar PDF de crachás **com foto** e **apenas nome**, com 1, 8 e 9 estudantes, conferindo quebra de página, resolução, nomes longos, corte e medidas. Oito crachás por A4 é a intenção do layout; sem impressão real/inspeção visual não se declara homologado.
4. Digitar nota adicional, imprimir e recarregar a página; confirmar que o campo não permaneceu salvo no Drive, e que a nota não aparece no carômetro.
5. Somente depois habilitar Picker e validar compartilhamento real entre duas contas adultas, acesso, revogação e fotos.

## Limites

- **FotoCrachá não foi lançado**; o Render é uma publicação técnica de teste.
- A **conta compartilhada** do ecossistema autoral e o SSO não são substituídos nem comprovados pelo login do Google Drive.
- Compartilhar pasta não garante sozinho o acesso de convidados a todos os arquivos pelo escopo `drive.file`.
- Não usar dados/fotos de crianças reais antes das autorizações institucionais e dos testes de permissão/privacidade.
- A identidade visual B e a assinatura «Criado por Marcelo Santos» foram mantidas, sem alterar Apertaquem, Som da Turma, MeEmpresta ou ApertaLetra.
