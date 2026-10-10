// Exportar la vista actual como imagen PNG (con encabezado de la clínica,
// datos del paciente y lista de mediciones) o imprimirla.
//
// snapshotStage() copia lo que se ve en el escenario: cada lienzo visible en su
// posición, con los textos de las esquinas, la orientación (R/L, A/P, S/I…) y el
// nombre de cada panel, que en pantalla son elementos HTML sobre el lienzo.

const LOGO_SRC = 'assets/img/logo-dentfrucer.png';
let logoPromise = null;

function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = LOGO_SRC;
    });
  }
  return logoPromise;
}

const visibleRect = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
};

export function snapshotStage(stage) {
  const sr = visibleRect(stage);
  if (!sr) return null;
  const k = Math.max(1, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sr.width * k);
  canvas.height = Math.round(sr.height * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(k, k);
  const at = (r) => ({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });

  for (const c of stage.querySelectorAll('canvas.dv-canvas')) {
    const r = visibleRect(c);
    if (!r) continue;
    const p = at(r);
    ctx.drawImage(c, p.x, p.y, p.w, p.h);
  }

  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  // Textos de las esquinas, línea por línea, alineados como en pantalla.
  for (const line of stage.querySelectorAll('.dv-ov > div')) {
    const r = visibleRect(line);
    if (!r || !line.textContent) continue;
    const p = at(r);
    const right = line.parentElement.classList.contains('dv-ov-tr') || line.parentElement.classList.contains('dv-ov-br');
    ctx.font = '500 11.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = line.querySelector('.dv-warn') ? '#f0b35a' : 'rgba(225, 232, 238, .92)';
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillText(line.textContent, right ? p.x + p.w : p.x, p.y + p.h / 2);
  }
  for (const el of stage.querySelectorAll('.dv-orient')) {
    const r = visibleRect(el);
    if (!r || !el.textContent) continue;
    const p = at(r);
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(166, 212, 95, .95)';
    ctx.textAlign = 'center';
    ctx.fillText(el.textContent, p.x + p.w / 2, p.y + p.h / 2);
  }
  ctx.shadowBlur = 0;
  for (const el of stage.querySelectorAll('.dv-pane-label')) {
    const r = visibleRect(el);
    if (!r) continue;
    const p = at(r);
    ctx.fillStyle = 'rgba(10, 14, 18, .8)';
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, p.h / 2);
    ctx.fill();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#dce4ea';
    ctx.textAlign = 'center';
    const text = getComputedStyle(el).textTransform === 'uppercase' ? el.textContent.toUpperCase() : el.textContent;
    ctx.fillText(text, p.x + p.w / 2 + 4, p.y + p.h / 2);
    ctx.fillStyle = getComputedStyle(el).getPropertyValue('--accent').trim() || '#0e9ad3';
    ctx.beginPath();
    ctx.arc(p.x + 11, p.y + p.h / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, scale: k };
}

// source: canvas ya dibujado. info: { title, lines: [], measurements: [], note?, scale? }
// scale: píxeles del lienzo por píxel CSS (si se omite, se deduce del lienzo en pantalla).
export async function composeExport(source, info) {
  const k = info.scale || Math.max(1, source.width / Math.max(1, source.clientWidth || source.width));
  const pad = 20 * k;
  const headerH = 72 * k;
  const lineH = 18 * k;
  const meas = info.measurements || [];
  // Lista de mediciones en dos columnas y, debajo, la línea de fecha y aviso.
  const footerH = meas.length ? pad + lineH * (Math.ceil(meas.length / 2) + 1) + 20 * k : 36 * k;
  const W = source.width;
  const H = headerH + source.height + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, headerH);
  const logo = await loadLogo();
  if (logo) {
    const lh = 44 * k;
    ctx.drawImage(logo, pad, (headerH - lh) / 2, (logo.width / logo.height) * lh, lh);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1f2a33';
  ctx.font = `700 ${15 * k}px Montserrat, Inter, sans-serif`;
  ctx.fillText(info.title || '', W - pad, headerH / 2 - 4 * k);
  ctx.font = `500 ${12 * k}px Inter, sans-serif`;
  ctx.fillStyle = '#5f6c79';
  ctx.fillText((info.lines || []).join('  ·  '), W - pad, headerH / 2 + 15 * k);
  ctx.fillStyle = '#0e9ad3';
  ctx.fillRect(0, headerH - 3 * k, W * 0.6, 3 * k);
  ctx.fillStyle = '#8dc63f';
  ctx.fillRect(W * 0.6, headerH - 3 * k, W * 0.4, 3 * k);

  ctx.drawImage(source, 0, headerH);

  const fy = headerH + source.height;
  ctx.fillStyle = '#0f1419';
  ctx.fillRect(0, fy, W, footerH);
  ctx.textAlign = 'left';
  ctx.font = `500 ${12 * k}px Inter, sans-serif`;
  if (meas.length) {
    ctx.fillStyle = '#a6d45f';
    ctx.font = `700 ${12 * k}px Inter, sans-serif`;
    ctx.fillText('Mediciones', pad, fy + pad);
    ctx.font = `500 ${12 * k}px Inter, sans-serif`;
    ctx.fillStyle = '#e6ecf1';
    meas.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      ctx.fillText((i + 1) + '. ' + m, pad + col * (W / 2), fy + pad + lineH * (row + 1));
    });
  }
  ctx.fillStyle = 'rgba(230,236,241,.55)';
  ctx.textAlign = 'right';
  ctx.font = `500 ${10.5 * k}px Inter, sans-serif`;
  ctx.fillText((info.note ? info.note + ' · ' : '') + 'Exportado ' + new Date().toLocaleString('es') + ' · Uso clínico: verificar en la imagen original', W - pad, H - 12 * k);
  return canvas;
}

export function downloadCanvas(canvas, fileName) {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

// win: ventana abierta de antemano (en el mismo clic) para evitar bloqueadores de ventanas.
export function printCanvas(canvas, title, win) {
  const url = canvas.toDataURL('image/png');
  const w = win || window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><title>${title.replace(/</g, '&lt;')}</title>
    <style>@page{margin:12mm}body{margin:0;display:flex;justify-content:center}img{max-width:100%;max-height:100vh}</style>
    <img src="${url}" onload="setTimeout(()=>{print();},150)">`);
  w.document.close();
  return true;
}
