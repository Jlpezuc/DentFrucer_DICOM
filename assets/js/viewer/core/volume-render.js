// Render 3D del volumen por lanzamiento de rayos (en el procesador, sin WebGL).
//
// Modos:
//   'mip'  proyección de máxima intensidad (aspecto de radiografía)
//   'bone' superficie del hueso (umbral) con iluminación
//   'skin' superficie de tejidos blandos
//
// Para que sea fluido se trabaja con una copia reducida del volumen (~160 vóxeles
// por lado) y con menos resolución mientras se arrastra.

const MAX_DIM = 160;

export class VolumeRenderer {
  constructor(vol) {
    const [sx, sy, sz] = vol.spacing;
    const L = [vol.nx * sx, vol.ny * sy, vol.nz * sz];
    const target = Math.max(...L) / MAX_DIM;
    const step = [Math.max(1, Math.round(target / sx)), Math.max(1, Math.round(target / sy)), Math.max(1, Math.round(target / sz))];
    const nx = Math.floor(vol.nx / step[0]), ny = Math.floor(vol.ny / step[1]), nz = Math.floor(vol.nz / step[2]);
    const data = new Int16Array(nx * ny * nz);
    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        const src = (z * step[2]) * vol.nx * vol.ny + (y * step[1]) * vol.nx;
        const dst = z * nx * ny + y * nx;
        for (let x = 0; x < nx; x++) data[dst + x] = vol.data[src + x * step[0]];
      }
    }
    this.nx = nx; this.ny = ny; this.nz = nz;
    this.data = data;
    this.sp = [sx * step[0], sy * step[1], sz * step[2]];
    this.L = [nx * this.sp[0], ny * this.sp[1], nz * this.sp[2]];
    this.units = vol.units;
    this.vol = vol;
  }

  // Umbrales por defecto para cada superficie.
  defaultThreshold(mode) {
    if (this.units === 'HU') return mode === 'skin' ? -350 : 450;
    const { min, max } = this.vol;
    return mode === 'skin' ? min + (max - min) * 0.3 : min + (max - min) * 0.55;
  }

  // Dibuja en un ImageData de tamaño S×S.
  render(img, { yaw = 0, pitch = 0, zoom = 1, mode = 'bone', threshold, wl }) {
    const S = img.width;
    const out = img.data;
    const { nx, ny, nz, data, sp, L } = this;
    const nxy = nx * ny;
    const c = [L[0] / 2, L[1] / 2, L[2] / 2];
    const diag = Math.hypot(...L);
    const half = (Math.max(...L) / 2) * 1.08 / zoom;

    // Cámara: mira desde anterior (dirección +y), arriba = superior (+z).
    const cy = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spt = Math.sin(pitch);
    const r = [cy, syw, 0];
    const d0 = [-syw, cy, 0];
    const d = [d0[0] * cp, d0[1] * cp, -spt];
    const u = [d0[0] * spt, d0[1] * spt, cp];

    const stepMM = Math.min(...sp) * (mode === 'mip' ? 1 : 0.8);
    const inc = [d[0] * stepMM / sp[0], d[1] * stepMM / sp[1], d[2] * stepMM / sp[2]];
    const thr = threshold === undefined ? this.defaultThreshold(mode) : threshold;
    const lo = wl.c - wl.w / 2;
    const scale = 255 / Math.max(1, wl.w);
    const color = mode === 'skin' ? [236, 192, 168] : [238, 230, 212];

    const sample = (x, y, z) => {
      const xi = x | 0, yi = y | 0, zi = z | 0;
      if (xi < 0 || yi < 0 || zi < 0 || xi >= nx || yi >= ny || zi >= nz) return -32768;
      return data[zi * nxy + yi * nx + xi];
    };

    // Muestreo trilineal (solo para refinar superficies).
    const tri = (x, y, z) => {
      x -= 0.5; y -= 0.5; z -= 0.5;
      const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
      const fx = x - x0, fy = y - y0, fz = z - z0;
      const g = (xi, yi, zi) => {
        xi = xi < 0 ? 0 : xi >= nx ? nx - 1 : xi;
        yi = yi < 0 ? 0 : yi >= ny ? ny - 1 : yi;
        zi = zi < 0 ? 0 : zi >= nz ? nz - 1 : zi;
        return data[zi * nxy + yi * nx + xi];
      };
      const c00 = g(x0, y0, z0) * (1 - fx) + g(x0 + 1, y0, z0) * fx;
      const c10 = g(x0, y0 + 1, z0) * (1 - fx) + g(x0 + 1, y0 + 1, z0) * fx;
      const c01 = g(x0, y0, z0 + 1) * (1 - fx) + g(x0 + 1, y0, z0 + 1) * fx;
      const c11 = g(x0, y0 + 1, z0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1, z0 + 1) * fx;
      return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
    };

    for (let j = 0; j < S; j++) {
      const sv = half - ((j + 0.5) / S) * 2 * half;
      for (let i = 0; i < S; i++) {
        const su = ((i + 0.5) / S) * 2 * half - half;
        const o = [c[0] + su * r[0] + sv * u[0] - diag * d[0], c[1] + su * r[1] + sv * u[1] - diag * d[1], c[2] + su * r[2] + sv * u[2] - diag * d[2]];
        // Intersección con la caja del volumen.
        let t0 = 0, t1 = 2 * diag;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(d[k]) < 1e-9) { if (o[k] < 0 || o[k] > L[k]) { t0 = 1; t1 = 0; } continue; }
          let a = (0 - o[k]) / d[k], b = (L[k] - o[k]) / d[k];
          if (a > b) [a, b] = [b, a];
          if (a > t0) t0 = a;
          if (b < t1) t1 = b;
        }
        const p = ((j * S) + i) * 4;
        if (t1 <= t0) { out[p] = out[p + 1] = out[p + 2] = out[p + 3] = 0; continue; }

        let x = (o[0] + t0 * d[0]) / sp[0], y = (o[1] + t0 * d[1]) / sp[1], z = (o[2] + t0 * d[2]) / sp[2];
        const steps = Math.ceil((t1 - t0) / stepMM);

        if (mode === 'mip') {
          let m = -32768;
          for (let s = 0; s < steps; s++) {
            const v = sample(x, y, z);
            if (v > m) m = v;
            x += inc[0]; y += inc[1]; z += inc[2];
          }
          let g = (m - lo) * scale;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          out[p] = out[p + 1] = out[p + 2] = g;
          out[p + 3] = 255;
          continue;
        }

        let hit = -1;
        for (let s = 0; s < steps; s++) {
          if (sample(x, y, z) >= thr) { hit = s; break; }
          x += inc[0]; y += inc[1]; z += inc[2];
        }
        if (hit < 0) { out[p] = out[p + 1] = out[p + 2] = out[p + 3] = 0; continue; }
        // Refinar el punto de contacto con interpolación trilineal (evita el
        // escalonado de los vóxeles). Se retrocede hasta un punto que esté
        // realmente por debajo del umbral y se busca el cruce por bisección.
        let back = 1;
        while (back < 6 && tri(x - back * inc[0], y - back * inc[1], z - back * inc[2]) >= thr) back++;
        let fwd = 0;
        while (fwd < 3 && tri(x + fwd * inc[0], y + fwd * inc[1], z + fwd * inc[2]) < thr) fwd++;
        let ax = x - back * inc[0], ay = y - back * inc[1], az = z - back * inc[2];
        let bx = x + fwd * inc[0], by = y + fwd * inc[1], bz = z + fwd * inc[2];
        let fa = -back, fb = fwd; // posición en pasos respecto de la muestra detectada
        for (let k = 0; k < 8; k++) {
          const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
          const fm = (fa + fb) / 2;
          if (tri(mx, my, mz) >= thr) { bx = mx; by = my; bz = mz; fb = fm; } else { ax = mx; ay = my; az = mz; fa = fm; }
        }
        x = bx; y = by; z = bz;
        // Gradiente promediado a dos distancias: normales más suaves.
        const gx = tri(x + 1, y, z) - tri(x - 1, y, z) + 0.5 * (tri(x + 2, y, z) - tri(x - 2, y, z));
        const gy = tri(x, y + 1, z) - tri(x, y - 1, z) + 0.5 * (tri(x, y + 2, z) - tri(x, y - 2, z));
        const gz = tri(x, y, z + 1) - tri(x, y, z - 1) + 0.5 * (tri(x, y, z + 2) - tri(x, y, z - 2));
        const gl = Math.hypot(gx / sp[0], gy / sp[1], gz / sp[2]) || 1;
        const nxv = -gx / sp[0] / gl, nyv = -gy / sp[1] / gl, nzv = -gz / sp[2] / gl;
        const lambert = Math.max(0, -(nxv * d[0] + nyv * d[1] + nzv * d[2]));
        const spec = Math.pow(lambert, 24) * 0.35;
        const depth = 1 - 0.45 * ((t0 + (hit + fb) * stepMM) / (2 * diag));
        const shade = (0.18 + 0.82 * lambert) * depth;
        out[p] = Math.min(255, color[0] * shade + 255 * spec);
        out[p + 1] = Math.min(255, color[1] * shade + 255 * spec);
        out[p + 2] = Math.min(255, color[2] * shade + 255 * spec);
        out[p + 3] = 255;
      }
    }
    return img;
  }
}
