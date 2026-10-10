// Exportar la vista actual como imagen PNG (con encabezado de la clínica,
// datos del paciente y lista de mediciones) o imprimirla.

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

// source: canvas ya dibujado (viewport o 3D). info: { title, lines: [], measurements: [] }
export async function composeExport(source, info) {
  const k = Math.max(1, source.width / Math.max(1, source.clientWidth || source.width));
  const pad = 20 * k;
  const headerH = 72 * k;
  const lineH = 18 * k;
  const meas = info.measurements || [];
  const footerH = meas.length ? pad + lineH * (Math.ceil(meas.length / 2) + 1) : 36 * k;
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
  ctx.fillText('Exportado ' + new Date().toLocaleString('es') + ' · Uso clínico: verificar en la imagen original', W - pad, H - 12 * k);
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
