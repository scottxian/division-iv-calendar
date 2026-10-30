#!/usr/bin/env node
/** Public and private website navigation share one renderer and unified mobile behavior. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(f,'utf8');
const header=read('shared/header.js'),css=read('shared/header.css'),nav=read('script.js');
new vm.Script(header);new vm.Script(nav);
for(const path of ['index.html','calendar/index.html','lodges/index.html','events/index.html','inspectors/index.html']){
 const content=read(path);
 assert.match(content,/data-division-header="(?:public|app)"/,path);
 assert.match(content,/shared\/header\.js\?v=2/,path);
 assert.match(content,/shared\/header\.css\?v=2/,path);
 assert.match(content,/script\.js\?v=3/,path);
}
assert.match(header,/brand\+publicNavigation\+tools/);
assert.match(header,/id="main-nav"/);
assert.match(header,/id="menu-toggle"/);
assert.match(header,/data-division-header/);
assert.match(header,/id="nav-signin"/);
assert.match(header,/id="nav-admin"/);
assert.match(header,/id="nav-signout"/);
assert.match(nav,/renderNavigation\(config\)/);
assert.match(nav,/if\(!appMode\)/);
assert.match(nav,/onHome=location\.pathname==='\/'/);
assert.match(css,/#main-nav\.open\{display:flex\}/);
assert.match(css,/\.nav-submenu/);
assert.match(css,/#menu-toggle\{display:block\}/);
console.log('PASS: one shared Home/Division/Lodges/Calendar navigation for all five pages');
