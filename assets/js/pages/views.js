// Vistas de una página con menú lateral (panel de administración, portal del
// médico): cada enlace "#vista" del menú muestra solo los elementos con
// data-section="vista" y oculta el resto. La vista va en la dirección (#agenda,
// #estudios…), así que se conserva al recargar y funcionan atrás/adelante.
//
//   const views = initViews({ fallback: 'agenda', title: h1, subtitle: p });
//
// title recibe el texto del enlace del menú; subtitle, el data-section-desc de la
// primera sección de la vista (si lo tiene).
//   views.go('carga');   // cambiar de vista desde el código

export function initViews({ fallback, title = null, subtitle = null }) {
  const sections = [...document.querySelectorAll('[data-section]')];
  const links = [...document.querySelectorAll('.side-nav a[href^="#"]')];
  const names = new Set(sections.map((el) => el.dataset.section));

  function show() {
    const wanted = decodeURIComponent(location.hash.slice(1));
    const view = names.has(wanted) ? wanted : fallback;
    sections.forEach((el) => { el.hidden = el.dataset.section !== view; });
    const desc = sections.find((el) => el.dataset.section === view && el.dataset.sectionDesc);
    if (subtitle && desc) subtitle.textContent = desc.dataset.sectionDesc;
    links.forEach((a) => {
      const on = a.getAttribute('href') === '#' + view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      if (on && title) title.textContent = a.textContent.trim();
    });
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', show);
  show();
  return {
    go(view) {
      if (location.hash === '#' + view) show();
      else location.hash = view;
    }
  };
}
