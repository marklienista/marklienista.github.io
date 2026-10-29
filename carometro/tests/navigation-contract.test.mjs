/* Contratos estáticos da navegação 0.15. Não usa rede nem dados reais.
   Executar: node --test carometro/tests/navigation-contract.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('index.html'),app=read('app.js'),nav=read('navigation.mjs'),css=read('navigation.css');
const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
test('HTML carrega somente a versão nova de app e navegação',()=>{assert.match(html,/app\.js\?v=0\.15/);assert.match(html,/navigation\.css\?v=0\.15/);assert.match(app,/navigation\.mjs\?v=0\.15/)});
test('Nenhum identificador HTML duplicado',()=>{const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size)});
test('Apresentação está na tela inicial, não no editor',()=>{assert.match(between(html,'id="entryGate"','id="workspaceApp"'),/id="heroTitle"/);assert.doesNotMatch(between(html,'id="workspaceApp"','</main>'),/id="heroTitle"/)});
test('Menu global não é o menu do cadastro',()=>{const top=between(html,'<header','</header>');for(const id of ['switchSpaceBtn','connectBtn','helpBtn'])assert.ok(top.includes('id="'+id+'"'));assert.ok(!top.includes('settingsBtn'))});
test('Editor tem exatamente quatro abas',()=>{const tabs=between(html,'<nav class="navtabs"','</nav>');/* Espaço após navtabs pode variar. */const actual=html.match(/<nav class="navtabs[^]*?<\/nav>/)?.[0]||tabs;assert.deepEqual([...actual.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]),['configuracao','turmas','listas','impressao'])});
test('Configuração não exige um diálogo adicional',()=>{assert.match(html,/id="view-configuracao"/);assert.doesNotMatch(html,/id="settingsDialog"/);assert.match(app,/selectView\('configuracao'\)/)});
test('Não há controles de pasta ou compartilhamento no editor',()=>{const editor=between(html,'id="workspaceApp"','</main>');for(const id of ['inviteBtn','manageFolderBtn','copyFolderBtn','openDriveFolderBtn'])assert.ok(!editor.includes('id="'+id+'"'))});
test('PDF mantém a integração já aprovada',()=>{assert.match(app,/pilot-ui\.mjs\?v=0\.14/);assert.match(app,/mountPdfImport\(\{session:S,flush,report,afterApply:/);assert.match(html,/accept="\.pdf,\.csv,\.txt,\.xlsx"/)});
test('Conta e escopo não são reimplementados pelo módulo de navegação',()=>{assert.doesNotMatch(nav,/initTokenClient|requestAccessToken|localStorage|sessionStorage/);assert.match(nav,/new DriveFiles\(S\.config\.clientId\)/)});
test('Compartilhamento não substitui adaptador do editor',()=>{assert.doesNotMatch(nav,/S\.drive\s*=/);assert.match(nav,/context\.drive\.share\(context\.link\.folderId/);assert.match(nav,/share\.drive\.disconnect\(\)|share\?\.drive\.disconnect\(\)/)});
test('Mudança de tela aguarda salvamento e protege rascunho',()=>{assert.match(nav,/async function home\(\)\{\s*if\(!await flush\(\)\)return false/);assert.match(app,/navigation\.allowOpen\(\)/);assert.match(nav,/settingsDraft/)});
test('Celular mantém captura existente e ações acessíveis',()=>{assert.match(css,/@media\(max-width:640px\)/);assert.match(html,/id="captureFile"[^>]*capture="environment"/);assert.match(nav,/person-more/);assert.match(nav,/mobileGroupSelect/)});
test('Permissão ampla continua explicitada antes da conexão',()=>{const gate=between(html,'id="entryDisconnected"','id="entryChoose"');assert.match(gate,/não é limitada pelo Google/);assert.match(gate,/id="entryConnectBtn"/)});
test('Nenhuma ação remota de gravação é disparada só por renderizar o catálogo',()=>{const listing=between(nav,'async function listCarometros()','function clearShare()');assert.doesNotMatch(listing,/\.share\(|\.save\(|\.upload\(|\.revoke\(/)});
