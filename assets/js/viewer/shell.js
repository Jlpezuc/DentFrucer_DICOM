// Estructura visual del visor (pantalla completa): encabezado, barra de
// herramientas, escenario de imágenes, panel lateral y pie. No sabe nada de
// DICOM: los modos (modes/*.js) la llenan y escuchan sus eventos.
//
// viewOnly: visor de solo lectura (pacientes). Los botones del encabezado se
// llaman "Descargar archivos" y "Guardar imagen", y la ayuda no menciona las
// mediciones; las herramientas y acciones que se muestran las elige el
// espacio de trabajo con setTools().

import { escapeHtml } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { TOOLS } from './core/tools.js';

const IMAGE_ACTIONS = [
  { id: 'rotate', label: 'Girar 90°', icon: 'rotate', key: 'G' },
  { id: 'flipH', label: 'Voltear horizontal', icon: 'flipH' },
  { id: 'flipV', label: 'Voltear vertical', icon: 'flipV' },
  { id: 'invert', label: 'Invertir grises', icon: 'invert', key: 'I' },
  { id: 'fit', label: 'Ajustar a la pantalla', icon: 'fit', key: 'F' },
  { id: 'overlay', label: 'Ocultar o mostrar los datos sobre la imagen', icon: 'overlay', key: 'O' },
  { id: 'reset', label: 'Restablecer vista', icon: 'reset', key: 'X' },
  { id: 'undo', label: 'Deshacer', icon: 'undo', keyLabel: 'Ctrl+Z' }
];

export function createShell({ study, onClose, viewOnly = false }) {
  const listeners = {};
  const emit = (ev, ...args) => (listeners[ev] || []).forEach((fn) => fn(...args));

  const root = document.createElement('div');
  root.className = 'dv-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Visor de exámenes');
  root.innerHTML = `
    <header class="dv-header">
      <div class="dv-brand">
        <img src="assets/img/logo-dentfrucer-circular.png" alt="" width="32" height="32">
        <span>Visor<strong>DentFrucer</strong></span>
      </div>
      <div class="dv-study">
        <div class="dv-patient">${escapeHtml(study.patientName || 'Paciente')}</div>
        <div class="dv-study-meta">
          <span class="dv-chip dv-chip-mod" data-mode-label>${escapeHtml(study.modality || 'Examen')}</span>
          ${study.patientCode ? `<span>${escapeHtml(study.patientCode)}</span>` : ''}
          ${study.patientAge ? `<span>${escapeHtml(study.patientAge)} años</span>` : ''}
          ${study.date ? `<span>${escapeHtml(new Date(study.date + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }))}</span>` : ''}
          ${study.description ? `<span class="dv-desc">${escapeHtml(study.description)}</span>` : ''}
        </div>
      </div>
      <div class="dv-header-actions">
        <button type="button" class="dv-hbtn" data-action="download" title="Descargar archivos originales">${icon('download')}<span>${viewOnly ? 'Descargar archivos' : 'Descargar'}</span></button>
        <button type="button" class="dv-hbtn" data-action="export" title="Guardar la vista como imagen PNG">${icon('image')}<span>${viewOnly ? 'Guardar imagen' : 'Exportar'}</span></button>
        <button type="button" class="dv-hbtn" data-action="print" title="Imprimir la vista">${icon('printer')}<span>Imprimir</span></button>
        <span class="dv-hsep"></span>
        <button type="button" class="dv-hbtn dv-icon-only" data-action="panel" title="Mostrar u ocultar el panel lateral">${icon('sidebar')}</button>
        <button type="button" class="dv-hbtn dv-icon-only" data-action="fullscreen" title="Pantalla completa">${icon('fullscreen')}</button>
        <button type="button" class="dv-hbtn dv-icon-only" data-action="help" title="Ayuda y atajos (?)">${icon('help')}</button>
        <button type="button" class="dv-hbtn dv-close" data-action="close" title="Cerrar visor (Esc)">${icon('x')}<span>Cerrar</span></button>
      </div>
    </header>
    <div class="dv-body">
      <nav class="dv-toolbar" aria-label="Herramientas"></nav>
      <main class="dv-stage"></main>
      <aside class="dv-panel">
        <div class="dv-tabs" role="tablist"></div>
        <div class="dv-tab-bodies"></div>
      </aside>
    </div>
    <footer class="dv-footer">
      <div class="dv-presets" aria-label="Contraste"></div>
      <div class="dv-extra"></div>
      <div class="dv-slice" hidden>
        <button type="button" class="dv-fbtn" data-slice="prev" title="Corte anterior (↑)">${icon('chevronLeft')}</button>
        <input type="range" min="0" max="0" value="0" aria-label="Corte">
        <button type="button" class="dv-fbtn" data-slice="next" title="Corte siguiente (↓)">${icon('chevronRight')}</button>
        <button type="button" class="dv-fbtn" data-slice="play" title="Reproducir cortes (barra espaciadora)">${icon('play')}</button>
        <span class="dv-slice-label"></span>
      </div>
      <div class="dv-hint" aria-live="polite"></div>
      <div class="dv-cursor"></div>
    </footer>
    <div class="dv-loading">
      <div class="dv-loading-card">
        <div class="dv-loading-logo"><img src="assets/img/logo-dentfrucer-circular.png" alt=""></div>
        <h3>Preparando examen</h3>
        <p class="dv-loading-detail">Conectando…</p>
        <div class="dv-progress"><span></span></div>
      </div>
    </div>
    <div class="dv-dialog" hidden></div>
    <div class="dv-toast" role="status"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('dv-open');

  const $ = (s) => root.querySelector(s);
  const toolbar = $('.dv-toolbar');
  const stage = $('.dv-stage');
  const panel = $('.dv-panel');
  const tabs = $('.dv-tabs');
  const tabBodies = $('.dv-tab-bodies');
  const hintEl = $('.dv-hint');
  const cursorEl = $('.dv-cursor');
  const sliceEl = $('.dv-slice');
  const range = sliceEl.querySelector('input');
  let sliceCfg = null;
  let playing = null;
  let activeTool = null;
  let closed = false;
  let closeGuard = null; // () => texto de aviso si cerrar haría perder trabajo
  let actionIds = new Set(IMAGE_ACTIONS.map((a) => a.id)); // acciones visibles en la barra

  if (window.innerWidth < 900) root.classList.add('dv-panel-hidden');

  // --- Encabezado --------------------------------------------------------------
  root.querySelector('.dv-header-actions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'close') return requestClose();
    if (a === 'panel') { root.classList.toggle('dv-panel-hidden'); emit('layout'); return; }
    if (a === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
      return;
    }
    if (a === 'help') return showHelp();
    emit('header', a);
  });

  // --- Barra de herramientas ------------------------------------------------
  toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tool) emit('tool', b.dataset.tool);
    if (b.dataset.action) emit('action', b.dataset.action);
  });

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) shell.showTab(b.dataset.tab);
  });

  // --- Pie: cortes ---------------------------------------------------------------
  range.addEventListener('input', () => sliceCfg && sliceCfg.onInput(Number(range.value)));
  sliceEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-slice]');
    if (!b || !sliceCfg) return;
    if (b.dataset.slice === 'prev') sliceCfg.onInput(Math.max(0, sliceCfg.value - 1));
    if (b.dataset.slice === 'next') sliceCfg.onInput(Math.min(sliceCfg.max, sliceCfg.value + 1));
    if (b.dataset.slice === 'play') togglePlay();
  });

  function togglePlay() {
    const btn = sliceEl.querySelector('[data-slice="play"]');
    if (playing) { clearInterval(playing); playing = null; btn.innerHTML = icon('play'); btn.classList.remove('on'); return; }
    if (!sliceCfg) return;
    btn.innerHTML = icon('pause');
    btn.classList.add('on');
    playing = setInterval(() => {
      if (!sliceCfg) return togglePlay();
      sliceCfg.onInput(sliceCfg.value >= sliceCfg.max ? 0 : sliceCfg.value + 1);
    }, 70);
  }

  // --- Teclado ---------------------------------------------------------------------
  const toolKeys = {};
  function onKey(e) {
    if (closed) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && t.type !== 'range') return;
    if (e.key === 'Escape') {
      if (!$('.dv-dialog').hidden) { closeDialog(); return; }
      if (emitCancel()) return;
      requestClose();
      return;
    }
    // Con un diálogo abierto, el teclado es del diálogo.
    if (!$('.dv-dialog').hidden) return;
    if (e.key === '?') { showHelp(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (actionIds.has('undo')) emit('action', 'undo'); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !viewOnly) { emit('action', 'delete'); e.preventDefault(); return; }
    if (e.key === ' ' && sliceCfg) { e.preventDefault(); togglePlay(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') && sliceCfg) { e.preventDefault(); sliceCfg.onInput(Math.max(0, sliceCfg.value - (e.key === 'PageUp' ? 10 : 1))); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') && sliceCfg) { e.preventDefault(); sliceCfg.onInput(Math.min(sliceCfg.max, sliceCfg.value + (e.key === 'PageDown' ? 10 : 1))); return; }
    if (e.key === 'Enter') { emit('action', 'enter'); return; }
    const k = e.key.toUpperCase();
    if (toolKeys[k]) { emit('tool', toolKeys[k]); return; }
    const act = IMAGE_ACTIONS.find((a) => a.key === k && actionIds.has(a.id));
    if (act) { emit('action', act.id); return; }
    emit('key', e);
  }
  function emitCancel() {
    let handled = false;
    (listeners.cancel || []).forEach((fn) => { if (fn()) handled = true; });
    return handled;
  }
  document.addEventListener('keydown', onKey);
  const onFs = () => root.classList.toggle('dv-fs', !!document.fullscreenElement);
  document.addEventListener('fullscreenchange', onFs);

  // --- Diálogos ----------------------------------------------------------------------
  const dialog = $('.dv-dialog');
  function openDialog(html, cls = '') {
    dialog.innerHTML = `<div class="dv-dialog-card ${cls}">${html}</div>`;
    dialog.hidden = false;
    dialog.onclick = (e) => { if (e.target === dialog || e.target.closest('[data-dclose]')) closeDialog(); };
    return dialog.querySelector('.dv-dialog-card');
  }
  function closeDialog() { dialog.hidden = true; dialog.innerHTML = ''; if (dialog._resolve) { dialog._resolve(null); dialog._resolve = null; } }

  // Cerrar el visor; si hay trabajo sin guardar (mediciones), se pide confirmación.
  async function requestClose() {
    const warning = closeGuard && closeGuard();
    if (warning && !(await shell.confirm({ title: 'Cerrar el visor', message: warning, okLabel: 'Cerrar visor', cancelLabel: 'Seguir en el visor' }))) return;
    shell.close();
  }

  function showHelp() {
    const tools = Object.entries(TOOLS).filter(([id]) => toolbar.querySelector(`[data-tool="${id}"]`));
    const editing = (html) => (viewOnly ? '' : html);
    openDialog(`
      <div class="dv-dialog-head"><h3>${icon('help')} Cómo usar el visor</h3><button class="dv-fbtn" data-dclose aria-label="Cerrar">${icon('x')}</button></div>
      <div class="dv-help">
        <section>
          <h4>Ratón y trackpad</h4>
          <dl>
            <dt>Rueda</dt><dd>Cambiar de corte (tomografía) o acercar (imágenes)</dd>
            <dt>Ctrl + rueda · pellizco</dt><dd>Acercar / alejar</dd>
            <dt>Clic derecho + arrastrar</dt><dd>Contraste (horizontal) y brillo (vertical)</dd>
            <dt>Clic central + arrastrar</dt><dd>Mover la imagen</dd>
            <dt>Doble clic en un panel</dt><dd>Ampliar / restaurar ese panel</dd>
            ${editing(`<dt>Doble clic en un implante</dt><dd>Cambiar diámetro y longitud</dd>
            <dt>Arrastrar un punto</dt><dd>Corregir una medición</dd>`)}
          </dl>
        </section>
        <section>
          <h4>Herramientas</h4>
          <dl>${tools.map(([, t]) => `<dt><kbd>${t.key}</kbd> ${t.label}</dt><dd>${t.hint}</dd>`).join('')}</dl>
        </section>
        <section>
          <h4>Teclado</h4>
          <dl>
            <dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>RePág</kbd></dt><dd>Corte anterior / siguiente (de 10 en 10)</dd>
            <dt><kbd>Espacio</kbd></dt><dd>Reproducir cortes</dd>
            <dt><kbd>F</kbd> <kbd>G</kbd> <kbd>I</kbd> <kbd>X</kbd></dt><dd>Ajustar, girar, invertir, restablecer</dd>
            ${editing(`<dt><kbd>O</kbd></dt><dd>Ocultar / mostrar los datos del paciente sobre la imagen</dd>
            <dt><kbd>Supr</kbd> · <kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>Borrar medición seleccionada · deshacer</dd>`)}
            <dt><kbd>Esc</kbd></dt><dd>Cancelar / cerrar el visor</dd>
          </dl>
        </section>
      </div>`, 'dv-help-card');
  }

  // --- Toast ---------------------------------------------------------------------
  const toastEl = $('.dv-toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._h);
    toastEl._h = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  const shell = {
    root,
    stage,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    toast,

    setModeLabel(text) { $('[data-mode-label]').textContent = text; },

    // Carga y errores
    setLoading({ title, detail, progress } = {}) {
      const l = $('.dv-loading');
      l.hidden = false;
      l.classList.remove('dv-error');
      if (title) l.querySelector('h3').textContent = title;
      if (detail !== undefined) l.querySelector('.dv-loading-detail').textContent = detail;
      const bar = l.querySelector('.dv-progress');
      bar.classList.toggle('indeterminate', progress === null || progress === undefined);
      bar.querySelector('span').style.width = progress == null ? '' : Math.round(progress * 100) + '%';
    },
    hideLoading() { const l = $('.dv-loading'); l.classList.add('dv-fade'); setTimeout(() => { l.hidden = true; l.classList.remove('dv-fade'); }, 250); },
    showError({ title, message, actions = [] }) {
      const l = $('.dv-loading');
      l.hidden = false;
      l.classList.add('dv-error');
      l.querySelector('.dv-loading-card').innerHTML = `
        <div class="dv-error-icon">${icon('info')}</div>
        <h3>${escapeHtml(title)}</h3>
        <p class="dv-loading-detail">${escapeHtml(message)}</p>
        <div class="dv-error-actions">${actions.map((a, i) => `<button type="button" class="dv-btn ${a.primary ? 'primary' : ''}" data-i="${i}">${escapeHtml(a.label)}</button>`).join('')}</div>`;
      l.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => actions[Number(b.dataset.i)].onClick()));
    },

    // Herramientas. actions: ids de IMAGE_ACTIONS que se muestran (por defecto, todas).
    setTools(ids, actions = IMAGE_ACTIONS.map((a) => a.id)) {
      Object.keys(toolKeys).forEach((k) => delete toolKeys[k]);
      actionIds = new Set(actions);
      const btn = (attrs, ic, label, key) => `<button type="button" class="dv-tool" ${attrs} aria-label="${label}" data-tip="${label}${key ? ' · ' + key : ''}">${icon(ic)}</button>`;
      let html = '<div class="dv-tgroup">';
      for (const id of ids) {
        if (id === '|') { html += '</div><div class="dv-tgroup">'; continue; }
        const t = TOOLS[id];
        toolKeys[t.key] = id;
        html += btn(`data-tool="${id}"`, t.icon, t.label, t.key);
      }
      html += '</div><div class="dv-tgroup dv-tgroup-actions">';
      for (const a of IMAGE_ACTIONS) if (actionIds.has(a.id)) html += btn(`data-action="${a.id}"`, a.icon, a.label, a.key || a.keyLabel);
      html += '</div>';
      toolbar.innerHTML = html;
    },
    setActiveTool(id, hint) {
      activeTool = id;
      toolbar.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
      shell.setHint(hint || (TOOLS[id] ? TOOLS[id].hint : ''));
    },
    setActionState(id, on) {
      const b = toolbar.querySelector(`[data-action="${id}"]`);
      if (b) b.classList.toggle('on', !!on);
    },
    get activeTool() { return activeTool; },

    // Pie
    setPresets(list, activeId, onPick) {
      const el = $('.dv-presets');
      el.innerHTML = list.map((p) => `<button type="button" class="dv-preset ${p.id === activeId ? 'active' : ''}" data-preset="${p.id}">${escapeHtml(p.label)}</button>`).join('');
      el.onclick = (e) => {
        const b = e.target.closest('[data-preset]');
        if (!b) return;
        el.querySelectorAll('.dv-preset').forEach((x) => x.classList.toggle('active', x === b));
        onPick(list.find((p) => p.id === b.dataset.preset));
      };
    },
    clearPresetSelection() { $('.dv-presets').querySelectorAll('.dv-preset').forEach((x) => x.classList.remove('active')); },
    setExtraControls(node) { const el = $('.dv-extra'); el.innerHTML = ''; if (node) el.appendChild(node); },
    setSlider(cfg) {
      sliceCfg = cfg;
      sliceEl.hidden = !cfg;
      if (!cfg) { if (playing) togglePlay(); return; }
      range.max = cfg.max;
      range.value = cfg.value;
      sliceEl.querySelector('.dv-slice-label').textContent = cfg.label || `${cfg.value + 1} / ${cfg.max + 1}`;
    },
    setHint(text) { hintEl.textContent = text || ''; },
    setCursorInfo(text) { cursorEl.textContent = text || ''; },

    // Panel lateral
    addTab(id, label, ic) {
      tabs.insertAdjacentHTML('beforeend', `<button type="button" role="tab" data-tab="${id}">${icon(ic)}<span>${escapeHtml(label)}</span><em class="dv-tab-count" hidden></em></button>`);
      const body = document.createElement('div');
      body.className = 'dv-tab-body';
      body.dataset.tab = id;
      // Solo se ve la pestaña activa (la primera, hasta que se elija otra).
      body.hidden = tabs.children.length > 1;
      tabBodies.appendChild(body);
      if (tabs.children.length === 1) shell.showTab(id);
      else tabs.lastElementChild.setAttribute('aria-selected', 'false');
      return body;
    },
    showTab(id) {
      tabs.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
      tabBodies.querySelectorAll('.dv-tab-body').forEach((b) => { b.hidden = b.dataset.tab !== id; });
    },
    setTabCount(id, n) {
      const em = tabs.querySelector(`[data-tab="${id}"] .dv-tab-count`);
      if (em) { em.hidden = !n; em.textContent = n; }
    },
    openPanel() { root.classList.remove('dv-panel-hidden'); emit('layout'); },

    // Texto (notas) y números (calibración)
    prompt({ title, label = '', placeholder = '', type = 'text', value = '' }) {
      const card = openDialog(`
        <form class="dv-prompt">
          <h3>${escapeHtml(title)}</h3>
          ${label ? `<p>${escapeHtml(label)}</p>` : ''}
          <input class="dv-input" type="${type}" ${type === 'number' ? 'step="0.01" min="0.01"' : ''} placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" required>
          <div class="dv-prompt-actions"><button type="button" class="dv-btn" data-dclose>Cancelar</button><button type="submit" class="dv-btn primary">Aceptar</button></div>
        </form>`, 'dv-prompt-card');
      const input = card.querySelector('input');
      setTimeout(() => input.focus(), 20);
      return new Promise((resolve) => {
        dialog._resolve = resolve;
        card.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = input.value.trim();
          dialog._resolve = null;
          closeDialog();
          resolve(v || null);
        });
      });
    },

    // Confirmación con el estilo del visor. Devuelve true si se acepta.
    confirm({ title, message, okLabel = 'Aceptar', cancelLabel = 'Cancelar' }) {
      const card = openDialog(`
        <div class="dv-prompt">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="dv-prompt-actions"><button type="button" class="dv-btn" data-dclose>${escapeHtml(cancelLabel)}</button><button type="button" class="dv-btn primary" data-ok>${escapeHtml(okLabel)}</button></div>
        </div>`, 'dv-prompt-card');
      const ok = card.querySelector('[data-ok]');
      setTimeout(() => ok.focus(), 20);
      return new Promise((resolve) => {
        dialog._resolve = (v) => resolve(!!v);
        ok.addEventListener('click', () => { dialog._resolve = null; closeDialog(); resolve(true); });
      });
    },

    // Formulario de valores numéricos con opciones rápidas:
    //   fields: [{ name, label, value, options: [n], step, min, max, unit }]
    // Devuelve { name: número } o null si se cancela.
    form({ title, label = '', fields, okLabel = 'Aceptar' }) {
      const fmtN = (n) => String(n).replace('.', ',');
      const card = openDialog(`
        <form class="dv-prompt dv-form">
          <h3>${escapeHtml(title)}</h3>
          ${label ? `<p>${escapeHtml(label)}</p>` : ''}
          ${fields.map((f) => `
            <div class="dv-field">
              <label><span>${escapeHtml(f.label)}</span>
                <input class="dv-input" name="${f.name}" type="number" inputmode="decimal" step="${f.step || 0.1}" min="${f.min ?? ''}" max="${f.max ?? ''}" value="${f.value}" required>
              </label>
              ${f.options ? `<div class="dv-seg dv-opts">${f.options.map((o) => `<button type="button" class="dv-chipbtn ${o === f.value ? 'active' : ''}" data-field="${f.name}" data-v="${o}">${fmtN(o)}</button>`).join('')}</div>` : ''}
            </div>`).join('')}
          <div class="dv-prompt-actions"><button type="button" class="dv-btn" data-dclose>Cancelar</button><button type="submit" class="dv-btn primary">${escapeHtml(okLabel)}</button></div>
        </form>`, 'dv-prompt-card');
      const formEl = card.querySelector('form');
      // Por nombre con querySelector: formEl.elements.length es el número de campos.
      const input = (name) => formEl.querySelector(`input[name="${name}"]`);
      const sync = (name) => {
        const v = Number(input(name).value);
        card.querySelectorAll(`[data-field="${name}"]`).forEach((b) => b.classList.toggle('active', Number(b.dataset.v) === v));
      };
      card.addEventListener('click', (e) => {
        const b = e.target.closest('[data-field]');
        if (!b) return;
        input(b.dataset.field).value = b.dataset.v;
        sync(b.dataset.field);
      });
      formEl.addEventListener('input', (e) => { if (e.target.name) sync(e.target.name); });
      setTimeout(() => formEl.querySelector('input').focus(), 20);
      return new Promise((resolve) => {
        dialog._resolve = resolve;
        formEl.addEventListener('submit', (e) => {
          e.preventDefault();
          const out = {};
          for (const f of fields) out[f.name] = Number(String(input(f.name).value).replace(',', '.'));
          dialog._resolve = null;
          closeDialog();
          resolve(out);
        });
      });
    },

    // guard() -> texto de aviso (o vacío) antes de cerrar el visor.
    setCloseGuard(guard) { closeGuard = guard; },
    closeWarning: () => (closeGuard && closeGuard()) || '',
    requestClose,

    close() {
      if (closed) return;
      closed = true;
      if (playing) clearInterval(playing);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      emit('close');
      root.classList.add('dv-closing');
      setTimeout(() => { root.remove(); if (!document.querySelector('.dv-root')) document.body.classList.remove('dv-open'); }, 180);
      if (onClose) onClose();
    }
  };
  return shell;
}
