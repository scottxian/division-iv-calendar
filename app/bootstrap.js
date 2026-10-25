/* Small local fallback: navigation and an error message still work if a CDN fails. */
(function(){
  function ready(){
    const login=document.getElementById('nav-signin');
    const form=document.getElementById('signin-form');
    if(!login||!form)return;
    function warning(){
      const n=document.getElementById('notice');
      if(n){n.className='notice error';n.textContent='The sign-in software is still loading or could not load. Please refresh the page with Ctrl+F5. If this continues, tell us which button you clicked and what happened.'}
    }
    login.addEventListener('click',function(){
      if(window.divisionAppReady)return;
      ['public','admin','signin'].forEach(k=>{
        const panel=document.getElementById(k+'-view');
        if(panel)panel.classList.toggle('hidden',k!=='signin');
      });
      warning();
    },true);
    form.addEventListener('submit',function(event){
      if(window.divisionAppReady)return;
      event.preventDefault();warning();
    },true);
    window.addEventListener('error',function(event){
      if(!window.divisionAppReady && (event.filename||'').includes('app.js')) warning();
    });
    setTimeout(function(){
      if(!window.divisionAppReady)warning();
    },9000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);
  else ready();
})();