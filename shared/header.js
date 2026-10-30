/* Shared Division IV header include.
 * One identity, public navigation, and mobile menu for every website section.
 * Load with defer BEFORE the public and inspector application scripts.
 */
(()=>{
 'use strict';
 const target=document.querySelector('header[data-division-header]');
 if(!target)return;
 const mode=target.getAttribute('data-division-header');
 if(!['public','app'].includes(mode))return;
 const route=location.pathname;
 const home=route==='/'||route==='/index.html';
 const lodge=route.startsWith('/lodges/');
 const calendar=route.startsWith('/calendar/');
 const events=route.startsWith('/events/');
 const inspector=route.startsWith('/inspectors/');
 const current=on=>on?' aria-current="page"':'';
 const brand=[
 '<div class="division-brand">',
 ' <a class="brand-home" href="/" aria-label="Division IV Masons — home">',
 '  <img class="brand-emblem" src="/app/assets/division-iv-emblem.png?v=20261028b" width="76" height="76" alt="Division IV Masons emblem">',
 ' </a>',
 ' <div class="brand-copy">',
 '  <a class="brand-name" href="/">Division IV Masons</a>',
 '  <a class="brand-affiliation" href="https://freemason.org/" target="_blank" rel="noopener noreferrer" aria-label="Grand Lodge of California — official website">Grand Lodge of California</a>',
 ' </div>',
 '</div>'].join('');
 const publicNavigation=[
 '<nav id="main-nav" aria-label="Main navigation">',
 ' <a class="nav-home" href="'+(home?'#home':'/#home')+'"'+current(home)+'>Home</a>',
 ' <a class="nav-division-direct" href="/#about">Division</a>',
 ' <div class="nav-group">',
 '  <button class="nav-trigger" type="button" aria-expanded="false" aria-controls="nav-lodges">Lodges <span class="nav-chevron" aria-hidden="true">⌄</span></button>',
 '  <div class="nav-submenu" id="nav-lodges">',
 '   <a href="/lodges/"'+current(lodge)+'>Lodge Directory</a>',
 '   <a href="https://member.freemason.org/public_lodges/search" target="_blank" rel="noopener noreferrer">Grand Lodge Finder ↗</a>',
 '  </div>',
 ' </div>',
 ' <div class="nav-group">',
 '  <button class="nav-trigger" type="button" aria-expanded="false" aria-controls="nav-calendar">Calendar <span class="nav-chevron" aria-hidden="true">⌄</span></button>',
 '  <div class="nav-submenu" id="nav-calendar">',
 '   <a href="/calendar/"'+current(calendar)+'>View Division IV Calendar</a>',
 '   <a href="/events/"'+current(events)+'>Submit / Update Event</a>',
 '  </div>',
 ' </div>',
 ...(mode==='public'?[' <a class="nav-inspector-login" href="/inspectors/"'+current(inspector)+'>Inspector Login ↗</a>']:[]),
 '</nav>'].join('');
 const appActions=mode==='app'?[
  '<div class="division-app-actions" aria-label="Inspector account">',
  ' <button id="nav-public" class="nav-btn hidden" type="button">Calendar Submissions</button>',
  ' <button id="nav-admin" class="nav-btn hidden" type="button">Inspector Desk</button>',
  ' <button id="nav-signin" class="nav-btn" type="button">Inspector Login</button>',
  ' <button id="nav-signout" class="nav-btn hidden" type="button">Sign Out</button>',
  '</div>'].join(''):'';
 const tools='<div class="division-header-tools">'+appActions+
  '<button id="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="Open menu">☰</button></div>';
 target.classList.add('division-site-header');
 const inner=document.createElement('div');
 inner.className='division-header-inner';
 inner.innerHTML=brand+publicNavigation.join('')+tools;
 target.replaceChildren(inner);
 target.dataset.headerReady='true';
})();