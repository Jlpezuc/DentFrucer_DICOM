// Landing pública: menú móvil, formulario de contacto y año del pie.

import { setText, toast } from '../ui/dom.js';

export function init() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
  }
  const contact = document.getElementById('contact-form');
  if (contact) {
    contact.addEventListener('submit', (e) => {
      e.preventDefault();
      contact.reset();
      toast('Gracias. Nos pondremos en contacto pronto.');
    });
  }
  setText('year', new Date().getFullYear());
}
