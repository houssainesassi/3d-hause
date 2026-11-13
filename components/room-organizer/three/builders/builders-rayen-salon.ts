import { type BuilderContext, type ThreeModule, markSharedTexture, material, mergeParts, mesh } from '../builder-utils';
import { surfaceMaterial } from '../furniture-materials';
import type * as ThreeNS from 'three';

/**
 * Meuble Rayen — salon set SAL-001, modelled from the shop's reference
 * photograph (public/showroom/salon.png). What the photo shows is reproduced:
 *
 * - beige corner sofa: mottled suede-like fabric, wide rounded back cushions,
 *   an angled (chamfered) corner seat, one long flat seat cushion with a welt
 *   along its front, box arms with a padded top, fine vertical channel
 *   stitching and a gold band under the top, splayed gold V legs;
 * - plum velvet three-seater: the same arms and legs, a channel-stitched back;
 * - cushions: plum velvet, plum/white key pattern, beige;
 * - round white-marble coffee table on three tapered gold legs.
 *
 * Dimensions are standard ones fitted to the photo's proportions until the
 * shop provides measurements; hidden sides (backs, undersides) are plain
 * upholstery — they are not visible in the photo and are not claimed exact.
 *
 * Geometry is generated here, not downloaded: every upholstered part is a
 * rounded, slightly filled box (`plushBox`), stitched channels are one fluted
 * strip each (`flutes`), and parts sharing a material merge into one mesh, so
 * a whole sofa is four draw calls.
 *
 * Local frame: +z is the side a sitter faces, y = 0 the floor.
 */

const BEIGE = '#D2C1A5';
const BEIGE_SHADE = '#C4B193';
const PLUM = '#561530';
const PLUM_SHADE = '#4C122A';
const GOLD = '#C9A45C';
const WOOD = '#C7A57E';

const LEG_H = 0.11;
const BASE_H = 0.21;
const SEAT_T = 0.14;
const SEAT_TOP = LEG_H + BASE_H + SEAT_T;
const ARM_H = 0.62;
const ARM_W = 0.26;
const CAP_H = 0.085;
const BACK_T = 0.2;
const BACK_FRAME_TOP = 0.8;
const BACK_PANEL_T = 0.15;
const BACK_TOP = 0.88;
/** Channel width of the stitched flutes on arms and the velvet back. */
const RIB = 0.045;
/** The corner sofa's angled corner, measured along each outer side. */
const CORNER_CUT = 0.4;

type Geo = ThreeNS.BufferGeometry;

interface Parts {
  fabric: Geo[];
  trim: Geo[];
  gold: Geo[];
  wood: Geo[];
}

function at(geo: Geo, x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0): Geo {
  if (rotX) geo.rotateX(rotX);
  if (rotZ) geo.rotateZ(rotZ);
  if (rotY) geo.rotateY(rotY);
  geo.translate(x, y, z);
  return geo;
}

/** Applies a turn about y, then a shift, to every part pushed through it. */
function placer(target: Geo[], rotY: number, dx: number, dz: number): (geo: Geo) => void {
  return (geo) => {
    if (rotY) geo.rotateY(rotY);
    geo.translate(dx, 0, dz);
    target.push(geo);
  };
}

/**
 * An upholstered block: a box whose edges are true quarter-rounds of radius
 * `r` (k segments each) and whose faces swell by `bulge` metres at their
 * centre, the way a filled cushion does. The swell stops at the rounded edge,
 * which leaves a faint crease there, read as the seam. UVs are in metres.
 */
function plushBox(THREE: ThreeModule, w: number, h: number, d: number, r: number, { bulge = 0, k = 3 }: { bulge?: number; k?: number } = {}): Geo {
  const half = [w / 2, h / 2, d / 2] as const;
  const rr = Math.min(r, Math.min(w, h, d) * 0.45);
  const n = 2 * k + 1;
  const box = new THREE.BoxGeometry(w, h, d, n, n, n);
  const pos = box.attributes.position as ThreeNS.BufferAttribute;
  const nor = box.attributes.normal as ThreeNS.BufferAttribute;
  const uv = box.attributes.uv as ThreeNS.BufferAttribute;
  const step = [w / n, h / n, d / n];
  // Grid lines k per edge band, one wide span across the flat middle.
  const remap = (c: number, axis: number): number => {
    const H = half[axis]!;
    const i = Math.round((c + H) / step[axis]!);
    if (i <= k) return -H + rr * (i / k);
    if (i >= n - k) return H - rr * ((n - i) / k);
    return 0;
  };
  for (let v = 0; v < pos.count; v++) {
    const faceN = [nor.getX(v), nor.getY(v), nor.getZ(v)];
    const a = faceN.findIndex((c) => Math.abs(c) > 0.5);
    const p = [remap(pos.getX(v), 0), remap(pos.getY(v), 1), remap(pos.getZ(v), 2)];
    const inner = p.map((c, i) => Math.max(-(half[i]! - rr), Math.min(half[i]! - rr, c)));
    const dv = p.map((c, i) => c - inner[i]!);
    const len = Math.hypot(...dv) || 1;
    const normal = dv.map((c) => c / len);
    const out = inner.map((c, i) => c + normal[i]! * rr);
    if (bulge > 0) {
      const [b, c] = [0, 1, 2].filter((i) => i !== a) as [number, number];
      const sb = half[b]! - rr || 1;
      const sc = half[c]! - rr || 1;
      const u = inner[b]! / sb;
      const t = inner[c]! / sc;
      const fu = 1 - u * u;
      const ft = 1 - t * t;
      out[a] = out[a]! + faceN[a]! * bulge * fu * ft;
      // Tilt the normal with the swell's slope.
      normal[b] = normal[b]! + bulge * (2 * u / sb) * ft;
      normal[c] = normal[c]! + bulge * (2 * t / sc) * fu;
      const l = Math.hypot(...normal) || 1;
      for (let i = 0; i < 3; i++) normal[i] = normal[i]! / l;
    }
    pos.setXYZ(v, out[0]!, out[1]!, out[2]!);
    nor.setXYZ(v, normal[0]!, normal[1]!, normal[2]!);
    const [ua, va] = [0, 1, 2].filter((i) => i !== a).sort((x, y) => half[y]! - half[x]!) as [number, number];
    uv.setXY(v, out[ua]! + half[ua]!, out[va]! + half[va]!);
  }
  return box;
}

/**
 * A strip of stitched channels: `count` rounded flutes side by side, `depth`
 * proud of the surface behind, facing +z, centred on the origin. The flutes
 * tuck in over the last few centimetres at top and bottom, into the seams.
 */
function flutes(THREE: ThreeModule, width: number, height: number, count: number, depth: number, tuck = 0.03): Geo {
  const per = 6;
  const cols = count * per;
  const t = Math.min(tuck, height / 3);
  const ys = [0, 0.35, 0.75, 1].map((f) => -height / 2 + t * f).concat([1, 0.75, 0.35, 0].map((f) => height / 2 - t * f));
  const amp = (row: number): number => {
    const edge = Math.min(row, ys.length - 1 - row);
    return [0, 0.6, 0.88, 1][Math.min(edge, 3)]!;
  };
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < ys.length; row++) {
    for (let i = 0; i <= cols; i++) {
      const x = -width / 2 + (i / cols) * width;
      const frac = (i % per) / per;
      const z = depth * Math.pow(Math.sin(Math.PI * frac), 0.55) * amp(row);
      positions.push(x, ys[row]!, z);
      uvs.push(x + width / 2, ys[row]! + height / 2);
    }
  }
  const stride = cols + 1;
  for (let row = 0; row < ys.length - 1; row++) {
    for (let i = 0; i < cols; i++) {
      const a = row * stride + i;
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** A welt (piping) cord of length `length` along x, centred on the origin. */
function welt(THREE: ThreeModule, length: number, radius = 0.0065): Geo {
  const cord = new THREE.CylinderGeometry(radius, radius, length, 8, 1, true);
  cord.rotateZ(Math.PI / 2);
  return cord;
}

interface ArmSpec {
  /** Arm length, along local z before `rotY`. */
  length: number;
  /** The upholstered outside face: +1 = +x, -1 = -x. */
  outer: 1 | -1;
  /** The end face toward the room: +1 = +z, -1 = -z. */
  front: 1 | -1;
}

/**
 * A box arm: upholstered body with fine vertical channels on its outer side
 * and front, a gold band just under the padded top, the top overhanging a
 * little — as on both sofas in the photo.
 */
function arm(THREE: ThreeModule, parts: Parts, spec: ArmSpec, rotY: number, x: number, z: number): void {
  const { length, outer, front } = spec;
  const bodyH = ARM_H - CAP_H - LEG_H;
  const bodyY = LEG_H + bodyH / 2;
  const fabric = placer(parts.fabric, rotY, x, z);
  const trim = placer(parts.trim, rotY, x, z);
  const gold = placer(parts.gold, rotY, x, z);

  fabric(at(plushBox(THREE, ARM_W, bodyH, length, 0.02, { k: 2 }), 0, bodyY, 0));
  // Channels on the outer side (a strip turned to face ±x) and on the front.
  const fluteH = bodyH - 0.012;
  const side = flutes(THREE, length - 0.02, fluteH, Math.max(4, Math.round(length / RIB)), 0.012);
  trim(at(side, outer * (ARM_W / 2 - 0.002), bodyY - 0.004, 0, outer * Math.PI / 2));
  const face = flutes(THREE, ARM_W - 0.02, fluteH, Math.max(3, Math.round(ARM_W / RIB)), 0.012);
  trim(at(face, 0, bodyY - 0.004, front * (length / 2 - 0.002), front > 0 ? 0 : Math.PI));
  // Gold band at the seam under the top: outer side and front.
  const bandY = LEG_H + bodyH - 0.006;
  gold(at(plushBox(THREE, 0.006, 0.014, length + 0.024, 0.002, { k: 1 }), outer * (ARM_W / 2 + 0.014), bandY, front * 0.006));
  gold(at(plushBox(THREE, ARM_W + 0.034, 0.014, 0.006, 0.002, { k: 1 }), outer * 0.004, bandY, front * (length / 2 + 0.014)));
  // Padded top, overhanging the band.
  fabric(at(plushBox(THREE, ARM_W + 0.04, CAP_H, length + 0.04, 0.034, { bulge: 0.006 }), outer * 0.006, ARM_H - CAP_H / 2, front * 0.008));
}

/** Splayed gold V leg: two tapered rods meeting at the floor, under a small plate. */
function vLeg(THREE: ThreeModule, parts: Parts, x: number, z: number, rotY = 0): void {
  const spread = 0.055;
  const length = Math.hypot(spread, LEG_H);
  const tilt = Math.atan2(spread, LEG_H);
  for (const side of [-1, 1]) {
    const rod = new THREE.CylinderGeometry(0.0085, 0.005, length, 14);
    rod.rotateZ(-side * tilt);
    rod.rotateY(rotY);
    rod.translate(x + Math.cos(rotY) * (side * spread) / 2, LEG_H / 2, z - Math.sin(rotY) * (side * spread) / 2);
    parts.gold.push(rod);
  }
  parts.gold.push(at(plushBox(THREE, 2 * spread + 0.03, 0.008, 0.035, 0.003, { k: 1 }), x, LEG_H - 0.004, z, rotY));
}

/** A short tapered support leg under the middle of a long run. */
function supportLeg(THREE: ThreeModule, parts: Parts, x: number, z: number): void {
  const leg = new THREE.CylinderGeometry(0.022, 0.015, LEG_H, 12);
  leg.translate(x, LEG_H / 2, z);
  parts.wood.push(leg);
}

/** Back cushions standing on the seat along a back, leaning slightly; `widths` left to right. */
function backPanels(
  THREE: ThreeModule,
  target: Geo[],
  widths: readonly number[],
  start: number,
  rotY: number,
  originX: number,
  originZ: number
): void {
  const h = BACK_TOP - SEAT_TOP + 0.04;
  let along = start;
  const place = placer(target, rotY, originX, originZ);
  for (const w of widths) {
    const panel = plushBox(THREE, w - 0.006, h, BACK_PANEL_T, 0.055, { bulge: 0.018 });
    panel.rotateX(-0.07);
    panel.translate(along + w / 2, SEAT_TOP - 0.02 + h / 2, BACK_PANEL_T / 2 - 0.02);
    place(panel);
    along += w;
  }
}

/** The seat cushion, with a welt along its front top edge. */
function seat(THREE: ThreeModule, parts: Parts, w: number, d: number, x: number, z: number, frontRotY = 0): void {
  const y = LEG_H + BASE_H + SEAT_T / 2;
  const r = 0.045;
  const cushion = plushBox(THREE, w, SEAT_T, d, r, { bulge: 0.012 });
  const cord = welt(THREE, w - 2 * r);
  // On the rounded front edge, half way round.
  cord.translate(0, SEAT_T / 2 - r * 0.3, d / 2 - r * 0.3);
  for (const g of [cushion, cord]) {
    g.rotateY(frontRotY);
    g.translate(x, y, z);
  }
  parts.fabric.push(cushion);
  parts.trim.push(cord);
}

function patternTexture(THREE: ThreeModule): ThreeNS.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  // A plum and off-white interlocking key (meander) pattern, as on the photo's patterned cushions.
  g.fillStyle = '#efe6e2';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = '#7a2447';
  g.lineWidth = 9;
  g.lineCap = 'square';
  const cell = size / 4;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * cell;
      const y = row * cell;
      g.save();
      g.translate(x + cell / 2, y + cell / 2);
      g.rotate(((row + col) % 2) * (Math.PI / 2));
      g.beginPath();
      const s = cell / 2 - 6;
      g.moveTo(-s, s);
      g.lineTo(-s, -s);
      g.lineTo(s, -s);
      g.lineTo(s, s * 0.35);
      g.lineTo(-s * 0.3, s * 0.35);
      g.lineTo(-s * 0.3, -s * 0.3);
      g.stroke();
      g.restore();
    }
  }
  // A woven look: faint warp and weft lines over the print.
  g.globalAlpha = 0.07;
  g.fillStyle = '#000';
  for (let i = 0; i < size; i += 3) {
    g.fillRect(i, 0, 1, size);
    g.fillRect(0, i, size, 1);
  }
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  // UVs are metres: one pattern tile per 22 cm of cushion.
  texture.repeat.set(1 / 0.22, 1 / 0.22);
  return markSharedTexture(texture);
}

let sharedPattern: ThreeNS.Texture | null | undefined;

/**
 * A throw cushion `size` square, facing +z: two domed faces meeting in a
 * seam, the sides drawn in a little and the corners left as points, as a
 * filled cushion sits. UVs in metres.
 */
function pillow(THREE: ThreeModule, size: number, thick: number): Geo {
  const N = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const face of [1, -1]) {
    const first = positions.length / 3;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        // Denser toward the seam, where the shape turns.
        const u = Math.sin((i / N - 0.5) * Math.PI);
        const v = Math.sin((j / N - 0.5) * Math.PI);
        const x = (u * size / 2) * (1 - 0.075 * (1 - v * v));
        const y = (v * size / 2) * (1 - 0.075 * (1 - u * u));
        const z = face * (thick / 2) * Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), 0.42);
        positions.push(x, y, z);
        uvs.push(x + size / 2, y + size / 2);
      }
    }
    const stride = N + 1;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = first + j * stride + i;
        if (face > 0) indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        else indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

type CushionKind = 'plum' | 'pattern' | 'beige';

interface Cushion {
  kind: CushionKind;
  x: number;
  z: number;
  /** Which way it faces (yaw). */
  rotY: number;
  /** A little casual twist about its own facing. */
  roll?: number;
  size?: number;
}

function addCushions(ctx: BuilderContext, group: ThreeNS.Group, cushions: readonly Cushion[]): void {
  const { THREE, hasCollision, opacity } = ctx;
  if (sharedPattern === undefined) sharedPattern = patternTexture(THREE);
  const mats: Record<CushionKind, ThreeNS.Material> = {
    plum: velvet(ctx, PLUM),
    pattern: hasCollision || !sharedPattern
      ? surfaceMaterial(ctx, hasCollision ? 0xff0000 : '#b98a98', 'fabric')
      : new THREE.MeshPhysicalMaterial({
        color: 0xffffff, map: sharedPattern, roughness: 0.88, metalness: 0,
        sheen: 0.5, sheenColor: new THREE.Color('#f3e6ea'), sheenRoughness: 0.7, opacity,
      }),
    beige: suede(ctx, '#D8C8AD'),
  };
  for (const c of cushions) {
    const s = c.size ?? 0.45;
    const cushion = mesh(THREE, pillow(THREE, s, 0.17), mats[c.kind]);
    cushion.rotation.order = 'YXZ';
    cushion.rotation.set(-0.3, c.rotY, c.roll ?? 0);
    cushion.position.set(c.x, SEAT_TOP + s / 2 - 0.04, c.z);
    group.add(cushion);
  }
}

/** Velvet: deep colour, a soft lighter sheen at grazing angles, the pile shows as a fine grain. */
function velvet(ctx: BuilderContext, color: string): ThreeNS.Material {
  const { THREE, hasCollision, opacity } = ctx;
  if (hasCollision) return surfaceMaterial(ctx, 0xff0000, 'fabric');
  const base = surfaceMaterial(ctx, color, 'fabric', { detailed: true });
  const physical = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    sheen: 0.75,
    sheenColor: new THREE.Color('#9c4a6c'),
    sheenRoughness: 0.42,
    transparent: false,
    opacity,
    ...(base.map ? { map: base.map, bumpMap: base.map, bumpScale: 0.35 } : {}),
  });
  base.dispose();
  return physical;
}

/** Suede-like microfibre, as on the beige corner sofa: matte, a pale nap sheen, a mottled grain. */
function suede(ctx: BuilderContext, color: string): ThreeNS.Material {
  const { THREE, hasCollision, opacity } = ctx;
  if (hasCollision) return surfaceMaterial(ctx, 0xff0000, 'fabric');
  const base = surfaceMaterial(ctx, color, 'fabric', { detailed: true });
  const physical = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    sheen: 0.6,
    sheenColor: new THREE.Color('#f4ead8'),
    sheenRoughness: 0.55,
    transparent: false,
    opacity,
    ...(base.map ? { map: base.map, bumpMap: base.map, bumpScale: 0.5 } : {}),
  });
  base.dispose();
  return physical;
}

function finish(ctx: BuilderContext, parts: Parts, upholstery: ThreeNS.Material, trimMat: ThreeNS.Material): ThreeNS.Group {
  const { THREE, hasCollision } = ctx;
  const group = new THREE.Group();
  const gold = surfaceMaterial(ctx, hasCollision ? 0xff0000 : GOLD, 'brushedMetal');
  gold.roughness = 0.26;
  const wood = surfaceMaterial(ctx, hasCollision ? 0xff0000 : WOOD, 'woodOiled');
  const add = (geos: Geo[], mat: ThreeNS.Material) => {
    if (geos.length > 0) group.add(mesh(THREE, mergeParts(THREE, geos), mat));
  };
  add(parts.fabric, upholstery);
  add(parts.trim, trimMat);
  add(parts.gold, gold);
  add(parts.wood, wood);
  return group;
}

const newParts = (): Parts => ({ fabric: [], trim: [], gold: [], wood: [] });

/** Turns a non-indexed geometry (ExtrudeGeometry) into an indexed one for mergeParts. */
function indexed(geo: Geo): Geo {
  if (!geo.index) geo.setIndex(Array.from({ length: geo.attributes.position!.count }, (_, i) => i));
  return geo;
}

/**
 * Corner sofa, main section: the long run with its back along local -z, the
 * angled corner at the left end (back on the left too) and a box arm at the
 * right end. The return module stands in front of its left end.
 */
export function buildRayenCornerMain(ctx: BuilderContext): ThreeNS.Group {
  const { THREE, item } = ctx;
  const W = item.width;
  const D = item.depth;
  const parts = newParts();
  const left = -W / 2;
  const right = W / 2 - ARM_W;
  const back = -D / 2;
  const c = CORNER_CUT;

  // Base platform: the footprint with the corner cut off, bevelled all round.
  const bevel = 0.025;
  const outline = new THREE.Shape();
  // Shape (x, y) = world (x, -z): extruded along +z, then laid flat.
  const pts: Array<[number, number]> = [
    [left + c, -back], [right, -back], [right, -D / 2], [left, -D / 2], [left, -back - c],
  ];
  pts.forEach(([x, y], i) => {
    // Inset by the bevel, which grows the outline back out.
    const ix = x + (x < (left + right) / 2 ? bevel : -bevel);
    const iy = y + (y > 0 ? -bevel : bevel);
    if (i === 0) outline.moveTo(ix, iy);
    else outline.lineTo(ix, iy);
  });
  outline.closePath();
  const base = new THREE.ExtrudeGeometry(outline, {
    depth: BASE_H - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1,
  });
  base.rotateX(-Math.PI / 2);
  base.translate(0, LEG_H + bevel, 0);
  parts.fabric.push(indexed(base));

  // Back frame: the long back, the left back, and the diagonal between them.
  const frameH = BACK_FRAME_TOP - LEG_H;
  const frameY = (LEG_H + BACK_FRAME_TOP) / 2;
  parts.fabric.push(at(plushBox(THREE, right - (left + c) + 0.05, frameH, BACK_T, 0.04), (left + c + right) / 2 - 0.025, frameY, back + BACK_T / 2));
  parts.fabric.push(at(plushBox(THREE, BACK_T, frameH, D - c + 0.05, 0.04), left + BACK_T / 2, frameY, (back + c + D / 2) / 2 - 0.025));
  const diag = Math.SQRT1_2;
  // Outer chamfer line from (left, back + c) to (left + c, back); the frame sits inside it.
  parts.fabric.push(at(plushBox(THREE, c * Math.SQRT2 + 0.08, frameH, BACK_T, 0.04), left + c / 2 + diag * BACK_T / 2, frameY, back + c / 2 + diag * BACK_T / 2, Math.PI / 4));

  // One long seat cushion, as in the photo; the corner wedge under the back cushions.
  seat(THREE, parts, right - left - BACK_T, D - BACK_T, (left + BACK_T + right) / 2, BACK_T / 2);

  // Back cushions. Where the inner face of the diagonal meets the straight backs:
  const meet = c + BACK_T * Math.SQRT2 - BACK_T;
  const x0 = left + meet;
  const run = right - x0;
  const wide = run / 4;
  backPanels(THREE, parts.fabric, [wide, wide, wide, wide], x0, 0, 0, back + BACK_T - 0.04);
  // The left back, facing +x (built along x, turned a quarter: along-x becomes -z).
  backPanels(THREE, parts.fabric, [D / 2 - (back + meet)], -D / 2, Math.PI / 2, left + BACK_T - 0.04, 0);
  // The angled corner cushion, on the inner face of the diagonal.
  const span = (meet - BACK_T) * Math.SQRT2;
  const midX = left + (BACK_T + meet) / 2 - diag * 0.04;
  const midZ = back + (BACK_T + meet) / 2 - diag * 0.04;
  backPanels(THREE, parts.fabric, [span + 0.06], -(span + 0.06) / 2, Math.PI / 4, midX, midZ);

  arm(THREE, parts, { length: D, outer: 1, front: 1 }, 0, W / 2 - ARM_W / 2, 0);

  vLeg(THREE, parts, W / 2 - 0.07, D / 2 - 0.06);
  vLeg(THREE, parts, W / 2 - 0.07, -D / 2 + 0.06);
  vLeg(THREE, parts, left + c * 0.5 + 0.05, back + c * 0.5 + 0.05, Math.PI / 4);
  for (const x of [-0.6, 0.45]) {
    supportLeg(THREE, parts, x, D / 2 - 0.08);
    supportLeg(THREE, parts, x, -D / 2 + 0.08);
  }

  const group = finish(ctx, parts, suede(ctx, BEIGE), suede(ctx, BEIGE_SHADE));
  const backZ = back + BACK_T + 0.15;
  addCushions(ctx, group, [
    { kind: 'beige', x: midX + diag * 0.2, z: midZ + diag * 0.2, rotY: Math.PI / 4, roll: 0.04 },
    { kind: 'pattern', x: right - 1.05, z: backZ, rotY: 0, roll: -0.04 },
    { kind: 'plum', x: right - 0.62, z: backZ, rotY: 0, roll: 0.05, size: 0.47 },
    { kind: 'pattern', x: right - 0.2, z: backZ, rotY: 0, roll: 0.06 },
  ]);
  return group;
}

/**
 * Corner sofa, return module: back along local -x (it continues the main
 * section's left back), seat facing +x, box arm across its +z end.
 */
export function buildRayenCornerReturn(ctx: BuilderContext): ThreeNS.Group {
  const { THREE, item } = ctx;
  const W = item.width;
  const D = item.depth;
  const parts = newParts();
  const front = D / 2 - ARM_W;
  const len = front + D / 2;

  parts.fabric.push(at(plushBox(THREE, W, BASE_H, len, 0.025), 0, LEG_H + BASE_H / 2, -D / 2 + len / 2));
  parts.fabric.push(at(plushBox(THREE, BACK_T, BACK_FRAME_TOP - LEG_H, len, 0.04), -W / 2 + BACK_T / 2, (LEG_H + BACK_FRAME_TOP) / 2, -D / 2 + len / 2));
  // Seat, its welt on the edge toward the room (+x): built facing +z, turned a quarter.
  seat(THREE, parts, len, W - BACK_T, BACK_T / 2, -D / 2 + len / 2, Math.PI / 2);
  backPanels(THREE, parts.fabric, [len / 2, len / 2], -front, Math.PI / 2, -W / 2 + BACK_T - 0.04, 0);

  // The arm runs across the module (along x): built along z, turned a quarter.
  arm(THREE, parts, { length: W, outer: 1, front: -1 }, -Math.PI / 2, 0, D / 2 - ARM_W / 2);

  vLeg(THREE, parts, W / 2 - 0.06, D / 2 - 0.07, Math.PI / 2);
  vLeg(THREE, parts, -W / 2 + 0.06, D / 2 - 0.07, Math.PI / 2);
  supportLeg(THREE, parts, W / 2 - 0.08, -D / 2 + 0.1);
  supportLeg(THREE, parts, -W / 2 + 0.08, -D / 2 + 0.1);

  const group = finish(ctx, parts, suede(ctx, BEIGE), suede(ctx, BEIGE_SHADE));
  const backX = -W / 2 + BACK_T + 0.15;
  addCushions(ctx, group, [
    { kind: 'plum', x: backX, z: front - 0.3, rotY: Math.PI / 2, roll: 0.06, size: 0.47 },
    { kind: 'pattern', x: backX, z: front - 0.72, rotY: Math.PI / 2, roll: -0.05 },
    { kind: 'plum', x: backX, z: -D / 2 + 0.2, rotY: Math.PI / 2 + 0.2, roll: 0.04 },
  ]);
  return group;
}

/** Plum velvet three-seater: box arms both ends, a channel-stitched back. */
export function buildRayenSofaThree(ctx: BuilderContext): ThreeNS.Group {
  const { THREE, item } = ctx;
  const W = item.width;
  const D = item.depth;
  const parts = newParts();
  const inner = W - 2 * ARM_W;

  parts.fabric.push(at(plushBox(THREE, inner, BASE_H, D, 0.025), 0, LEG_H + BASE_H / 2, 0));
  parts.fabric.push(at(plushBox(THREE, inner, BACK_FRAME_TOP - LEG_H, BACK_T, 0.04), 0, (LEG_H + BACK_FRAME_TOP) / 2, -D / 2 + BACK_T / 2));
  seat(THREE, parts, inner, D - BACK_T, 0, BACK_T / 2);

  // The back: one rolled cushion across, vertical channels stitched over its face.
  const h = BACK_TOP - SEAT_TOP + 0.04;
  const backZ = -D / 2 + BACK_T - 0.04 + BACK_PANEL_T / 2 - 0.02;
  const backY = SEAT_TOP - 0.02 + h / 2;
  const cushion = plushBox(THREE, inner - 0.006, h, BACK_PANEL_T, 0.07);
  // Kept to the flat of the face, inside the cushion's rounded edges.
  const channels = flutes(THREE, inner - 0.12, h - 0.11, Math.round((inner - 0.12) / 0.1), 0.018, 0.04);
  channels.translate(0, -0.01, BACK_PANEL_T / 2 - 0.003);
  for (const [g, target] of [[cushion, parts.fabric], [channels, parts.trim]] as const) {
    g.rotateX(-0.07);
    g.translate(0, backY, backZ);
    target.push(g);
  }

  arm(THREE, parts, { length: D, outer: 1, front: 1 }, 0, W / 2 - ARM_W / 2, 0);
  arm(THREE, parts, { length: D, outer: -1, front: 1 }, 0, -W / 2 + ARM_W / 2, 0);
  for (const sx of [-1, 1]) {
    vLeg(THREE, parts, sx * (W / 2 - 0.08), D / 2 - 0.06);
    vLeg(THREE, parts, sx * (W / 2 - 0.08), -D / 2 + 0.06);
  }
  supportLeg(THREE, parts, 0, -D / 2 + 0.08);

  const group = finish(ctx, parts, velvet(ctx, PLUM), velvet(ctx, PLUM_SHADE));
  const pillowZ = -D / 2 + BACK_T + 0.15;
  addCushions(ctx, group, [
    { kind: 'beige', x: -0.42, z: pillowZ, rotY: 0.08, roll: 0.07 },
    { kind: 'beige', x: 0.08, z: pillowZ, rotY: -0.05, roll: -0.05 },
  ]);
  return group;
}

/** Round white-marble coffee table on three tapered, slightly splayed gold legs. */
export function buildRayenCoffeeTable(ctx: BuilderContext): ThreeNS.Group {
  const { THREE, item, hasCollision, opacity } = ctx;
  const group = new THREE.Group();
  const r = item.width / 2;
  const topT = 0.03;
  const map = hasCollision ? null : marbleTexture(THREE);
  // Polished stone: a clear-coat gloss over a matte-ish base.
  const marble = hasCollision
    ? material(THREE, 0xff0000, true, opacity)
    : new THREE.MeshPhysicalMaterial({
      color: '#EEECE8', roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, opacity,
      ...(map ? { map } : {}),
    });
  const edgeR = topT / 2;
  const top = mesh(THREE, new THREE.CylinderGeometry(r - edgeR, r - edgeR, topT, 96), marble);
  top.position.y = item.height - topT / 2;
  group.add(top);
  // The rounded edge all round the top.
  const edge = mesh(THREE, new THREE.TorusGeometry(r - edgeR, edgeR, 10, 96), marble);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = item.height - topT / 2;
  group.add(edge);
  const gold = surfaceMaterial(ctx, hasCollision ? 0xff0000 : GOLD, 'brushedMetal');
  gold.roughness = 0.26;
  const legH = item.height - topT;
  const inset = r * 0.62;
  const splay = 0.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const length = Math.hypot(legH, splay);
    const leg = mesh(THREE, new THREE.CylinderGeometry(0.014, 0.008, length, 16), gold);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    leg.position.set(dx * (inset + splay / 2), legH / 2, dz * (inset + splay / 2));
    // Lean the foot outward.
    leg.rotation.set(-dz * Math.atan2(splay, legH), 0, dx * Math.atan2(splay, legH));
    group.add(leg);
  }
  return group;
}

let sharedMarble: ThreeNS.Texture | null | undefined;

function marbleTexture(THREE: ThreeModule): ThreeNS.Texture | null {
  if (sharedMarble !== undefined) return sharedMarble;
  sharedMarble = null;
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#f2f1ee';
  g.fillRect(0, 0, size, size);
  // Faint grey veining, as on the photo's tabletop. Seeded: the same every load.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  for (let v = 0; v < 9; v++) {
    g.strokeStyle = `rgba(150,150,150,${0.12 + rand() * 0.14})`;
    g.lineWidth = 0.6 + rand() * 1.8;
    g.beginPath();
    let x = rand() * size;
    let y = 0;
    g.moveTo(x, y);
    while (y < size) {
      x += (rand() - 0.45) * 40;
      y += 18 + rand() * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sharedMarble = markSharedTexture(texture);
  return sharedMarble;
}
