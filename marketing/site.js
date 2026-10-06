// parkflows.in shared script (002 T6): the phone/tablet nav drawer.
// Progressive enhancement: without JavaScript the menu button stays hidden, and the
// header still shows Book a demo; Sign in and the page links are in the footer.
const drawer = document.getElementById('mk-drawer');
const openBtn = document.querySelector('.mk-menu-btn');

if (drawer && openBtn && typeof drawer.showModal === 'function') {
  openBtn.hidden = false;
  openBtn.setAttribute('aria-expanded', 'false');
  const close = () => drawer.close();
  openBtn.addEventListener('click', () => {
    drawer.showModal();
    openBtn.setAttribute('aria-expanded', 'true');
  });
  drawer.addEventListener('close', () => {
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
  });
  drawer.querySelector('[data-close]')?.addEventListener('click', close);
  // Click on the backdrop (the dialog element itself, outside its content) closes it.
  drawer.addEventListener('click', (e) => { if (e.target === drawer) close(); });
  // Following an in-page link closes the drawer first so the section is visible.
  drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
}
