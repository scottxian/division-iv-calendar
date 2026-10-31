#!/usr/bin/env node
/** Public and inspector Home Screen guides: static, responsive, and route-specific. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('index.html','utf8');
const desk=fs.readFileSync('inspectors/index.html','utf8');
const homeCss=fs.readFileSync('styles.css','utf8');
const deskCss=fs.readFileSync('app/styles.css','utf8');
const publicManifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const deskManifest=JSON.parse(fs.readFileSync('inspectors/manifest.webmanifest','utf8'));

assert.ok(home.includes('id="install-app"') && home.includes('aria-labelledby="home-install-title"'),'Home guide missing');
assert.ok(home.includes('href="/styles.css?v=11"'),'Homepage installation styles must be cache-busted');
assert.ok(home.includes('href="/inspectors/#install-desk"'),'Homepage must lead inspectors to their direct shortcut');
assert.ok(home.includes('Safari')&&home.includes('Chrome')&&home.includes('Add to Home Screen')&&home.includes('Add to Home screen'),'Homepage should explain iOS and Android setup');
assert.ok(home.indexOf('id="install-app"')>home.indexOf('id="contact"'),'Guide should sit near the homepage footer');
assert.ok(home.indexOf('id="install-app"')<home.indexOf('</main>'),'Install guide should remain in main content');
assert.ok(homeCss.includes('.home-install')&&homeCss.includes('grid-template-columns:1fr'),'Responsive homepage guide styles missing');

assert.ok(desk.includes('id="install-desk"') && desk.includes('aria-labelledby="desk-install-title"'),'Inspector Desk guide missing');
assert.ok(desk.includes('href="/app/styles.css?v=28"'),'Inspector Desk installation styles must be cache-busted');
assert.ok(desk.includes('class="desk-install-steps"')&&desk.includes('Show iPhone and Android instructions'),'Inspector instructions should be collapsible');
assert.ok(desk.includes('href="#install-desk"'),'Desk footer needs a guide link');
assert.ok(desk.includes('divisionivmasons.org/inspectors/'),'Desk instructions must use the desk launch page');
assert.ok(desk.includes('authenticator verification are still required'),'Do not imply shortcuts bypass MFA');
assert.ok(deskCss.includes('.desk-install-guide')&&deskCss.includes('.desk-install-platforms'),'Inspector guide styling missing');
assert.ok(deskCss.includes('@media(max-width:650px)'),'Inspector guide mobile styling missing');
assert.equal(publicManifest.name,'Division IV');
assert.equal(deskManifest.name,'Division IV');
assert.equal(publicManifest.start_url,'/');
assert.equal(deskManifest.start_url,'/inspectors/');
for(const page of [home,desk]){
 assert.ok(page.includes('/assets/apple-touch-icon.png'),'Guides must reuse Division IV app icon');
 assert.ok(!page.includes('onclick="install'),'No fake installation buttons should be shown');
}
console.log('PASS: public and Inspector Desk phone installation guides, branding, responsive styling, and correct PWA launch URLs.');
