/* =====================================================================
   Booster Pack — live 3D preview of a flow-wrapped booster pack.
   Front art (1 image) · back art (2 halves split by the fin-seal flap)
   · flap image (optional)
   · PACK material (metallic / foil / matte) — the film, seen where the art is transparent
   · FILL material (ink / metallic / foil / matte) — used by artwork slots in "Alpha → fill" mode
   · up to 4 extra mask textures that change the material.
   Units: millimetres everywhere (1 three.js unit = 1 mm).
   ===================================================================== */
(function(){
'use strict';
var T = window.THREE;
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return [].slice.call((r || document).querySelectorAll(s)); };

if (!T) { showError('three.js did not load (vendor/three.bundle.js missing).'); return; }

/* ----------------------------------------------------------------- state */
var PXMM = 16;                       // recommended print density: 16 px per mm (≈ 406 dpi)
var MAX_FX = 4;
var STORE = 'booster-pack-settings-v2';

var MAT_ID = { metal:0, matte:1, foil:3, ink:5 };
// PACK material presets
var MAT_DEF = {
  metal: { baseColor:'#d4d6da', baseRough:0.2,  inkRough:0.36, lam:0.55 },
  foil:  { baseColor:'#f2f3f6', baseRough:0.12, inkRough:0.36, lam:0.55 },
  matte: { baseColor:'#f3f1ec', baseRough:0.82, inkRough:0.72, lam:0 }
};
// FILL material presets (artwork slots in Alpha → fill)
var FILL_DEF = {
  ink:   { fColor:'#1c1b19', fRough:0.36 },
  metal: { fColor:'#d9dbe0', fRough:0.16 },
  foil:  { fColor:'#ffffff', fRough:0.1 },
  matte: { fColor:'#1c1b19', fRough:0.85 }
};
// foil textures (inspired by a hot-stamping foil shade card): [key, label, default size mm, default density]
var FOILS = [
  ['chroma',  'Chromatic (iridescent)',      60, 1],
  ['liquid',  'Holographic liquid',          45, 4.5],
  ['glitter', 'Glitter sparkle',             8, 10],
  ['prism',   'Shattered prism (cracked ice)', 30, 4],
  ['waves',   'Wave lines',                  22, 7],
  ['star',    'Starburst',                   36, 24],
  ['pixel',   'Pixel mosaic',                12, 6]
];
function foilIndex(key){ for (var i = 0; i < FOILS.length; i++) if (FOILS[i][0] === key) return i; return 0; }

function defSlotCfg(){ return { mode:'color', inv:false }; }
var CFG_STORE = 'booster-pack-slots-v2';
var CFG = { front:defSlotCfg(), backA:defSlotCfg(), backB:defSlotCfg(), flap:defSlotCfg() };
try { var savedCfg = JSON.parse(localStorage.getItem(CFG_STORE) || 'null'); if (savedCfg) for (var sk in CFG) if (savedCfg[sk]) Object.assign(CFG[sk], savedCfg[sk]); } catch(e){}
var DEF = {
  W:72, H:128, layout:'v',
  puff:2.6, crimp:5.5, trans:5.5, pitch:1.75, teeth:1, ridge:0.98, wrinkle:2,
  flapW:9, flapSide:'B', flapOpen:7, flapMode:'0', guides:false,
  // PACK material
  mat:'metal', baseColor:MAT_DEF.metal.baseColor, baseRough:MAT_DEF.metal.baseRough,
  foilType:'liquid', foilSize:45, foilDensity:4.5, foilRelief:1, foilShift:1, foilSeed:0,
  // print (full-colour artwork) + laminate
  inkRough:MAT_DEF.metal.inkRough, lam:MAT_DEF.metal.lam,
  // FILL material
  fMat:'foil', fColor:FILL_DEF.foil.fColor, fRough:FILL_DEF.foil.fRough,
  fFoilType:'liquid', fFoilSize:45, fFoilDensity:4.5, fFoilRelief:1, fFoilShift:1, fFoilSeed:0,
  fit:'fill',
  env:'studio', envInt:1, envRot:0, exposure:1, tilt:14, idle:true,
  bg:'#efede8', transparent:false
};
var S = Object.assign({}, DEF);
try { var saved = JSON.parse(localStorage.getItem(STORE) || 'null'); if (saved) for (var k in DEF) if (k in saved) S[k] = saved[k]; } catch(e){}
if (!MAT_ID.hasOwnProperty(S.mat) || S.mat === 'ink') S.mat = 'metal';
if (!FILL_DEF[S.fMat]) S.fMat = 'foil';
function persist(){ try { localStorage.setItem(STORE, JSON.stringify(S)); localStorage.setItem(CFG_STORE, JSON.stringify(CFG)); } catch(e){} }

var SLOTS = ['front', 'backA', 'backB', 'flap'];
var IMG = { front:null, backA:null, backB:null, flap:null };   // {tex, url, name, w, h}
var FX = [];                                                    // effect layers
var fxSeq = 0;

var FX_TYPES = [
  ['foil',    'Metallic foil (hot-stamp)'],
  ['liquid',  'Holographic foil (liquid)'],
  ['holo',    'Rainbow sheen (smooth)'],
  ['emboss',  'Emboss (relief)'],
  ['gloss',   'Spot gloss varnish (UV)'],
  ['mattev',  'Matte varnish'],
  ['ink',     'Ink tint / watermark']
];
var FX_INDEX = { foil:0, holo:1, emboss:2, gloss:3, mattev:4, ink:5, liquid:6 };

/* ------------------------------------------------------------- renderer */
var canvas = $('#cv'), stage = $('#stage');
var renderer;
try {
  renderer = new T.WebGLRenderer({ canvas:canvas, antialias:true, alpha:true, preserveDrawingBuffer:false });
} catch(e) { showError('WebGL is not available in this browser.'); return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.NeutralToneMapping;
var maxAniso = renderer.capabilities.getMaxAnisotropy();

var scene = new T.Scene();
var camera = new T.PerspectiveCamera(28, 1, 1, 5000);
var tiltG = new T.Group(), flipG = new T.Group();
scene.add(tiltG); tiltG.add(flipG);

var keyLight = new T.DirectionalLight(0xffffff, 0.6);
keyLight.position.set(-200, 260, 420);
scene.add(keyLight);

/* environments: a studio with soft-boxes (crisp foil highlights) and three's RoomEnvironment */
var pmrem = new T.PMREMGenerator(renderer);
var ENV = {};
function studioScene(){
  var sc = new T.Scene();
  var room = new T.Mesh(new T.SphereGeometry(60, 48, 24), new T.ShaderMaterial({
    side:T.BackSide, depthWrite:false,
    vertexShader:'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'varying vec3 vP; void main(){ vec3 d = normalize(vP); float y = d.y;' +
      ' vec3 c = mix(vec3(0.42,0.42,0.43), vec3(0.10,0.10,0.11), smoothstep(-0.2,0.95,y));' +
      ' c = mix(vec3(0.16,0.155,0.15), c, smoothstep(-0.9,-0.1,y));' +
      ' c += vec3(0.25) * smoothstep(0.2, 1.0, d.z) * (1.0 - abs(y));' +
      ' gl_FragColor = vec4(c,1.0); }'
  }));
  sc.add(room);
  function box(x, y, z, w, h, inten, tint){
    var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color:new T.Color(tint || 0xffffff).multiplyScalar(inten), side:T.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m);
  }
  box(-10, 12, 26, 22, 12, 4.5);       // key soft-box, top-left front (what the face mirrors when tilted up/left)
  box(  4,  1, 34, 14, 7, 1.6);        // big diffuser right behind the camera
  box( 22,  0, 18,  5, 26, 3.2);       // tall strip, right
  box(  2, 28,  6, 26, 6, 2.6);        // overhead
  box(-24, -8, 12,  4, 16, 1.8, 0xfff1e0); // warm fill low-left
  box(  0,  6,-26, 30, 8, 2.2);        // rim behind
  box(  8,-20, 18, 22, 5, 1.1);        // floor bounce
  return sc;
}
function getEnv(name){
  if (ENV[name]) return ENV[name];
  var sc = name === 'room' ? new T.RoomEnvironment() : studioScene();
  ENV[name] = pmrem.fromScene(sc, name === 'room' ? 0.035 : 0.015).texture;
  return ENV[name];
}

/* ------------------------------------------------------------- textures */
function blankTex(){
  var t = new T.DataTexture(new Uint8Array([0,0,0,0]), 1, 1, T.RGBAFormat);
  t.needsUpdate = true; return t;
}
var BLANK = blankTex();

/* ------------------------------------------------------------- uniforms */
// Two independent material sets:
//   PACK  (uMat …)  = the film itself, visible where the artwork is transparent
//   FILL  (uFMat …) = the colour/material used by artwork slots in "Alpha → fill" mode
// material ids: 0 metallic · 1 matte · 3 foil · 5 ink (fill only)
// foil params: A = (foil type, pattern size mm, density, relief) · B = (colour shift, seed x, seed y, 0)
var U = {
  uW:{value:S.W}, uH:{value:S.H}, uVert:{value:1}, uCrimp:{value:9}, uTeeth:{value:1}, uPitch:{value:1},
  uRidge:{value:1}, uWrinkle:{value:1}, uTrans:{value:14},
  uMat:{value:0}, uBaseColor:{value:new T.Color()}, uBaseRough:{value:0.2},
  uFoilA:{value:new T.Vector4(0,60,1,1)}, uFoilB:{value:new T.Vector4(1,0,0,0)},
  uFMat:{value:5}, uFColor:{value:new T.Color()}, uFRough:{value:0.36},
  uFFoilA:{value:new T.Vector4(1,45,4.5,1)}, uFFoilB:{value:new T.Vector4(1,0,0,0)},
  uInkRough:{value:0.4}, uLam:{value:0.5}, uFlapMode:{value:0}, uFlapDir:{value:-1},
  uFlapW:{value:8}, uGuides:{value:0},
  uSlotB:{value:[0,1,2,3].map(function(){ return new T.Vector4(0,0,0,0); })},   // mode (1 = alpha → fill), invert alpha
  tFront:{value:BLANK}, tBackA:{value:BLANK}, tBackB:{value:BLANK}, tFlap:{value:BLANK},
  uXfFront:{value:new T.Vector4(1,1,0,0)}, uXfA:{value:new T.Vector4(1,1,0,0)}, uXfB:{value:new T.Vector4(1,1,0,0)}, uXfFlap:{value:new T.Vector4(1,1,0,0)},
  uHasFront:{value:0}, uHasA:{value:0}, uHasB:{value:0}, uHasFlap:{value:0},
  tFx0:{value:BLANK}, tFx1:{value:BLANK}, tFx2:{value:BLANK}, tFx3:{value:BLANK},
  uFxA:{value:[0,1,2,3].map(function(){ return new T.Vector4(0,2,0,0); })},   // type, face, amount, on
  uFxB:{value:[0,1,2,3].map(function(){ return new T.Vector4(0,0,0,1); })},   // repX, repY (0 = stretch), invert, channel (1 alpha / 0 luma)
  uFxC:{value:[0,1,2,3].map(function(){ return new T.Color(1,1,1); })},
  uFxT:{value:[0,1,2,3].map(function(){ return new T.Vector2(0.001,0.001); })}
};

/* --------------------------------------------------------------- shader */
var GLSL_PARS = [
'uniform float uW, uH, uVert, uCrimp, uTeeth, uPitch, uRidge, uWrinkle, uTrans;',
'uniform float uMat, uBaseRough, uFMat, uFRough;',
'uniform vec3 uBaseColor, uFColor;',
'uniform vec4 uFoilA, uFoilB, uFFoilA, uFFoilB;',
'uniform float uInkRough, uLam, uFlapMode, uFlapDir, uFlapW, uGuides;',
'uniform vec4 uSlotB[4];',
'uniform sampler2D tFront, tBackA, tBackB, tFlap, tFx0, tFx1, tFx2, tFx3;',
'uniform vec4 uXfFront, uXfA, uXfB, uXfFlap;',
'uniform float uHasFront, uHasA, uHasB, uHasFlap;',
'uniform vec4 uFxA[4]; uniform vec4 uFxB[4]; uniform vec3 uFxC[4]; uniform vec2 uFxT[4];',
'varying vec2 vXY; varying float vFace; varying vec3 vTx; varying vec3 vTy; varying vec2 vUv2;',
'float pkHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }',
'vec2 pkHash2(vec2 p){ return vec2(pkHash(p), pkHash(p + 17.31)); }',
'float pkNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);',
'  return mix(mix(pkHash(i), pkHash(i+vec2(1.0,0.0)), u.x), mix(pkHash(i+vec2(0.0,1.0)), pkHash(i+vec2(1.0,1.0)), u.x), u.y); }',
'float pkFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*pkNoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }',
'float pkFbmS(vec2 p){ float s = 0.0, a = 0.6; for (int i = 0; i < 3; i++){ s += a*pkNoise(p); p = p*1.9 + 11.7; a *= 0.38; } return s / 0.887; }',
'vec3 pkRainbow(float h){ return 0.5 + 0.5*cos(6.2831853*(h + vec3(0.0, 0.33, 0.67))); }',
'vec4 pkArt(sampler2D t, vec2 uv, vec4 xf, float has){',
'  vec2 q = (uv - 0.5)*xf.xy + 0.5 + xf.zw;',
'  vec4 c = texture2D(t, q);',
'  vec2 ins = step(vec2(0.0), q) * step(q, vec2(1.0));',
'  return c * ins.x * ins.y * has; }',
'float pkHeight(vec2 xy, float face){',
'  float across = mix(xy.y, xy.x, uVert), along = mix(xy.x, xy.y, uVert);',
'  float dEnd = mix(uW, uH, uVert)*0.5 - abs(along);',
'  float h = 0.0;',
'  float inC = 1.0 - smoothstep(uCrimp - 0.5, uCrimp + 0.3, dEnd);',
'  h += inC * uRidge * 0.07 * sin(across * 6.2831853 / uPitch);',
'  float tz = dEnd - uCrimp;',
'  float wz = smoothstep(-0.3, 1.2, tz) * exp(-max(tz, 0.0) / max(uTrans*0.55, 0.5));',
'  float wn = pkNoise(vec2(across*0.12, along*0.05 + face*7.0));',
'  float wv = sin(across*0.78 + wn*9.0 + pkNoise(vec2(across*0.05, along*0.3))*4.0);',
'  h += uWrinkle * wz * 0.3 * wv * (0.35 + 0.65*pkNoise(vec2(across*0.09, along*0.02 + 5.0 + face*3.0)));',
'  h += uWrinkle * 0.05 * pkFbm(xy*0.12 + face*11.0);',
'  if (face > 1.5 && face < 2.5) h += 0.04 * sin((across + along)*1.9) * sin((across - along)*1.9);',
'  return h; }',
'float pkMask(vec4 t, float inv, float chan){',
'  float m = chan > 0.5 ? t.a : dot(t.rgb, vec3(0.299, 0.587, 0.114)) * t.a;',
'  return inv > 0.5 ? 1.0 - m : m; }',
'float pkLine(float d, float w){ return 1.0 - clamp(abs(d) / max(fwidth(d)*w, 1e-4), 0.0, 1.0); }',

/* ---------- foils: 0 chromatic · 1 holographic liquid · 2 glitter · 3 shattered prism · 4 wave lines · 5 starburst · 6 pixel mosaic */
'float pkLiquidField(vec2 xy, vec4 A, vec4 B){',
'  vec2 p = xy / max(A.y, 1.0) + B.yz;',
'  vec2 q = vec2(pkFbmS(p), pkFbmS(p + vec2(5.2, 1.3)));',
'  vec2 r = vec2(pkFbmS(p + 2.2*q + vec2(1.7, 9.2)), pkFbmS(p + 2.2*q + vec2(8.3, 2.8)));',
'  return pkFbmS(p + 2.6*r); }',
'vec3 pkVoro(vec2 p){',                         // xy = cell id, z = distance to the cell border
'  vec2 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0; vec2 id = ip;',
'  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){',
'    vec2 g = vec2(float(i), float(j)); vec2 r = g + pkHash2(ip + g) - fp; float d = dot(r, r);',
'    if (d < d1){ d2 = d1; d1 = d; id = ip + g; } else if (d < d2) d2 = d;',
'  }',
'  return vec3(id, sqrt(d2) - sqrt(d1)); }',
'float pkCell(vec4 A){ return max(A.y / max(A.z, 0.1), 0.15); }',   // cell size (mm) for glitter / prism / pixel
'float pkWavePhase(vec2 xy, vec4 A){ float sp = pkCell(A); return (xy.y + sin(xy.x * 6.2831853 / max(A.y, 1.0)) * sp * 0.9) / sp * 6.2831853; }',
'vec2 pkStarLocal(vec2 xy, vec4 A, vec4 B){ return xy - (floor(xy / A.y + B.yz) + 0.5 - B.yz) * A.y; }',
// relief gradient (mm/mm) of the foil surface
'vec2 pkFoilGrad(vec2 xy, vec4 A, vec4 B){',
'  float t = A.x, rel = A.w;',
'  if (t > 0.5 && t < 1.5) {',
'    float f = pkLiquidField(xy, A, B), e = 0.2;',
'    vec2 gf = vec2(pkLiquidField(xy + vec2(e, 0.0), A, B) - f, pkLiquidField(xy + vec2(0.0, e), A, B) - f) / e;',
'    return rel * 0.06 * A.z * 3.14159 * cos(f * A.z * 3.14159) * gf; }',
'  if (t > 1.5 && t < 2.5) { vec2 id = floor(xy / pkCell(A) + B.yz); return (pkHash2(id) - 0.5) * rel * 0.3; }',
'  if (t > 2.5 && t < 3.5) { vec3 v = pkVoro(xy / pkCell(A) + B.yz); return (pkHash2(v.xy) - 0.5) * rel * 0.5; }',
'  if (t > 3.5 && t < 4.5) {',
'    float sp = pkCell(A), ph = pkWavePhase(xy, A), c = cos(ph) * rel * 0.05 * 6.2831853 / sp;',
'    return vec2(c * cos(xy.x * 6.2831853 / max(A.y, 1.0)) * 6.2831853 / max(A.y, 1.0) * sp * 0.9, c); }',
'  if (t > 4.5 && t < 5.5) { vec2 l = pkStarLocal(xy, A, B); float th = atan(l.y, l.x); return normalize(l + 1e-4) * sin(th * A.z) * rel * 0.12; }',
'  if (t > 5.5) { vec2 id = floor(xy / pkCell(A) + B.yz); return (pkHash2(id + 3.1) - 0.5) * rel * 0.45; }',
'  return vec2(0.0); }',
// colour multiplier of the foil (tinted later by the material colour), roughness and a little glow
'vec3 pkFoilShade(vec2 xy, vec4 A, vec4 B, vec3 n, vec3 V, inout float rough, inout vec3 glow){',
'  float t = A.x, sh = B.x;',
'  float vs = (n.x * 1.6 + n.y * 1.1) * sh;',                     // changes as the pack tilts
'  if (t < 0.5) {',
'    float h = vs + (1.0 - dot(n, V)) * 2.0 * sh + pkFbm(xy / max(A.y, 1.0) * 1.8 + B.yz) * 1.1 + dot(xy, vec2(0.0035, 0.006));',
'    return mix(vec3(1.0), pkRainbow(h), 0.72); }',
'  if (t < 1.5) {',
'    float f = pkLiquidField(xy, A, B);',
'    float s = f * A.z, d = abs(fract(s + 0.5) - 0.5), w = 0.05 + fwidth(s) * 0.75;',
'    float line = 1.0 - smoothstep(w * 0.35, w, d), halo = exp(-d * 9.0);',
'    vec3 rb = clamp(mix(pkRainbow(f * 1.6 + vs + dot(xy, vec2(0.004, 0.007))), vec3(1.0), 0.12) * 1.15, 0.0, 1.0);',
'    float band = 0.5 + 0.5*sin(s * 6.2831853 + 1.3);',
'    vec3 between = mix(vec3(0.26, 0.33, 0.42), vec3(0.9, 0.92, 0.96), smoothstep(0.15, 0.95, band));',
'    between = mix(between, between * mix(vec3(1.0), rb, 0.55), 0.6);',
'    rough = mix(rough, 0.05, line);',
'    glow += rb * (line * 0.32 + halo * 0.1);',
'    return mix(between, rb, clamp(line + halo * 0.55, 0.0, 1.0)); }',
'  if (t < 2.5) {',
'    vec2 id = floor(xy / pkCell(A) + B.yz); vec2 hs = pkHash2(id + 7.7);',
'    vec3 rb = pkRainbow(hs.x + vs * 1.4);',
'    float sp = smoothstep(0.8, 1.0, 0.5 + 0.5*sin(hs.y * 60.0 + vs * 7.0 + hs.x * 9.0));',   // only some flakes catch the light
'    glow += rb * sp * 0.55;',
'    vec3 silver = vec3(0.84, 0.86, 0.9) * (0.9 + 0.16*hs.y);',
'    return mix(mix(silver, silver * mix(vec3(1.0), rb, 0.25), 0.5), mix(vec3(1.0), rb, 0.75), sp); }',
'  if (t < 3.5) {',
'    vec3 v = pkVoro(xy / pkCell(A) + B.yz); vec2 hs = pkHash2(v.xy + 2.3);',
'    vec3 rb = pkRainbow(hs.x * 0.8 + vs * 1.2 + hs.y);',
'    float edge = 1.0 - smoothstep(0.0, 0.05 + fwidth(v.z), v.z);',
'    float fl = smoothstep(0.45, 1.0, 0.5 + 0.5*sin(hs.x * 30.0 + vs * 5.0));',
'    glow += rb * fl * 0.16;',
'    return mix(vec3(0.85), rb, 0.45 + 0.4*fl) * (0.7 + 0.4*hs.y) * (1.0 - edge * 0.45); }',
'  if (t < 4.5) {',
'    float ph = pkWavePhase(xy, A), band = 0.5 + 0.5*sin(ph);',
'    vec3 rb = pkRainbow(xy.x / max(A.y, 1.0) * 0.35 + vs + ph * 0.012);',
'    float crest = pow(band, 8.0);',
'    glow += rb * crest * 0.22;',
'    return mix(vec3(0.3, 0.36, 0.42), mix(vec3(0.95), rb, 0.6), smoothstep(0.3, 0.7, band)); }',
'  if (t < 5.5) {',
'    vec2 l = pkStarLocal(xy, A, B); float th = atan(l.y, l.x); vec2 dir = normalize(l + 1e-4);',
'    float rays = pow(abs(sin(th * A.z * 0.5)), 3.0);',
'    vec3 rb = pkRainbow(th / 6.2831853 * 2.0 + dot(n.xy, dir) * 2.4 * sh + length(l) / A.y * 0.6);',
'    glow += rb * rays * 0.12;',
'    return mix(vec3(0.72), rb, 0.65) * (0.6 + 0.5*rays); }',
'  vec2 p = xy / pkCell(A) + B.yz, id = floor(p), fp = fract(p); vec2 hs = pkHash2(id + 5.3);',
'  vec2 gw = 0.07 + fwidth(p);',
'  float gap = smoothstep(0.0, gw.x, fp.x) * smoothstep(0.0, gw.y, fp.y);',
'  vec3 rb = pkRainbow(hs.x * 0.5 + vs * 1.3 + (id.x + id.y) * 0.03);',
'  float fl = smoothstep(0.72, 1.0, 0.5 + 0.5*sin(hs.y * 40.0 + vs * 6.0));',
'  glow += rb * fl * 0.25 * gap;',
'  vec3 silver = vec3(0.8, 0.83, 0.88) * (0.82 + 0.25*hs.y);',
'  return mix(mix(silver, silver * mix(vec3(1.0), rb, 0.35), 0.6), mix(vec3(1.0), rb, 0.7), fl) * mix(0.5, 1.0, gap); }',
// material id → (metalness, roughness)
'vec2 pkMatProps(float id, float rough){ return vec2((id < 0.5 || abs(id - 3.0) < 0.5) ? 1.0 : 0.0, rough); }'
].join('\n');

function fxBlock(i){
  var t = 'tFx' + i;
  return [
'{',
'  vec4 fa = uFxA[' + i + ']; vec4 fb = uFxB[' + i + '];',
'  vec2 rep = fb.x > 0.0 ? fb.xy : vec2(1.0);',
'  vec2 q = pkUv * rep;',
'  float m = pkMask(texture2D(' + t + ', q), fb.z, fb.w);',
'  float faceOk = (pkFace < 1.5 && !pkInner && (fa.y > 1.5 || abs(fa.y - pkFace) < 0.5)) ? 1.0 : 0.0;',
'  float k = m * fa.z * fa.w * faceOk;',
'  int ty = int(fa.x + 0.5);',
'  if (ty == 0) { pkCol = mix(pkCol, uFxC[' + i + '], k); pkMetal = mix(pkMetal, 1.0, k); pkRough = mix(pkRough, 0.13, k); pkW0 *= 1.0 - k; pkW1 *= 1.0 - k; }',
'  else if (ty == 1) { pkHolo = max(pkHolo, k); }',
'  else if (ty == 2) {',
'    vec2 e = uFxT[' + i + '] * 1.5;',
'    float mx = pkMask(texture2D(' + t + ', q + vec2(e.x, 0.0)), fb.z, fb.w) - pkMask(texture2D(' + t + ', q - vec2(e.x, 0.0)), fb.z, fb.w);',
'    float my = pkMask(texture2D(' + t + ', q + vec2(0.0, e.y)), fb.z, fb.w) - pkMask(texture2D(' + t + ', q - vec2(0.0, e.y)), fb.z, fb.w);',
'    vec2 dm = vec2(mx / (2.0*e.x) * rep.x / uW * (pkFace > 0.5 ? -1.0 : 1.0), my / (2.0*e.y) * rep.y / uH);',
'    pkG += dm * 0.16 * fa.z * fa.w * faceOk;',
'    pkCol *= 1.0 - 0.06 * k;',
'  }',
'  else if (ty == 3) { pkRough = mix(pkRough, 0.04, k); pkCC = mix(pkCC, 1.0, k); }',
'  else if (ty == 4) { pkRough = mix(pkRough, 0.92, k); pkCC = mix(pkCC, 0.0, k); pkMetal = mix(pkMetal, pkMetal*0.55, k); }',
'  else if (ty == 5) { pkCol = mix(pkCol, uFxC[' + i + '], k); pkMetal = mix(pkMetal, 0.0, k); pkW0 *= 1.0 - k; pkW1 *= 1.0 - k; }',
'  else if (ty == 6) { pkW2 = max(pkW2, k); pkW0 *= 1.0 - k; pkW1 *= 1.0 - k; pkCol = mix(pkCol, vec3(1.0), k); pkMetal = mix(pkMetal, 1.0, k); pkRough = mix(pkRough, 0.1, k); }',
'}'].join('\n');
}

var GLSL_MAIN = [
'float pkFace = floor(vFace + 0.5);',
'float pkAcross = mix(vXY.y, vXY.x, uVert), pkAlong = mix(vXY.x, vXY.y, uVert);',
'float pkAlongLen = mix(uW, uH, uVert), pkAcrossLen = mix(uH, uW, uVert);',
'float pkDEnd = pkAlongLen*0.5 - abs(pkAlong);',
// serrated cut at both ends (anti-aliased with alpha-to-coverage)
'float pkTri = abs(fract(pkAcross / uPitch) - 0.5) * 2.0;',
'float pkCut = pkDEnd - uTeeth * pkTri - 0.02;',
'float pkAA = clamp(pkCut / max(fwidth(pkCut), 1e-4) + 0.5, 0.0, 1.0);',
'if (pkAA <= 0.0) discard;',
'vec2 pkUv = vec2((vXY.x + uW*0.5) / uW, (vXY.y + uH*0.5) / uH);',
'if (pkFace > 0.5) pkUv.x = 1.0 - pkUv.x;',          // back is seen from behind
'bool pkInner = !gl_FrontFacing && pkFace > 1.5 && pkFace < 2.5;',
// artwork (premultiplied alpha)
'vec4 pkF = pkArt(tFront, pkUv, uXfFront, uHasFront);',
'bool pkIsA = uVert > 0.5 ? pkUv.x < 0.5 : pkUv.y > 0.5;',
'vec2 pkHA = uVert > 0.5 ? vec2(pkUv.x*2.0, pkUv.y) : vec2(pkUv.x, pkUv.y*2.0 - 1.0);',
'vec2 pkHB = uVert > 0.5 ? vec2(pkUv.x*2.0 - 1.0, pkUv.y) : vec2(pkUv.x, pkUv.y*2.0);',
'vec4 pkBA = pkArt(tBackA, pkHA, uXfA, uHasA);',
'vec4 pkBB = pkArt(tBackB, pkHB, uXfB, uHasB);',
'vec4 pkBk = pkIsA ? pkBA : pkBB;',
'vec4 pkFl = pkArt(tFlap, vUv2, uXfFlap, uHasFlap);',
// which artwork slot paints this fragment: 0 front, 1 back A, 2 back B, 3 flap, -1 none
'float pkSlot = -1.0;',
'vec4 pkInk = vec4(0.0); float pkHas = 0.0;',
'if (pkFace < 0.5) { pkInk = pkF; pkSlot = 0.0; pkHas = uHasFront; }',
'else if (pkFace < 1.5) { pkInk = pkBk; pkSlot = pkIsA ? 1.0 : 2.0; pkHas = pkIsA ? uHasA : uHasB; }',
'else if (pkFace < 2.5 && !pkInner) {',
'  if (uFlapMode > 1.5) { pkInk = pkFl; pkSlot = 3.0; pkHas = uHasFlap; }',
'  else if (uFlapMode > 0.5) { pkInk = pkBk; pkSlot = pkIsA ? 1.0 : 2.0; pkHas = pkIsA ? uHasA : uHasB; }',
'}',
'vec4 pkSB = vec4(0.0);',
'if (pkSlot > -0.5) pkSB = pkSlot < 0.5 ? uSlotB[0] : pkSlot < 1.5 ? uSlotB[1] : pkSlot < 2.5 ? uSlotB[2] : uSlotB[3];',
// artwork layer: full colour print, or the artwork alpha used as a mask for the FILL material
'vec3 pkInkCol; float pkInkA; float pkInkMat; float pkInkRough;',
'if (pkSB.x > 0.5) {',
'  float a = pkSB.y > 0.5 ? 1.0 - pkInk.a : pkInk.a;',
'  pkInkA = a * pkHas; pkInkCol = uFColor; pkInkMat = uFMat; pkInkRough = uFRough;',
'} else {',
'  pkInkA = pkInk.a; pkInkCol = pkInk.a > 0.0 ? pkInk.rgb / pkInk.a : vec3(0.0); pkInkMat = 5.0; pkInkRough = uInkRough;',
'}',
// PACK material underneath
'vec2 pkBP = pkMatProps(uMat, uBaseRough);',
'vec2 pkIP = pkMatProps(pkInkMat, pkInkRough);',
'vec3 pkCol = mix(uBaseColor, pkInkCol, pkInkA);',
'float pkMetal = mix(pkBP.x, pkIP.x, pkInkA);',
'float pkRough = mix(pkBP.y, pkIP.y, pkInkA);',
'float pkW0 = abs(uMat - 3.0) < 0.5 ? 1.0 - pkInkA : 0.0;',          // pack foil weight
'float pkW1 = abs(pkInkMat - 3.0) < 0.5 ? pkInkA : 0.0;',            // fill foil weight
'float pkW2 = 0.0;',                                                  // "holographic foil" texture effect
'float pkCC = uLam * (1.0 - pkInkA * step(0.5, pkInkMat) * step(pkInkMat, 1.5));',   // a matte fill is not laminated
'if (pkInner) { pkRough = max(uBaseRough, 0.3); pkCC = 0.0; pkW0 = 0.0; pkW1 = 0.0; }',
'if (pkFace > 2.5) { pkRough = max(uBaseRough, 0.35); }',
// procedural relief: serration, wrinkles, crinkle, flap knurl
'float pkE = 0.06;',
'vec2 pkG = vec2(pkHeight(vXY + vec2(pkE, 0.0), pkFace) - pkHeight(vXY - vec2(pkE, 0.0), pkFace),',
'                pkHeight(vXY + vec2(0.0, pkE), pkFace) - pkHeight(vXY - vec2(0.0, pkE), pkFace)) / (2.0*pkE);',
'float pkHolo = 0.0;',
'@@FX@@',
'vec4 pkFxLiq = vec4(1.0, 45.0, 4.5, 1.0); vec4 pkFxLiqB = vec4(1.0, 0.0, 0.0, 0.0);',
'if (pkW0 > 0.0) pkG += pkW0 * pkFoilGrad(vXY, uFoilA, uFoilB);',
'if (pkW1 > 0.0) pkG += pkW1 * pkFoilGrad(vXY, uFFoilA, uFFoilB);',
'if (pkW2 > 0.0) pkG += pkW2 * pkFoilGrad(vXY, pkFxLiq, pkFxLiqB);',
'vec3 pkGlow = vec3(0.0);',
// guides
'vec4 pkGuide = vec4(0.0);',
'if (uGuides > 0.5) {',
'  float inC = step(pkDEnd, uCrimp);',
'  pkGuide = mix(pkGuide, vec4(1.0, 0.22, 0.15, 0.28), inC);',
'  float fA = uFlapDir * pkAcross;',
'  if (pkFace > 0.5 && pkFace < 1.5 && fA >= 0.0 && fA <= uFlapW) pkGuide = mix(pkGuide, vec4(0.15, 0.45, 1.0, 0.3), 1.0);',
'  float l = max(pkLine(pkDEnd - uCrimp, 1.3), pkLine(pkAcrossLen*0.5 - abs(pkAcross) - 3.0, 1.0) * step(0.5, fract(pkAlong*0.25)));',
'  l = max(l, pkLine(pkDEnd - uCrimp - 3.0, 1.0) * step(0.5, fract(pkAcross*0.25)));',
'  pkGuide = mix(pkGuide, vec4(1.0, 0.25, 0.1, 1.0), l);',
'  if (pkFace > 0.5 && pkFace < 1.5) pkGuide = mix(pkGuide, vec4(0.1, 0.35, 1.0, 1.0), pkLine(pkAcross, 1.3));',
'  pkCol *= 1.0 - pkGuide.a; pkMetal *= 1.0 - pkGuide.a;',
'  pkW0 *= 1.0 - pkGuide.a; pkW1 *= 1.0 - pkGuide.a; pkW2 *= 1.0 - pkGuide.a;',
'}',
'diffuseColor = vec4(pkCol, pkAA);'
].join('\n');

var GLSL_NORMAL = [
'{',
'  vec3 pkTx = normalize(vTx), pkTy = normalize(vTy);',
'  normal = normalize(normal - faceDirection * (pkG.x * pkTx + pkG.y * pkTy));',
'  vec3 pkV = normalize(vViewPosition);',
'  vec3 pkMul = vec3(1.0);',
'  if (pkW0 > 0.0) { float r = roughnessFactor; vec3 g = vec3(0.0); vec3 c = pkFoilShade(vXY, uFoilA, uFoilB, normal, pkV, r, g);',
'    pkMul = mix(pkMul, c, pkW0); roughnessFactor = mix(roughnessFactor, r, pkW0); pkGlow += g * pkW0; }',
'  if (pkW1 > 0.0) { float r = roughnessFactor; vec3 g = vec3(0.0); vec3 c = pkFoilShade(vXY, uFFoilA, uFFoilB, normal, pkV, r, g);',
'    pkMul = mix(pkMul, c, pkW1); roughnessFactor = mix(roughnessFactor, r, pkW1); pkGlow += g * pkW1; }',
'  if (pkW2 > 0.0) { float r = roughnessFactor; vec3 g = vec3(0.0); vec3 c = pkFoilShade(vXY, pkFxLiq, pkFxLiqB, normal, pkV, r, g);',
'    pkMul = mix(pkMul, c, pkW2); roughnessFactor = mix(roughnessFactor, r, pkW2); pkGlow += g * pkW2; }',
'  diffuseColor.rgb *= pkMul;',
'  pkGlow *= diffuseColor.rgb;',
'  if (pkHolo > 0.0) {',
'    float ndv = dot(normal, pkV);',
'    float hue = ndv*1.9 + dot(vXY, vec2(0.011, 0.017)) + pkNoise(vXY*0.08)*0.35;',
'    diffuseColor.rgb = mix(diffuseColor.rgb, 0.55 + 0.45*cos(6.2831853*(hue + vec3(0.0, 0.33, 0.67))), pkHolo);',
'    metalnessFactor = mix(metalnessFactor, 1.0, pkHolo);',
'    roughnessFactor = mix(roughnessFactor, 0.12, pkHolo);',
'  }',
'}'
].join('\n');

var material = new T.MeshPhysicalMaterial({ side:T.DoubleSide, clearcoat:1, clearcoatRoughness:0.07, alphaToCoverage:true });
material.onBeforeCompile = function(sh){
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aXY; attribute float aFace; attribute vec3 aTx; attribute vec3 aTy; attribute vec2 aUv2;\nvarying vec2 vXY; varying float vFace; varying vec3 vTx; varying vec3 vTy; varying vec2 vUv2;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvXY = aXY; vFace = aFace; vUv2 = aUv2;\nvTx = mat3(modelViewMatrix) * aTx; vTy = mat3(modelViewMatrix) * aTy;');
  var fx = []; for (var i = 0; i < MAX_FX; i++) fx.push(fxBlock(i));
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL_PARS)
    .replace('#include <map_fragment>', GLSL_MAIN.replace('@@FX@@', fx.join('\n')))
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = pkRough;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = pkMetal;')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLSL_NORMAL)
    .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n#ifdef USE_CLEARCOAT\nclearcoatNormal = normal;\n#endif')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += pkGuide.rgb * pkGuide.a * 0.9 + pkGlow;')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat = clamp(pkCC, 0.0, 1.0);\n#endif');
};
material.customProgramCacheKey = function(){ return 'booster-pack-v3'; };

var mesh = new T.Mesh(new T.BufferGeometry(), material);
flipG.add(mesh);

/* ------------------------------------------------------------- geometry */
function buildGeometry(){
  var W = S.W, H = S.H, vert = S.layout === 'v';
  var A = vert ? W : H, L = vert ? H : W;          // across / along the seal direction
  var P = S.puff, C = S.crimp, TR = Math.max(1, S.trans), TH = 0.12;
  var F = Math.min(S.flapW, A * 0.45);
  function sm(e0, e1, x){ var t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t*t*(3 - 2*t); }
  function gL(l){ return sm(C, C + TR, L/2 - Math.abs(l)); }
  function fA(a){ var t = Math.min(1, Math.abs(a) / (A/2)); return Math.sqrt(Math.max(0, 1 - t*t*t*t)); }
  var pinchK = 0.6 * P / A;
  function XYZ(a, l, z){ return vert ? [a, l, z] : [l, a, z]; }
  function bodyZ(a, l, side){ return side * (TH + P * gL(l) * fA(a)); }
  function body(side){ return function(a, l){ return XYZ(a * (1 - pinchK * gL(l)), l, bodyZ(a, l, side)); }; }

  var pos = [], nor = [], axy = [], face = [], atx = [], aty = [], uv2 = [], idx = [];
  var orient = vert ? 1 : -1;     // sign of cross(dP/da, dP/dl) for a flat sheet facing +z

  function surface(Pf, a0, a1, na, aMap, l0, l1, nl, faceId, sgn, uv2Fn){
    var base = pos.length / 3, e = 0.02;
    for (var j = 0; j <= nl; j++){
      var l = l0 + (l1 - l0) * j / nl;
      for (var i = 0; i <= na; i++){
        var a = aMap(i / na);
        var p = Pf(a, l);
        var ap = Math.min(a1, a + e), am = Math.max(a0, a - e);
        var lp = Math.min(l1, l + e), lm = Math.max(l0, l - e);
        var p1 = Pf(ap, l), p0 = Pf(am, l), q1 = Pf(a, lp), q0 = Pf(a, lm);
        var Pa = [(p1[0]-p0[0])/(ap-am), (p1[1]-p0[1])/(ap-am), (p1[2]-p0[2])/(ap-am)];
        var Pl = [(q1[0]-q0[0])/(lp-lm), (q1[1]-q0[1])/(lp-lm), (q1[2]-q0[2])/(lp-lm)];
        var n = [Pa[1]*Pl[2]-Pa[2]*Pl[1], Pa[2]*Pl[0]-Pa[0]*Pl[2], Pa[0]*Pl[1]-Pa[1]*Pl[0]];
        var nl2 = Math.hypot(n[0], n[1], n[2]) || 1;
        pos.push(p[0], p[1], p[2]);
        nor.push(sgn*n[0]/nl2, sgn*n[1]/nl2, sgn*n[2]/nl2);
        var xy = vert ? [a, l] : [l, a];
        axy.push(xy[0], xy[1]); face.push(faceId);
        var tx = vert ? Pa : Pl, ty = vert ? Pl : Pa;
        atx.push(tx[0], tx[1], tx[2]); aty.push(ty[0], ty[1], ty[2]);
        var u2 = uv2Fn ? uv2Fn(xy) : [0, 0]; uv2.push(u2[0], u2[1]);
      }
    }
    for (j = 0; j < nl; j++) for (i = 0; i < na; i++){
      var v00 = base + j*(na+1) + i, v10 = v00 + 1, v01 = v00 + na + 1, v11 = v01 + 1;
      if (sgn > 0) idx.push(v00, v10, v01, v10, v11, v01); else idx.push(v00, v01, v10, v10, v01, v11);
    }
  }
  var NA = 120, NL = Math.round(Math.min(360, Math.max(160, L * 2)));
  var sinMap = function(t){ return (A/2) * Math.sin((t*2 - 1) * Math.PI/2); };
  surface(body(+1), -A/2, A/2, NA, sinMap, -L/2, L/2, NL, 0, orient * 1, null);
  surface(body(-1), -A/2, A/2, NA, sinMap, -L/2, L/2, NL, 1, orient * -1, null);

  // side folds (thin strips joining front and back)
  [-1, 1].forEach(function(s){
    var a = s * A/2;
    var strip = function(k, l){ var f = body(+1)(a, l), b = body(-1)(a, l); return [f[0]+(b[0]-f[0])*k, f[1]+(b[1]-f[1])*k, f[2]+(b[2]-f[2])*k]; };
    var Pf = function(k, l){ return strip(k, l); };
    var base = pos.length / 3;
    surface(Pf, 0, 1, 2, function(t){ return t; }, -L/2, L/2, NL, 3, orient * s, null);
    // fix the film coordinate of strip vertices (surface() stored k as "across")
    for (var v = base; v < pos.length/3; v++){
      var l = vert ? axy[v*2+1] : axy[v*2];
      var xy = vert ? [a, l] : [l, a];
      axy[v*2] = xy[0]; axy[v*2+1] = xy[1];
    }
  });

  // back fin-seal flap: hinged at the centre line of the back, folded over half A or B
  if (F > 0.2){
    var dir = S.flapSide === 'B' ? -1 : 1;     // B = viewer's right (vertical) / bottom (horizontal) = negative "across"
    var theta = S.flapOpen * Math.PI / 180;
    var lift = 0.2;
    var flapP = function(a, l){
      var s = Math.abs(a), g = gL(l), th = theta * g;
      var k = Math.min(1, th / 0.35);
      var zc = bodyZ(dir*s, l, -1) - lift, zh = bodyZ(0, l, -1) - lift;
      var acr = dir * s * Math.cos(th) * (1 - pinchK * g);
      return XYZ(acr, l, zc*(1-k) + zh*k - s*Math.sin(th));
    };
    // flap image uv: the flap strip as seen from the back
    var fu = function(xy){ return [(W/2 - xy[0]) / W, (xy[1] + H/2) / H]; };
    var c0 = fu(vert ? [0, -L/2] : [-L/2, 0]), c1 = fu(vert ? [dir*F, L/2] : [L/2, dir*F]);
    var mn = [Math.min(c0[0], c1[0]), Math.min(c0[1], c1[1])], mx = [Math.max(c0[0], c1[0]), Math.max(c0[1], c1[1])];
    var uv2Fn = function(xy){ var f = fu(xy); return [(f[0]-mn[0]) / Math.max(1e-6, mx[0]-mn[0]), (f[1]-mn[1]) / Math.max(1e-6, mx[1]-mn[1])]; };
    var a0 = dir > 0 ? 0 : -F, a1 = dir > 0 ? F : 0;
    surface(flapP, a0, a1, 10, function(t){ return a0 + (a1 - a0) * t; }, -L/2, L/2, NL, 2, orient * -1, uv2Fn);
  }

  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('aXY', new T.Float32BufferAttribute(axy, 2));
  g.setAttribute('aFace', new T.Float32BufferAttribute(face, 1));
  g.setAttribute('aTx', new T.Float32BufferAttribute(atx, 3));
  g.setAttribute('aTy', new T.Float32BufferAttribute(aty, 3));
  g.setAttribute('aUv2', new T.Float32BufferAttribute(uv2, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  mesh.geometry.dispose();
  mesh.geometry = g;
}

/* -------------------------------------------------------- region sizes */
function regionMM(key){
  var vert = S.layout === 'v', W = S.W, H = S.H, F = S.flapW;
  if (key === 'front') return [W, H];
  if (key === 'backA' || key === 'backB') return vert ? [W/2, H] : [W, H/2];
  if (key === 'flap') return vert ? [F, H] : [W, F];
  return [W, H];
}
function recPx(key){ var r = regionMM(key); return [Math.round(r[0]*PXMM), Math.round(r[1]*PXMM)]; }
function slotLabel(key){
  var vert = S.layout === 'v';
  if (key === 'front') return 'Front';
  if (key === 'backA') return 'Back · half A (' + (vert ? 'left' : 'top') + ')';
  if (key === 'backB') return 'Back · half B (' + (vert ? 'right' : 'bottom') + ')';
  return 'Flap (optional)';
}

/* ------------------------------------------------------- apply settings */
function fitXf(key, vec){
  var im = IMG[key]; if (!im){ vec.set(1,1,0,0); return; }
  var r = regionMM(key), rA = r[0]/r[1], iA = im.w/im.h;
  if (S.fit === 'cover') vec.set(Math.min(1, rA/iA), Math.min(1, iA/rA), 0, 0);
  else if (S.fit === 'contain') vec.set(Math.max(1, rA/iA), Math.max(1, iA/rA), 0, 0);
  else vec.set(1, 1, 0, 0);
}
var geoDirty = true;
function applyAll(){
  U.uW.value = S.W; U.uH.value = S.H; U.uVert.value = S.layout === 'v' ? 1 : 0;
  U.uCrimp.value = S.crimp; U.uTeeth.value = S.teeth; U.uPitch.value = S.pitch; U.uRidge.value = S.ridge;
  U.uWrinkle.value = S.wrinkle; U.uTrans.value = S.trans;
  // PACK material
  U.uMat.value = MAT_ID[S.mat] != null ? MAT_ID[S.mat] : 0;
  U.uBaseColor.value.set(S.baseColor);
  U.uFoilA.value.set(foilIndex(S.foilType), S.foilSize, S.foilDensity, S.foilRelief);
  U.uFoilB.value.set(S.foilShift, (S.foilSeed * 7.31) % 97, (S.foilSeed * 3.17) % 89, 0);
  // FILL material (artwork in Alpha → fill)
  U.uFMat.value = MAT_ID[S.fMat] != null ? MAT_ID[S.fMat] : 5;
  U.uFColor.value.set(S.fColor); U.uFRough.value = S.fRough;
  U.uFFoilA.value.set(foilIndex(S.fFoilType), S.fFoilSize, S.fFoilDensity, S.fFoilRelief);
  U.uFFoilB.value.set(S.fFoilShift, (S.fFoilSeed * 5.13 + 31) % 97, (S.fFoilSeed * 2.71 + 17) % 89, 0);
  SLOTS.forEach(function(k, i){ U.uSlotB.value[i].set(CFG[k].mode === 'alpha' ? 1 : 0, CFG[k].inv ? 1 : 0, 0, 0); });
  U.uBaseRough.value = S.baseRough; U.uInkRough.value = S.inkRough; U.uLam.value = S.lam;
  U.uFlapMode.value = +S.flapMode; U.uFlapDir.value = S.flapSide === 'B' ? -1 : 1;
  U.uFlapW.value = S.flapW; U.uGuides.value = S.guides ? 1 : 0;
  var map = { front:['tFront','uXfFront','uHasFront'], backA:['tBackA','uXfA','uHasA'], backB:['tBackB','uXfB','uHasB'], flap:['tFlap','uXfFlap','uHasFlap'] };
  SLOTS.forEach(function(k){ var m = map[k], im = IMG[k]; U[m[0]].value = im ? im.tex : BLANK; U[m[2]].value = im ? 1 : 0; fitXf(k, U[m[1]].value); });
  applyFx();
  scene.environment = getEnv(S.env);
  scene.environmentIntensity = S.envInt;
  scene.environmentRotation.set(0, S.envRot * Math.PI/180, 0);
  keyLight.intensity = (S.env === 'studio' ? 0.55 : 0.35) * S.envInt;
  var r = S.envRot * Math.PI/180;
  keyLight.position.set(-200*Math.cos(r) + 420*Math.sin(r), 260, 420*Math.cos(r) + 200*Math.sin(r));
  renderer.toneMappingExposure = S.exposure;
  renderer.setClearColor(new T.Color(S.bg), S.transparent ? 0 : 1);
  stage.classList.toggle('checker', !!S.transparent);
  stage.style.setProperty('--stage', S.bg);
  $('#empty').hidden = !!(IMG.front || IMG.backA || IMG.backB);
  updateMatRows();
  persist();
}
/* show the foil controls only for the material that uses them; the FILL block only when a slot uses Alpha → fill */
function fillInUse(){ return SLOTS.some(function(k){ return IMG[k] && CFG[k].mode === 'alpha'; }); }
function updateMatRows(){
  $('#packFoil').hidden = S.mat !== 'foil';
  $('#fillBlock').hidden = !fillInUse();
  $('#fillFoil').hidden = S.fMat !== 'foil';
  var used = SLOTS.filter(function(k){ return IMG[k] && CFG[k].mode === 'alpha'; }).map(slotShort);
  $('#fillUsedBy').textContent = used.length ? 'Used by: ' + used.join(', ') : '';
}
function slotShort(k){ return k === 'front' ? 'Front' : k === 'backA' ? 'Back A' : k === 'backB' ? 'Back B' : 'Flap'; }
function applyFx(){
  for (var i = 0; i < MAX_FX; i++){
    var f = FX[i], A = U.uFxA.value[i], B = U.uFxB.value[i];
    if (!f){ A.set(0, 2, 0, 0); U['tFx' + i].value = BLANK; continue; }
    U['tFx' + i].value = f.tex;
    A.set(FX_INDEX[f.type], f.face === 'front' ? 0 : f.face === 'back' ? 1 : 2, f.amt, f.on ? 1 : 0);
    var rx = 0, ry = 0;
    if (f.tile){ rx = f.scale; var tileW = S.W / f.scale, tileH = tileW * f.h / f.w; ry = S.H / tileH; }
    B.set(rx, ry, f.inv ? 1 : 0, f.chan === 'alpha' ? 1 : 0);
    U.uFxC.value[i].set(f.color);
    U.uFxT.value[i].set(1 / f.w, 1 / f.h);
  }
  $('#fxCount').textContent = FX.length + ' / ' + MAX_FX;
  $('#fxAdd').disabled = FX.length >= MAX_FX;
}

/* -------------------------------------------------------------- images */
function readFile(file){
  return new Promise(function(res, rej){
    var fr = new FileReader();
    fr.onload = function(){ res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(file);
  });
}
function loadImage(url){
  return new Promise(function(res, rej){ var im = new Image(); im.onload = function(){ res(im); }; im.onerror = function(){ rej(new Error('Not an image')); }; im.src = url; });
}
function hasAlpha(img){
  var s = Math.min(1, 256 / Math.max(img.width, img.height));
  var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width*s)); c.height = Math.max(1, Math.round(img.height*s));
  var x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  var d = x.getImageData(0, 0, c.width, c.height).data;
  for (var i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
function makeTex(img, isMask){
  var t = new T.Texture(img);
  t.colorSpace = isMask ? T.NoColorSpace : T.SRGBColorSpace;
  t.premultiplyAlpha = !isMask;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter;
  if (isMask){ t.wrapS = t.wrapT = T.RepeatWrapping; }
  else { t.wrapS = t.wrapT = T.ClampToEdgeWrapping; }
  t.needsUpdate = true;
  return t;
}
function setSlotImage(key, url, name, preset){
  return loadImage(url).then(function(img){
    if (IMG[key]) IMG[key].tex.dispose();
    IMG[key] = { tex:makeTex(img, false), url:url, name:name || 'image', w:img.naturalWidth, h:img.naturalHeight, preset:preset };
    if (key === 'flap' && S.flapMode !== '2'){ S.flapMode = '2'; syncControls(); }
    renderSlots(); applyAll();
  });
}
function clearSlot(key){
  if (IMG[key]) IMG[key].tex.dispose();
  IMG[key] = null;
  if (key === 'flap' && S.flapMode === '2'){ S.flapMode = '0'; syncControls(); }
  renderSlots(); applyAll();
}
function addFx(url, name, preset){
  return loadImage(url).then(function(img){
    var alpha = hasAlpha(img);
    var f = Object.assign({ id:++fxSeq, url:url, name:name || 'texture', w:img.naturalWidth, h:img.naturalHeight,
      type:'foil', face:'front', amt:1, color:'#ffffff', tile:false, scale:6, inv:false, chan:alpha ? 'alpha' : 'lum', on:true }, preset || {});
    f.tex = makeTex(img, true);
    FX.push(f); renderFx(); applyAll();
  });
}

/* -------------------------------------------------------------- slot UI */
var pendingPick = null;
var fileIn = $('#fileIn');
fileIn.addEventListener('change', function(){
  var f = fileIn.files[0]; fileIn.value = '';
  if (!f || !pendingPick) return;
  var cb = pendingPick; pendingPick = null;
  readFile(f).then(function(url){ return cb(url, f.name); }).catch(function(e){ toast(e.message || 'Could not load the image'); });
});
function pick(cb){ pendingPick = cb; fileIn.click(); }

function renderSlots(){
  var host = $('#slots'); host.innerHTML = '';
  SLOTS.forEach(function(key){
    var im = IMG[key], rp = recPx(key), mm = regionMM(key);
    var el = document.createElement('div');
    el.className = 'slot' + (im ? '' : ' empty'); el.dataset.slot = key;
    var info, warn = false;
    if (im){
      var ar = im.w / im.h, rr = rp[0] / rp[1];
      warn = Math.abs(ar / rr - 1) > 0.02;
      info = im.w + ' × ' + im.h + ' px' + (warn ? ' · ratio ≠ ' + rp[0] + '×' + rp[1] : ' ✓');
    } else info = rp[0] + ' × ' + rp[1] + ' px · ' + fmt(mm[0]) + '×' + fmt(mm[1]) + ' mm';
    el.innerHTML = '<div class="thumb"><img alt=""></div><div class="slot-body"><b></b><span class="slot-info"></span>' +
      '<div class="slot-btns">' + presetSelect(key) + '<button data-act="load">' + (im ? 'Replace' : 'Load') + '</button><button data-act="tpl" title="Download a PNG template at the right size with crimp / flap / margin guides">Template</button>' +
      (im ? '<button data-act="clear" title="Remove">✕</button>' : '') + '</div></div>';
    $('b', el).textContent = slotLabel(key);
    var si = $('.slot-info', el); si.textContent = info; si.title = im ? im.name : 'Recommended size (16 px/mm)'; if (warn) si.classList.add('warn');
    if (im){
      $('img', el).src = im.url;
      slotOptions(el, key);
    }
    var ps = $('select.preset', el);
    if (ps){
      if (im && im.preset != null) ps.value = String(im.preset);
      ps.addEventListener('click', function(e){ e.stopPropagation(); });
      ps.addEventListener('change', function(){
        var a = presetsFor(key)[+ps.value]; if (!a) return;
        setSlotImage(key, a.url, a.name, +ps.value).then(function(){ toast(slotShort(key) + ' ← ' + presetLabel(a)); });
      });
    }
    el.addEventListener('click', function(e){
      var act = e.target.dataset && e.target.dataset.act;
      if (act === 'load') pick(function(url, name){ return setSlotImage(key, url, name); });
      else if (act === 'tpl') downloadTemplate(key);
      else if (act === 'clear') clearSlot(key);
    });
    dropTarget(el, function(file){ readFile(file).then(function(url){ return setSlotImage(key, url, file.name); }).catch(function(){ toast('Could not load the image'); }); });
    host.appendChild(el);
  });
  $('#flapSideA').textContent = 'Half A (' + (S.layout === 'v' ? 'left' : 'top') + ')';
  $('#flapSideB').textContent = 'Half B (' + (S.layout === 'v' ? 'right' : 'bottom') + ')';
}
/* per-slot artwork mode: full colour, or the alpha used as a mask for the FILL material (set in the Material section) */
function slotOptions(el, key){
  var c = CFG[key];
  var o = document.createElement('div'); o.className = 'slot-opts';
  o.innerHTML =
    '<div class="seg"><button data-mode="color">Full colour</button><button data-mode="alpha">Alpha → fill</button></div>' +
    '<div class="alpha-opts">' +
      '<label class="check"><input type="checkbox" class="so-inv">Invert alpha</label>' +
      '<p class="hint">Fill colour and material: <b>Material → Artwork fill</b></p>' +
    '</div>';
  var sync = function(){
    $$('[data-mode]', o).forEach(function(b){ b.classList.toggle('on', b.dataset.mode === c.mode); });
    $('.alpha-opts', o).hidden = c.mode !== 'alpha';
    $('.so-inv', o).checked = !!c.inv;
  };
  sync();
  $$('[data-mode]', o).forEach(function(b){ b.addEventListener('click', function(){ c.mode = b.dataset.mode; sync(); applyAll(); }); });
  $('.so-inv', o).addEventListener('change', function(e){ c.inv = e.target.checked; applyAll(); });
  el.appendChild(o);
}
// preloaded artwork (artwork/ folder, embedded in artwork.js by build-artwork.sh), matched to a slot by file name
var PRESET_RX = { front:/front/i, backA:/back[-_ ]?a(?![a-z])/i, backB:/back[-_ ]?b(?![a-z])/i, flap:/flap/i };
var ALL_ART = window.BP_ARTWORKS || [];
function presetsFor(key){ return ALL_ART.filter(function(a){ return PRESET_RX[key].test(a.name); }); }
function presetLabel(a){ return a.name.replace(/\.(png|jpe?g)$/i, '').replace(/^pack-/i, ''); }
function presetSelect(key){
  var list = presetsFor(key);
  if (!list.length) return '';
  return '<select class="preset" title="Preloaded artwork (artwork/ folder)"><option value="" disabled selected>Artwork…</option>' +
    list.map(function(a, i){ return '<option value="' + i + '">' + presetLabel(a) + '</option>'; }).join('') + '</select>';
}
var DEFAULT_ART = ['backA', 'backB'];          // slots that start with their first preset loaded
function loadDefaultArt(){
  return Promise.all(DEFAULT_ART.map(function(k){
    var a = presetsFor(k)[0];
    return (a && !IMG[k]) ? setSlotImage(k, a.url, a.name, 0) : null;
  })).catch(function(){});
}
function dropTarget(el, cb){
  el.addEventListener('dragover', function(e){ e.preventDefault(); e.stopPropagation(); el.classList.add('drag'); });
  el.addEventListener('dragleave', function(){ el.classList.remove('drag'); });
  el.addEventListener('drop', function(e){
    e.preventDefault(); e.stopPropagation(); el.classList.remove('drag');
    var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) cb(f);
  });
}

/* ------------------------------------------------------------ effects UI */
function renderFx(){
  var host = $('#fxList'); host.innerHTML = '';
  FX.forEach(function(f){
    var el = document.createElement('div'); el.className = 'fx' + (f.on ? '' : ' off');
    el.innerHTML =
      '<div class="fx-head"><div class="thumb sm"><img alt=""></div><select class="fx-type"></select>' +
      '<button class="fx-on" title="Show / hide">' + (f.on ? '●' : '○') + '</button><button class="fx-del" title="Remove">✕</button></div>' +
      '<div class="fx-name"></div>' +
      '<div class="seg fx-face"><button data-v="front">Front</button><button data-v="back">Back</button><button data-v="both">Both</button></div>' +
      '<div class="row"><div class="lab"><span>Intensity</span><output class="o-amt"></output></div><input type="range" class="fx-amt" min="0" max="1" step="0.01"></div>' +
      '<div class="two row"><label class="color fx-colorwrap"><input type="color" class="fx-color"><span>Colour</span></label>' +
      '<select class="fx-chan"><option value="alpha">Mask: alpha</option><option value="lum">Mask: luminance</option></select></div>' +
      '<label class="check"><input type="checkbox" class="fx-inv">Invert mask</label>' +
      '<label class="check"><input type="checkbox" class="fx-tile">Repeat as a pattern</label>' +
      '<div class="row fx-scale-row"><div class="lab"><span>Repeats across the width</span><output class="o-scale"></output></div><input type="range" class="fx-scale" min="1" max="40" step="0.5"></div>';
    $('img', el).src = f.url;
    $('.fx-name', el).textContent = f.name + ' · ' + f.w + '×' + f.h;
    var ts = $('.fx-type', el);
    FX_TYPES.forEach(function(t){ var o = document.createElement('option'); o.value = t[0]; o.textContent = t[1]; ts.appendChild(o); });
    ts.value = f.type;
    var sync = function(){
      $$('.fx-face button', el).forEach(function(b){ b.classList.toggle('on', b.dataset.v === f.face); });
      $('.fx-amt', el).value = f.amt; $('.o-amt', el).textContent = Math.round(f.amt * 100) + '%';
      $('.fx-color', el).value = f.color; $('.fx-chan', el).value = f.chan;
      $('.fx-inv', el).checked = f.inv; $('.fx-tile', el).checked = f.tile;
      $('.fx-scale', el).value = f.scale; $('.o-scale', el).textContent = f.scale + '×';
      $('.fx-scale-row', el).hidden = !f.tile;
      $('.fx-colorwrap', el).hidden = !(f.type === 'foil' || f.type === 'ink');
    };
    sync();
    ts.addEventListener('change', function(){
      f.type = ts.value;
      if (f.type === 'foil' && f.color === '#2b2b2b') f.color = '#ffffff';
      if (f.type === 'ink' && f.color === '#ffffff') f.color = '#2b2b2b';
      sync(); applyAll();
    });
    $$('.fx-face button', el).forEach(function(b){ b.addEventListener('click', function(){ f.face = b.dataset.v; sync(); applyAll(); }); });
    $('.fx-amt', el).addEventListener('input', function(e){ f.amt = +e.target.value; sync(); applyFx(); });
    $('.fx-color', el).addEventListener('input', function(e){ f.color = e.target.value; applyFx(); });
    $('.fx-chan', el).addEventListener('change', function(e){ f.chan = e.target.value; applyFx(); });
    $('.fx-inv', el).addEventListener('change', function(e){ f.inv = e.target.checked; applyFx(); });
    $('.fx-tile', el).addEventListener('change', function(e){ f.tile = e.target.checked; sync(); applyFx(); });
    $('.fx-scale', el).addEventListener('input', function(e){ f.scale = +e.target.value; sync(); applyFx(); });
    $('.fx-on', el).addEventListener('click', function(){ f.on = !f.on; renderFx(); applyFx(); });
    $('.fx-del', el).addEventListener('click', function(){ f.tex.dispose(); FX.splice(FX.indexOf(f), 1); renderFx(); applyAll(); });
    host.appendChild(el);
  });
}
$('#fxAdd').addEventListener('click', function(){
  if (FX.length >= MAX_FX) return;
  pick(function(url, name){ return addFx(url, name); });
});

/* ------------------------------------------------------- generic binder */
function fmt(v){ return (Math.round(v * 10) / 10).toString(); }
var OUT = {
  baseRough:function(v){ return (+v).toFixed(2); }, inkRough:function(v){ return (+v).toFixed(2); },
  lam:function(v){ return Math.round(v*100) + '%'; }, puff:function(v){ return fmt(v) + ' mm'; },
  crimp:function(v){ return fmt(v) + ' mm'; }, trans:function(v){ return fmt(v) + ' mm'; },
  pitch:function(v){ return (+v).toFixed(2) + ' mm'; }, teeth:function(v){ return (+v).toFixed(2) + ' mm'; },
  ridge:function(v){ return Math.round(v*100) + '%'; }, wrinkle:function(v){ return Math.round(v*100) + '%'; },
  flapW:function(v){ return fmt(v) + ' mm'; }, flapOpen:function(v){ return Math.round(v) + '°'; },
  envInt:function(v){ return (+v).toFixed(2); }, envRot:function(v){ return Math.round(v) + '°'; },
  exposure:function(v){ return (+v).toFixed(2); }, tilt:function(v){ return fmt(v) + '°'; },
  fRough:function(v){ return (+v).toFixed(2); }
};
['', 'f'].forEach(function(p){
  var K = function(s){ return p ? p + s.charAt(0).toUpperCase() + s.slice(1) : s; };
  OUT[K('foilSize')] = function(v){ return Math.round(v) + ' mm'; };
  OUT[K('foilDensity')] = function(v){ return fmt(v); };
  OUT[K('foilRelief')] = function(v){ return Math.round(v*100) + '%'; };
  OUT[K('foilShift')] = function(v){ return Math.round(v*100) + '%'; };
});
// foil texture dropdowns
$$('select.foil-type').forEach(function(sel){
  FOILS.forEach(function(f){ var o = document.createElement('option'); o.value = f[0]; o.textContent = f[1]; sel.appendChild(o); });
});
var GEO_KEYS = { W:1, H:1, layout:1, puff:1, crimp:1, trans:1, flapW:1, flapSide:1, flapOpen:1 };
function syncControls(){
  $$('[data-k]').forEach(function(el){
    var k = el.dataset.k; if (!(k in S)) return;
    if (el.type === 'checkbox') el.checked = !!S[k]; else el.value = S[k];
  });
  $$('[data-o]').forEach(function(o){ var k = o.dataset.o; o.textContent = OUT[k] ? OUT[k](S[k]) : S[k]; });
  $$('[data-seg]').forEach(function(seg){ var k = seg.dataset.seg; $$('button', seg).forEach(function(b){ b.classList.toggle('on', b.dataset.v === String(S[k])); }); });
}
function setKey(k, v){
  S[k] = v;
  // picking a foil texture loads its natural pattern size / density
  if (k === 'foilType'){ var f = FOILS[foilIndex(v)]; S.foilSize = f[2]; S.foilDensity = f[3]; }
  if (k === 'fFoilType'){ var g = FOILS[foilIndex(v)]; S.fFoilSize = g[2]; S.fFoilDensity = g[3]; }
  if (GEO_KEYS[k]) geoDirty = true;
  if (k === 'layout' || k === 'W' || k === 'H' || k === 'flapW') renderSlots();
  if (k === 'W' || k === 'H' || k === 'layout') fitCamera();
  syncControls(); applyAll();
}
$$('[data-k]').forEach(function(el){
  var k = el.dataset.k;
  var ev = (el.type === 'range' || el.type === 'color') ? 'input' : 'change';
  el.addEventListener(ev, function(){
    var v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number') ? +el.value : el.value;
    if (el.type === 'number'){ var mn = +el.min, mx = +el.max; if (!isFinite(v) || v <= 0) return; v = Math.max(mn, Math.min(mx, v)); }
    setKey(k, v);
  });
});
$$('[data-seg]').forEach(function(seg){
  $$('button', seg).forEach(function(b){ b.addEventListener('click', function(){
    var k = seg.dataset.seg;
    if (k === 'mat'){ S.mat = b.dataset.v; Object.assign(S, MAT_DEF[S.mat]); syncControls(); applyAll(); return; }
    if (k === 'fMat'){ S.fMat = b.dataset.v; Object.assign(S, FILL_DEF[S.fMat]); syncControls(); applyAll(); return; }
    setKey(k, b.dataset.v);
  }); });
});
$('#foilShuffle').addEventListener('click', function(){ setKey('foilSeed', (S.foilSeed || 0) + 1); });
$('#fFoilShuffle').addEventListener('click', function(){ setKey('fFoilSeed', (S.fFoilSeed || 0) + 1); });
$('#matReset').addEventListener('click', function(){ Object.assign(S, MAT_DEF[S.mat]); syncControls(); applyAll(); });
$('#fMatReset').addEventListener('click', function(){ Object.assign(S, FILL_DEF[S.fMat]); syncControls(); applyAll(); });
$('#ratioBtn').addEventListener('click', function(){
  var im = IMG.front; if (!im){ toast('Load the front image first'); return; }
  setKey('H', Math.round(S.W * im.h / im.w));
  toast('Height set to ' + S.H + ' mm');
});

/* -------------------------------------------------------------- camera */
var zoom = 1;
function fitCamera(){
  var w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  camera.aspect = w / h;
  var t = Math.tan(camera.fov * Math.PI / 360);
  var dH = (S.H * 0.5 * 1.32) / t, dW = (S.W * 0.5 * 1.32) / (t * camera.aspect);
  var d = Math.max(dH, dW) * zoom;
  camera.position.set(0, 0, d); camera.near = d / 20; camera.far = d * 20;
  camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
}
function resize(){
  var w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); fitCamera();
}
window.addEventListener('resize', resize);

/* -------------------------------------------------------- interaction */
var ptr = { in:false, x:0, y:0, downX:0, downY:0, down:false };
var tiltX = 0, tiltY = 0, hoverK = 0;
var flipCur = 0, flipVel = 0, flipTarget = 0;
function packRect(){
  var w = stage.clientWidth, h = stage.clientHeight;
  var t = Math.tan(camera.fov * Math.PI / 360), d = camera.position.z;
  var hh = (S.H / 2) / (d * t) * (h / 2), hw = (S.W / 2) / (d * t) * (h / 2);
  return { cx:w/2, cy:h/2, hw:hw, hh:hh };
}
function overPack(){ var r = packRect(); return Math.abs(ptr.x - r.cx) < r.hw && Math.abs(ptr.y - r.cy) < r.hh; }
canvas.addEventListener('pointermove', function(e){
  var b = canvas.getBoundingClientRect(); ptr.x = e.clientX - b.left; ptr.y = e.clientY - b.top; ptr.in = true;
  canvas.classList.toggle('hot', overPack());
});
canvas.addEventListener('pointerleave', function(){ ptr.in = false; canvas.classList.remove('hot'); });
canvas.addEventListener('pointerdown', function(e){ ptr.down = true; ptr.downX = e.clientX; ptr.downY = e.clientY; });
canvas.addEventListener('pointerup', function(e){
  if (!ptr.down) return; ptr.down = false;
  if (Math.hypot(e.clientX - ptr.downX, e.clientY - ptr.downY) < 6) flip();
});
canvas.addEventListener('dblclick', function(){ zoom = 1; fitCamera(); flip(); });
canvas.addEventListener('wheel', function(e){
  e.preventDefault();
  zoom = Math.max(0.35, Math.min(3, zoom * Math.exp(e.deltaY * 0.0012)));
  fitCamera();
}, { passive:false });
function flip(){ flipTarget += Math.PI; }
function backVisible(){ return Math.cos(flipCur) < 0; }
$('#flipBtn').addEventListener('click', flip);
$('#viewBtn').addEventListener('click', function(){ zoom = 1; flipTarget = Math.round(flipTarget / (2*Math.PI)) * 2*Math.PI; fitCamera(); });
window.addEventListener('keydown', function(e){
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F' || e.key === ' '){ e.preventDefault(); flip(); }
  else if (e.key === 'g' || e.key === 'G'){ setKey('guides', !S.guides); }
});

/* drop an image on the pack: front → front; back → half under the pointer */
var dropEl = $('#drop');
stage.addEventListener('dragover', function(e){ e.preventDefault(); dropEl.classList.add('show'); dropEl.textContent = 'Drop to apply to the ' + dropSlotName(e) ; });
stage.addEventListener('dragleave', function(e){ if (e.target === stage || e.target === canvas) dropEl.classList.remove('show'); });
stage.addEventListener('drop', function(e){
  e.preventDefault(); dropEl.classList.remove('show');
  var f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && /\.json$/i.test(f.name)){ openProjectFile(f); return; }
  if (!f || !/^image\//.test(f.type)) return;
  var key = dropSlot(e);
  readFile(f).then(function(url){ return setSlotImage(key, url, f.name); }).then(function(){ toast(slotLabel(key) + ' ← ' + f.name); }).catch(function(){ toast('Could not load the image'); });
});
function dropSlot(e){
  if (!backVisible()) return 'front';
  var b = canvas.getBoundingClientRect(), x = e.clientX - b.left - b.width/2, y = e.clientY - b.top - b.height/2;
  return S.layout === 'v' ? (x < 0 ? 'backA' : 'backB') : (y < 0 ? 'backA' : 'backB');
}
function dropSlotName(e){ var k = dropSlot(e); return k === 'front' ? 'front' : k === 'backA' ? 'back · half A' : 'back · half B'; }

/* ----------------------------------------------------------------- loop */
var last = performance.now(), clock = 0;
function frame(now){
  var dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  if (geoDirty){ buildGeometry(); geoDirty = false; }

  // flip: spring with a touch of overshoot
  var k = 120, c = 2 * Math.sqrt(k) * 0.62;
  var steps = 4, h = dt / steps;
  for (var i = 0; i < steps; i++){ flipVel += (k * (flipTarget - flipCur) - c * flipVel) * h; flipCur += flipVel * h; }
  flipG.rotation.y = flipCur;

  // hover tilt
  var tx = 0, ty = 0, over = false;
  if (ptr.in){
    var r = packRect();
    var nx = Math.max(-1.25, Math.min(1.25, (ptr.x - r.cx) / r.hw)), ny = Math.max(-1.25, Math.min(1.25, (ptr.y - r.cy) / r.hh));
    var tl = S.tilt * Math.PI / 180;
    ty = nx * tl; tx = ny * tl;   // pointer right → right edge goes back; pointer up → top goes back
    over = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
  } else if (S.idle){
    ty = Math.sin(clock * 0.55) * 0.13; tx = Math.sin(clock * 0.8 + 1) * 0.05;
  }
  var a = 1 - Math.exp(-dt * 7);
  tiltX += (tx - tiltX) * a; tiltY += (ty - tiltY) * a;
  hoverK += ((over ? 1 : 0) - hoverK) * (1 - Math.exp(-dt * 9));
  tiltG.rotation.set(tiltX, tiltY, 0);
  var sc = 1 + 0.025 * hoverK; tiltG.scale.set(sc, sc, sc);
  tiltG.position.y = S.idle && !ptr.in ? Math.sin(clock * 1.1) * S.H * 0.008 : tiltG.position.y * (1 - a);

  renderer.render(scene, camera);
  updateHud();
  requestAnimationFrame(frame);
}
var hudState = '';
function updateHud(){
  var side = backVisible() ? 'Back' : 'Front';
  var s = side + '|' + S.W + '|' + S.H;
  if (s === hudState) return; hudState = s;
  $('#pill').textContent = side;
  $('#hud').innerHTML = '<b>' + side + '</b> · ' + S.W + ' × ' + S.H + ' mm · click the pack to flip';
}

/* --------------------------------------------------------------- export */
function download(url, name){ var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
function stamp(){ var d = new Date(), p = function(n){ return String(n).padStart(2, '0'); }; return d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
$('#pngBtn').addEventListener('click', function(){
  var pr = renderer.getPixelRatio();
  renderer.setPixelRatio(3); resize();
  renderer.render(scene, camera);
  var url = canvas.toDataURL('image/png');
  renderer.setPixelRatio(pr); resize();
  download(url, 'booster-pack-' + (backVisible() ? 'back' : 'front') + '-' + stamp() + '.png');
  toast('PNG exported' + (S.transparent ? ' (transparent background)' : ''));
});

/* templates: PNG at the recommended size with the crimp / flap / margin zones drawn on it */
function templateCanvas(key){
  var vert = S.layout === 'v', mm = regionMM(key), px = recPx(key);
  var c = document.createElement('canvas'); c.width = px[0]; c.height = px[1];
  var x = c.getContext('2d'), k = px[0] / mm[0];
  x.fillStyle = '#f4f3f0'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(0,0,0,.06)'; x.lineWidth = 1;
  for (var g = 0; g <= mm[0]; g += 5){ x.beginPath(); x.moveTo(g*k, 0); x.lineTo(g*k, c.height); x.stroke(); }
  for (g = 0; g <= mm[1]; g += 5){ x.beginPath(); x.moveTo(0, g*k); x.lineTo(c.width, g*k); x.stroke(); }
  // which edges are crimp ends / outer side edges / flap edges
  var crimpEdges = vert ? ['top', 'bottom'] : ['left', 'right'];
  var sideEdges = [];
  if (key === 'front') sideEdges = vert ? ['left', 'right'] : ['top', 'bottom'];
  if (key === 'backA') sideEdges = [vert ? 'left' : 'top'];
  if (key === 'backB') sideEdges = [vert ? 'right' : 'bottom'];
  var flapEdge = null;
  if (key === 'backA' && S.flapSide === 'A') flapEdge = vert ? 'right' : 'bottom';
  if (key === 'backB' && S.flapSide === 'B') flapEdge = vert ? 'left' : 'top';
  function band(edge, depthMM, fill){
    var d = depthMM * k; x.fillStyle = fill;
    if (edge === 'top') x.fillRect(0, 0, c.width, d);
    if (edge === 'bottom') x.fillRect(0, c.height - d, c.width, d);
    if (edge === 'left') x.fillRect(0, 0, d, c.height);
    if (edge === 'right') x.fillRect(c.width - d, 0, d, c.height);
  }
  function line(edge, depthMM, color, dash){
    var d = depthMM * k; x.strokeStyle = color; x.lineWidth = Math.max(2, k * 0.25); x.setLineDash(dash ? [k*1.5, k*1.5] : []);
    x.beginPath();
    if (edge === 'top'){ x.moveTo(0, d); x.lineTo(c.width, d); }
    if (edge === 'bottom'){ x.moveTo(0, c.height - d); x.lineTo(c.width, c.height - d); }
    if (edge === 'left'){ x.moveTo(d, 0); x.lineTo(d, c.height); }
    if (edge === 'right'){ x.moveTo(c.width - d, 0); x.lineTo(c.width - d, c.height); }
    x.stroke(); x.setLineDash([]);
  }
  if (key !== 'flap'){
    crimpEdges.forEach(function(e){ band(e, S.crimp, 'rgba(229,72,77,.16)'); band(e, S.teeth, 'rgba(229,72,77,.35)'); line(e, S.crimp, '#e5484d'); line(e, S.crimp + 3, '#ff5a1f', true); });
    sideEdges.forEach(function(e){ line(e, 3, '#ff5a1f', true); });
    if (flapEdge){ band(flapEdge, S.flapW, 'rgba(40,110,255,.18)'); line(flapEdge, S.flapW, '#2b6cff'); }
  } else {
    crimpEdges.forEach(function(e){ band(e, S.crimp, 'rgba(229,72,77,.16)'); line(e, S.crimp, '#e5484d'); });
  }
  // labels
  x.fillStyle = '#1c1b19'; x.textAlign = 'center'; x.textBaseline = 'middle';
  var fs = Math.max(14, Math.min(c.width, c.height) * 0.06);
  x.font = '700 ' + fs + 'px ui-sans-serif,system-ui,Helvetica,Arial';
  x.fillText(slotLabel(key).toUpperCase(), c.width/2, c.height/2 - fs*0.9);
  x.font = '500 ' + fs*0.62 + 'px ui-sans-serif,system-ui,Helvetica,Arial';
  x.fillStyle = '#5f5b54';
  x.fillText(px[0] + ' × ' + px[1] + ' px  ·  ' + fmt(mm[0]) + ' × ' + fmt(mm[1]) + ' mm  ·  16 px/mm', c.width/2, c.height/2 + fs*0.2);
  x.font = '500 ' + fs*0.5 + 'px ui-sans-serif,system-ui,Helvetica,Arial';
  var legend = key === 'flap' ? ['red: crimp seal'] : ['red: crimp seal (serrated / cut teeth)', 'dashed orange: safe margin 3 mm'].concat(flapEdge ? ['blue: covered by the flap'] : []);
  legend.forEach(function(t, i){ x.fillText(t, c.width/2, c.height/2 + fs*(1.1 + i*0.75)); });
  return c;
}
function downloadTemplate(key){
  download(templateCanvas(key).toDataURL('image/png'), 'template-' + key + '-' + recPx(key).join('x') + '.png');
}
$('#tplAllBtn').addEventListener('click', function(){
  var keys = ['front', 'backA', 'backB'].concat(S.flapW > 0 ? ['flap'] : []);
  keys.forEach(function(k, i){ setTimeout(function(){ downloadTemplate(k); }, i * 350); });
  toast('Downloading ' + keys.length + ' templates');
});

/* ------------------------------------------------------------- projects */
$('#saveBtn').addEventListener('click', function(){
  var data = { tool:'booster-pack', version:2, settings:S, slots:CFG, images:{}, fx:[] };
  SLOTS.forEach(function(k){ if (IMG[k]) data.images[k] = { url:IMG[k].url, name:IMG[k].name }; });
  FX.forEach(function(f){ var o = {}; for (var p in f) if (p !== 'tex' && p !== 'id') o[p] = f[p]; data.fx.push(o); });
  var blob = new Blob([JSON.stringify(data)], { type:'application/json' });
  var url = URL.createObjectURL(blob);
  download(url, 'booster-pack-' + stamp() + '.json');
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  toast('Project saved (images included)');
});
var jsonIn = $('#jsonIn');
$('#openBtn').addEventListener('click', function(){ jsonIn.click(); });
jsonIn.addEventListener('change', function(){ var f = jsonIn.files[0]; jsonIn.value = ''; if (f) openProjectFile(f); });
function openProjectFile(f){
  var fr = new FileReader();
  fr.onload = function(){
    var d; try { d = JSON.parse(fr.result); } catch(e){ toast('Not a valid project file'); return; }
    if (!d || d.tool !== 'booster-pack'){ toast('Not a Booster Pack project'); return; }
    SLOTS.forEach(function(k){ if (IMG[k]) IMG[k].tex.dispose(); IMG[k] = null; });
    FX.forEach(function(f){ f.tex.dispose(); }); FX = [];
    S = Object.assign({}, DEF);
    for (var k in DEF) if (d.settings && k in d.settings) S[k] = d.settings[k];
    SLOTS.forEach(function(k){ CFG[k] = Object.assign(defSlotCfg(), d.slots && d.slots[k]); });
    geoDirty = true;
    var jobs = [];
    SLOTS.forEach(function(k){ var im = d.images && d.images[k]; if (im) jobs.push(setSlotImage(k, im.url, im.name)); });
    var chain = Promise.resolve();
    (d.fx || []).slice(0, MAX_FX).forEach(function(f){ chain = chain.then(function(){ return addFx(f.url, f.name, f); }); });
    jobs.push(chain);
    Promise.all(jobs).then(function(){ renderSlots(); renderFx(); syncControls(); applyAll(); fitCamera(); toast('Project opened'); })
      .catch(function(){ toast('Some images could not be loaded'); });
  };
  fr.readAsText(f);
}
$('#resetBtn').addEventListener('click', function(){
  SLOTS.forEach(function(k){ if (IMG[k]) IMG[k].tex.dispose(); IMG[k] = null; });
  FX.forEach(function(f){ f.tex.dispose(); }); FX = [];
  S = Object.assign({}, DEF); geoDirty = true; zoom = 1;
  SLOTS.forEach(function(k){ CFG[k] = defSlotCfg(); });
  renderSlots(); renderFx(); syncControls(); applyAll(); fitCamera();
  loadDefaultArt();
});

/* ---------------------------------------------------------------- misc */
var toastT;
function toast(msg){ var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, 1800); }
function showError(msg){ var e = document.getElementById('err'); if (e){ e.textContent = msg; e.classList.add('show'); } }

/* ---------------------------------------------------------------- boot */
renderSlots(); renderFx(); syncControls(); applyAll(); resize();
loadDefaultArt();
requestAnimationFrame(function(t){ last = t; frame(t); });

// small hook for automated checks / scripting from the console
window.BoosterPack = { S:S, setKey:setKey, setSlotImage:setSlotImage, addFx:addFx, flip:flip, FX:FX,
  get state(){ return { S:S, flip:flipCur, back:backVisible() }; } };
})();
