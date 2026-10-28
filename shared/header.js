/* Shared Division IV header include.
 * One identity and layout; public and inspector navigation keep distinct handlers.
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
 '<button id="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="Open menu">☰</button>',
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
 '   <a href="/events/" target="_blank" rel="noopener noreferrer">Submit / Update Event ↗</a>',
 '  </div>',
 ' </div>',
 ' <a class="nav-inspector-login" href="/inspectors/">Inspector Login ↗</a>',
 '</nav>'].join('');
 const appNavigation=[
 '<nav aria-label="Main navigation" class="division-app-nav">',
 ' <button id="nav-public" class="nav-btn active" type="button">Calendar Submissions</button>',
 ' <a href="/calendar/" class="nav-btn">View Calendar</a>',
 ' <button id="nav-admin" class="nav-btn hidden" type="button">Inspector Desk</button>',
 ' <button id="nav-signin" class="nav-btn" type="button">Inspector Sign In</button>',
 ' <button id="nav-signout" class="nav-btn hidden" type="button">Sign Out</button>',
 '</nav>'].join('');
 target.classList.add('division-site-header');
 const inner=document.createElement('div');
 inner.className='division-header-inner'+(mode==='app'?' container topbar':'');
 inner.innerHTML=brand+(mode==='app'?appNavigation:publicNavigation);
 target.replaceChildren(inner);
 target.dataset.headerReady='true';
})();