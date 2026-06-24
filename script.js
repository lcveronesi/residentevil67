/* ═══════════════════════════════════════════════════════════════════
   MANSION OF THE DEAD — script.js
   Survival Horror 2D | Pure HTML5 Canvas + JavaScript
   Versão completa — sem dependências externas
═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   1. UTILITÁRIOS GERAIS
───────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));

/* ─────────────────────────────────────────────────────────────────
   2. GERENCIADOR DE TELAS
───────────────────────────────────────────────────────────────── */
const Screens = {
  current: null,
  show(id) {
    // esconde tela atual
    if (this.current) {
      const old = $(this.current);
      if (old) old.classList.remove('active');
    }
    const el = $(id);
    if (el) el.classList.add('active');
    this.current = id;
  },
  showOverlay(id) {
    const el = $(id);
    if (el) el.classList.add('active');
  },
  hideOverlay(id) {
    const el = $(id);
    if (el) el.classList.remove('active');
  },
  isOverlayOpen(id) {
    const el = $(id);
    return el ? el.classList.contains('active') : false;
  }
};

/* ─────────────────────────────────────────────────────────────────
   3. SISTEMA DE ÁUDIO (Web Audio API)
───────────────────────────────────────────────────────────────── */
const Audio = (() => {
  let ctx = null;
  let musicGain = null;
  let sfxGain   = null;
  let ambientNode = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = ctx.createGain(); musicGain.gain.value = 0.18;
    sfxGain   = ctx.createGain(); sfxGain.gain.value   = 0.5;
    musicGain.connect(ctx.destination);
    sfxGain.connect(ctx.destination);
  }

  // Ruído branco colorido para música ambiente
  function playAmbient() {
    if (!ctx) return;
    if (ambientNode) { ambientNode.stop(); ambientNode = null; }

    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data   = buffer.getChannelData(0);

    // Ruído marrom (brown noise) — mais atmosférico
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut  = data[i];
      data[i] *= 3.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;

    // Filtro passa-baixo para sensação de distância
    const filter = ctx.createBiquadFilter();
    filter.type      = 'lowpass';
    filter.frequency.value = 280;
    filter.Q.value   = 0.5;

    // LFO tremolo
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value  = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(musicGain.gain);
    lfo.start();

    source.connect(filter);
    filter.connect(musicGain);
    source.start();
    ambientNode = source;
  }

  function stopAmbient() {
    if (ambientNode) { try { ambientNode.stop(); } catch(e){} ambientNode = null; }
  }

  // Gera e toca um som sintético
  function playSFX(type) {
    if (!ctx) return;
    const now = ctx.currentTime;

    switch(type) {
      case 'shoot': {
        // Barulho de pistola
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        const s = ctx.createBufferSource(); s.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 700;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.9, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        s.connect(f); f.connect(g); g.connect(sfxGain); s.start(now);
        break;
      }
      case 'reload': {
        // Som de recarga
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'square'; osc.frequency.setValueAtTime(320, now); osc.frequency.linearRampToValueAtTime(180, now + 0.15);
        g.gain.setValueAtTime(0.25, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(g); g.connect(sfxGain); osc.start(now); osc.stop(now + 0.2);
        break;
      }
      case 'step': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * 0.4;
        const s = ctx.createBufferSource(); s.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
        const g = ctx.createGain(); g.gain.value = 0.55;
        s.connect(f); f.connect(g); g.connect(sfxGain); s.start(now);
        break;
      }
      case 'door': {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(80, now); osc.frequency.linearRampToValueAtTime(40, now + 0.5);
        g.gain.setValueAtTime(0.4, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(g); g.connect(sfxGain); osc.start(now); osc.stop(now + 0.55);
        break;
      }
      case 'pickup': {
        [0, 0.1, 0.2].forEach((t, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = 440 + i * 110;
          g.gain.setValueAtTime(0.2, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
          o.connect(g); g.connect(sfxGain); o.start(now + t); o.stop(now + t + 0.15);
        });
        break;
      }
      case 'hurt': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
        const s = ctx.createBufferSource(); s.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.8;
        const g = ctx.createGain(); g.gain.value = 0.7;
        s.connect(f); f.connect(g); g.connect(sfxGain); s.start(now);
        break;
      }
      case 'zombie_groan': {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        const dist2 = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = (3 + 20) * x * 20 * Math.PI / (Math.PI + 20 * Math.abs(x)); }
        dist2.curve = curve;
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(60 + rand(-10, 10), now);
        osc.frequency.linearRampToValueAtTime(45 + rand(-5, 5), now + 0.6);
        g.gain.setValueAtTime(0.001, now); g.gain.linearRampToValueAtTime(0.3, now + 0.1);
        g.gain.linearRampToValueAtTime(0.001, now + 0.65);
        osc.connect(dist2); dist2.connect(g); g.connect(sfxGain);
        osc.start(now); osc.stop(now + 0.7);
        break;
      }
      case 'zombie_die': {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 0.7) * 0.6;
        const s = ctx.createBufferSource(); s.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        const g = ctx.createGain(); g.gain.value = 0.8;
        s.connect(f); f.connect(g); g.connect(sfxGain); s.start(now);
        break;
      }
      case 'puzzle_open': {
        [0, 0.08, 0.16, 0.24].forEach((t, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = 523 + i * 130;
          g.gain.setValueAtTime(0.3, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.22);
          o.connect(g); g.connect(sfxGain); o.start(now + t); o.stop(now + t + 0.22);
        });
        break;
      }
      case 'no_ammo': {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'square'; osc.frequency.value = 160;
        g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(g); g.connect(sfxGain); osc.start(now); osc.stop(now + 0.12);
        break;
      }
    }
  }

  return { init, playAmbient, stopAmbient, playSFX };
})();

/* ─────────────────────────────────────────────────────────────────
   4. DEFINIÇÃO DO MAPA (TILES E SALAS)
───────────────────────────────────────────────────────────────── */
const TILE = 32;  // tamanho do tile em pixels
const MAP_W = 80; // largura do mapa em tiles
const MAP_H = 60; // altura do mapa em tiles

/*  Tipos de tile:
    0 = vazio/parede sólida
    1 = chão normal
    2 = chão de corredor
    3 = chão de laboratório (diferente visual)
    4 = chão de biblioteca
    5 = chão de enfermaria
*/

// Sala: {x, y, w, h, name, floorType, color}
const ROOMS_DEF = [
  // Salão principal (centro)
  { x:28, y:24, w:24, h:12, name:'SALÃO PRINCIPAL',   floor:1, color:'#1a1614' },
  // Corredor norte
  { x:34, y:16, w:12, h: 9, name:'CORREDOR NORTE',    floor:2, color:'#141414' },
  // Biblioteca (noroeste)
  { x: 6, y: 6, w:20, h:16, name:'BIBLIOTECA',        floor:4, color:'#16130d' },
  // Corredor oeste
  { x:22, y:16, w: 8, h:12, name:'CORREDOR OESTE',    floor:2, color:'#141414' },
  // Laboratório (nordeste)
  { x:52, y: 6, w:22, h:16, name:'LABORATÓRIO',       floor:3, color:'#0d141a' },
  // Corredor leste
  { x:50, y:16, w: 6, h:12, name:'CORREDOR LESTE',    floor:2, color:'#141414' },
  // Sala de segurança (sudoeste)
  { x: 6, y:34, w:16, h:14, name:'SALA DE SEGURANÇA', floor:1, color:'#121217' },
  // Corredor sul-oeste
  { x:22, y:34, w: 6, h:14, name:'CORREDOR SW',       floor:2, color:'#141414' },
  // Enfermaria (sudeste)
  { x:56, y:34, w:18, h:14, name:'ENFERMARIA',        floor:5, color:'#0d1a14' },
  // Corredor sul-leste
  { x:52, y:34, w: 6, h:14, name:'CORREDOR SE',       floor:2, color:'#141414' },
  // Área secreta (fundo, acesso pelo laboratório)
  { x:54, y: 2, w:14, h: 6, name:'ÁREA SECRETA',      floor:3, color:'#0a0a12' },
  // Sala de saída (centro-sul)
  { x:32, y:46, w:16, h:10, name:'SAÍDA — GARAGEM',   floor:2, color:'#131310' },
  // Corredor central-sul
  { x:36, y:38, w: 8, h: 8, name:'CORREDOR CENTRAL',  floor:2, color:'#141414' },
];

// Mapa de tiles (0=parede, 1..5=chão com tipo)
let mapTiles = null;

function buildMap() {
  // Inicializa tudo como parede
  mapTiles = new Uint8Array(MAP_W * MAP_H);

  // Preenche salas
  for (const r of ROOMS_DEF) {
    for (let ty = r.y; ty < r.y + r.h; ty++) {
      for (let tx = r.x; tx < r.x + r.w; tx++) {
        if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H)
          mapTiles[ty * MAP_W + tx] = r.floor;
      }
    }
  }
}

function tileAt(tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return 0;
  return mapTiles[ty * MAP_W + tx];
}

function isSolid(tx, ty) { return tileAt(tx, ty) === 0; }

/* Retorna a cor de chão de um tile */
function floorColor(type) {
  switch(type) {
    case 1: return '#1a1614';
    case 2: return '#141218';
    case 3: return '#0d141a';
    case 4: return '#16130d';
    case 5: return '#0d1a14';
    default: return '#000';
  }
}

/* Retorna qual sala contém pixel world (px, py) */
function getRoomAt(wx, wy) {
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  for (const r of ROOMS_DEF) {
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h)
      return r;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────
   5. ITENS DO MUNDO
───────────────────────────────────────────────────────────────── */
const ITEM_DEFS = {
  key_blue:   { name:'Chave Azul',     icon:'🔑', color:'#3498db', desc:'Uma chave de metal azul. Abre portas do corredor oeste.', usable:false, qty:1 },
  key_red:    { name:'Chave Vermelha', icon:'🔑', color:'#e74c3c', desc:'Uma chave vermelha enferrujada. Abre a sala de segurança.', usable:false, qty:1 },
  key_gold:   { name:'Chave Dourada',  icon:'🔑', color:'#f1c40f', desc:'Uma chave dourada ornamentada. Abre a saída final.', usable:false, qty:1 },
  medkit:     { name:'Kit Médico',     icon:'🩹', color:'#2ecc71', desc:'Restaura 40 pontos de vida. Use quando estiver machucado.', usable:true,  qty:1 },
  ammo:       { name:'Munição',        icon:'💠', color:'#95a5a6', desc:'Caixa de balas para pistola. +12 munição.', usable:true,  qty:1 },
  battery:    { name:'Baterias',       icon:'🔋', color:'#f39c12', desc:'Baterias para a lanterna. Recarrega completamente.', usable:true,  qty:1 },
  doc_1:      { name:'Diário do Dr.Voss',  icon:'📄', color:'#c8b882', desc:'Documento secreto.', usable:false, qty:1, doc:true },
  doc_2:      { name:'Relatório do Vírus', icon:'📄', color:'#c8b882', desc:'Documento secreto.', usable:false, qty:1, doc:true },
  doc_3:      { name:'Carta de Claire',    icon:'📄', color:'#c8b882', desc:'Documento secreto.', usable:false, qty:1, doc:true },
  doc_4:      { name:'Memo de Segurança',  icon:'📄', color:'#c8b882', desc:'Documento secreto.', usable:false, qty:1, doc:true },
  doc_5:      { name:'Nota Final',         icon:'📄', color:'#c8b882', desc:'Documento secreto.', usable:false, qty:1, doc:true },
};

/* Documentos (texto completo) */
const DOCUMENTS = {
  doc_1: {
    title: 'Diário do Dr. Heinrich Voss — Entrada Final',
    body: `Dia 47 desde o primeiro caso.

O experimento fugiu ao nosso controle muito antes de eu perceber.
O Composto NX-7 foi desenvolvido para estender a vida humana,
mas a mutação gerou algo que não consigo chamar de vida.

Tranquei os corredores do leste. Há sobreviventes na sala de segurança.
O código do laboratório é 4826.
Se alguém encontrar isso... saia pela garagem. A chave dourada
está no meu escritório, na área restrita.

Que Deus nos perdoe pelo que criamos aqui.
— Dr. H. Voss`
  },
  doc_2: {
    title: 'Relatório Interno — Projeto LAZARUS',
    body: `CONFIDENCIAL — NÍVEL 5

Relatório de contenção — NX-7 Fase 3

A taxa de transmissão foi subestimada em 300%.
O agente se espalha por contato com fluidos e pelo ar
em concentrações acima de 0.03 ppm.

Todos os andares foram contaminados às 03h17.
Quarentena ativada automaticamente. Saídas externas bloqueadas.

O sistema de ventilação da garagem possui filtro HEPA.
Código de acesso: 1-9-3-7. Repito: 1-9-3-7.

Sobreviventes devem usar a rota sul.`
  },
  doc_3: {
    title: 'Carta de Claire Sinclair',
    body: `Para quem encontrar isso,

Meu nome é Claire. Trabalhei aqui como pesquisadora por 6 anos.

O que aconteceu não foi acidente. Alguém liberou o vírus
intencionalmente. Eu vi. Não direi o nome por escrito,
mas a câmera de segurança da biblioteca gravou tudo.

A fita está na sala de controle, atrás do painel vermelho.

Estou na enfermaria. Fui mordida no braço esquerdo.
Provavelmente não tenho muito tempo.

Se você escapar... conte ao mundo o que aconteceu aqui.
                                              — Claire`
  },
  doc_4: {
    title: 'Memorando de Segurança — Protocolo VERMELHO',
    body: `PROTOCOLO VERMELHO — TODOS OS AGENTES DE SEGURANÇA

Ao ativar o Protocolo Vermelho:

1. Selem todos os corredores com chaves magnéticas.
   - AZUL: Corredor Oeste (biblioteca → salão)
   - VERMELHA: Sala de Segurança
   - DOURADA: Garagem/Saída

2. Distribuição das chaves em caso de emergência:
   - Chave Azul: Armário B3, Biblioteca
   - Chave Vermelha: Mesa Dr. Voss, Salão Principal
   - Chave Dourada: Área Secreta, piso -1

3. Código de anulação do lockdown: 7-7-4-1

Memorize e destrua este documento.`
  },
  doc_5: {
    title: 'Nota Final — Sem Autor',
    body: `Você encontrou todos os documentos.
Então você sabe a verdade.

O vírus foi criado aqui dentro.
A mansão era apenas uma fachada.
O verdadeiro laboratório fica três andares abaixo.

Eles nunca vão parar.
Mesmo que você escape... haverá outra mansão.
Outro vírus. Outro experimento.

A única forma de acabar com isso
é levar essa evidência para fora.

Corra. E não olhe para trás.

                    — O último sobrevivente`
  }
};

/* ─────────────────────────────────────────────────────────────────
   6. OBJETOS INTERATIVOS DO MUNDO
───────────────────────────────────────────────────────────────── */
// Cada objeto: { x, y, type, id, label, locked, keyRequired, puzzleId, itemId, collected, opened }
let worldObjects = [];

function initWorldObjects() {
  worldObjects = [
    // ── ITENS COLETÁVEIS ──────────────────────────────────────
    // Chave Azul (Biblioteca, armário B3)
    { id:'item_key_blue',  type:'item', x:10*TILE+16, y:12*TILE+16, itemId:'key_blue',  label:'Chave Azul',     collected:false },
    // Chave Vermelha (Salão Principal, mesa)
    { id:'item_key_red',   type:'item', x:38*TILE+16, y:29*TILE+16, itemId:'key_red',   label:'Chave Vermelha', collected:false },
    // Chave Dourada (Área Secreta)
    { id:'item_key_gold',  type:'item', x:60*TILE+16, y: 4*TILE+16, itemId:'key_gold',  label:'Chave Dourada',  collected:false },
    // Kits médicos (3 ao longo do mapa)
    { id:'item_med_1',     type:'item', x:35*TILE+16, y:26*TILE+16, itemId:'medkit',    label:'Kit Médico',     collected:false },
    { id:'item_med_2',     type:'item', x:61*TILE+16, y:39*TILE+16, itemId:'medkit',    label:'Kit Médico',     collected:false },
    { id:'item_med_3',     type:'item', x: 9*TILE+16, y:38*TILE+16, itemId:'medkit',    label:'Kit Médico',     collected:false },
    // Munição
    { id:'item_ammo_1',    type:'item', x:57*TILE+16, y:10*TILE+16, itemId:'ammo',      label:'Munição',        collected:false },
    { id:'item_ammo_2',    type:'item', x:32*TILE+16, y:25*TILE+16, itemId:'ammo',      label:'Munição',        collected:false },
    { id:'item_ammo_3',    type:'item', x:14*TILE+16, y:36*TILE+16, itemId:'ammo',      label:'Munição',        collected:false },
    // Baterias
    { id:'item_bat_1',     type:'item', x:65*TILE+16, y:42*TILE+16, itemId:'battery',   label:'Baterias',       collected:false },
    { id:'item_bat_2',     type:'item', x:56*TILE+16, y: 9*TILE+16, itemId:'battery',   label:'Baterias',       collected:false },
    // Documentos
    { id:'item_doc_1',     type:'item', x:15*TILE+16, y:14*TILE+16, itemId:'doc_1',     label:'Documento',      collected:false },
    { id:'item_doc_2',     type:'item', x:62*TILE+16, y:12*TILE+16, itemId:'doc_2',     label:'Documento',      collected:false },
    { id:'item_doc_3',     type:'item', x:64*TILE+16, y:41*TILE+16, itemId:'doc_3',     label:'Documento',      collected:false },
    { id:'item_doc_4',     type:'item', x: 8*TILE+16, y:35*TILE+16, itemId:'doc_4',     label:'Documento',      collected:false },
    { id:'item_doc_5',     type:'item', x:61*TILE+16, y: 3*TILE+16, itemId:'doc_5',     label:'Documento',      collected:false },

    // ── PORTAS (desbloqueiam com chave ou puzzle) ─────────────
    // Porta oeste (corredor → biblioteca) requer chave azul
    { id:'door_blue',  type:'door', x:22*TILE, y:20*TILE, w:TILE*2, h:TILE, label:'Porta Azul',  locked:true, keyRequired:'key_blue',  opened:false },
    // Porta sala de segurança requer chave vermelha
    { id:'door_red',   type:'door', x:22*TILE, y:36*TILE, w:TILE,   h:TILE*2, label:'Porta Vermelha', locked:true, keyRequired:'key_red', opened:false },
    // Porta saída final (garagem) requer chave dourada
    { id:'door_gold',  type:'door', x:36*TILE, y:46*TILE, w:TILE*4, h:TILE,   label:'Saída — Porta Dourada', locked:true, keyRequired:'key_gold', opened:false },
    // Porta laboratório → área secreta (puzzle)
    { id:'door_lab',   type:'door', x:60*TILE, y: 6*TILE, w:TILE*2, h:TILE,   label:'Porta Segurança', locked:true, puzzleId:'puzzle_lab', opened:false },

    // ── PAINÉIS DE PUZZLE ─────────────────────────────────────
    // Painel laboratório (código 4826)
    { id:'puzzle_lab',   type:'puzzle', x:62*TILE+8, y:7*TILE+8, puzzleId:'puzzle_lab',  label:'Painel de Acesso',  solved:false },
    // Painel sala de segurança (código 7741)
    { id:'puzzle_sec',   type:'puzzle', x: 7*TILE+8, y:42*TILE+8, puzzleId:'puzzle_sec', label:'Terminal de Controle', solved:false },

    // ── SAÍDA ─────────────────────────────────────────────────
    { id:'exit_door', type:'exit', x:36*TILE+TILE, y:53*TILE, label:'SAÍDA — ESCAPE!', active:false },
  ];
}

/* Dados dos puzzles */
const PUZZLE_DATA = {
  puzzle_lab: {
    title:  'PAINEL DE ACESSO — LABORATÓRIO',
    hint:   'Dica: Verifique o diário do Dr. Voss.',
    code:   '4826',
    reward: null,  // abre porta door_lab
  },
  puzzle_sec: {
    title:  'TERMINAL DE CONTROLE',
    hint:   'Dica: Código de anulação no Memo de Segurança.',
    code:   '7741',
    reward: 'unlock_exit',
  },
};

/* ─────────────────────────────────────────────────────────────────
   7. INIMIGOS (ZUMBIS)
───────────────────────────────────────────────────────────────── */
const ZOMBIE_SPEED_PATROL = 40;   // px/s
const ZOMBIE_SPEED_CHASE  = 70;
const ZOMBIE_VISION       = 160;  // raio de visão
const ZOMBIE_ATK_RANGE    = 28;
const ZOMBIE_ATK_COOLDOWN = 1.5;  // s
const ZOMBIE_HP           = 3;    // acertos para matar
const ZOMBIE_DAMAGE       = 15;

let enemies = [];

function spawnEnemies() {
  enemies = [
    // Salão principal
    mkZombie(32*TILE+16, 26*TILE+16, [[32*TILE,26*TILE],[46*TILE,26*TILE],[46*TILE,34*TILE],[32*TILE,34*TILE]]),
    mkZombie(44*TILE+16, 28*TILE+16, [[44*TILE,28*TILE],[34*TILE,28*TILE]]),
    mkZombie(40*TILE+16, 30*TILE+16, [[40*TILE,30*TILE],[50*TILE,30*TILE]]),
    // Corredor norte
    mkZombie(36*TILE+16, 18*TILE+16, [[36*TILE,18*TILE],[44*TILE,18*TILE]]),
    // Biblioteca
    mkZombie(10*TILE+16, 10*TILE+16, [[10*TILE,8*TILE],[22*TILE,8*TILE],[22*TILE,20*TILE],[10*TILE,20*TILE]]),
    mkZombie(18*TILE+16, 14*TILE+16, [[18*TILE,8*TILE],[8*TILE,8*TILE]]),
    // Laboratório
    mkZombie(58*TILE+16, 10*TILE+16, [[56*TILE,8*TILE],[72*TILE,8*TILE],[72*TILE,20*TILE],[56*TILE,20*TILE]]),
    mkZombie(66*TILE+16, 14*TILE+16, [[66*TILE,8*TILE],[58*TILE,14*TILE]]),
    // Sala de segurança
    mkZombie( 9*TILE+16, 38*TILE+16, [[8*TILE,36*TILE],[20*TILE,36*TILE],[20*TILE,46*TILE],[8*TILE,46*TILE]]),
    // Enfermaria
    mkZombie(60*TILE+16, 38*TILE+16, [[58*TILE,36*TILE],[72*TILE,36*TILE],[72*TILE,46*TILE],[58*TILE,46*TILE]]),
    mkZombie(68*TILE+16, 42*TILE+16, [[68*TILE,36*TILE],[60*TILE,42*TILE]]),
    // Corredor sul
    mkZombie(38*TILE+16, 50*TILE+16, [[36*TILE,48*TILE],[46*TILE,52*TILE]]),
    // Área secreta (mais difícil)
    mkZombie(57*TILE+16, 4*TILE+16,  [[56*TILE,2*TILE],[66*TILE,2*TILE],[66*TILE,6*TILE],[56*TILE,6*TILE]]),
  ];
}

function mkZombie(x, y, patrol) {
  return {
    x, y, w:20, h:28,
    hp: ZOMBIE_HP, maxHp: ZOMBIE_HP,
    state: 'patrol',   // 'patrol' | 'chase' | 'attack' | 'dead'
    patrol,
    patrolIdx: 0,
    patrolDir: 1,
    dir: { x:1, y:0 },
    atkTimer: 0,
    groanTimer: rand(2, 8),
    flashTimer: 0,
    dead: false,
    deathTimer: 0,
  };
}

/* ─────────────────────────────────────────────────────────────────
   8. PARTÍCULAS
───────────────────────────────────────────────────────────────── */
let particles = [];

function spawnParticles(x, y, color, count, speed, life) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const spd   = rand(speed * 0.4, speed);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: rand(life * 0.5, life),
      maxLife: life,
      color,
      size: rand(2, 5),
    });
  }
}

function spawnBloodParticles(x, y) {
  spawnParticles(x, y, '#8B0000', 8, 80, 0.4);
  spawnParticles(x, y, '#C0392B', 5, 60, 0.3);
}

function spawnMuzzleParticles(x, y) {
  spawnParticles(x, y, '#ffe066', 5, 120, 0.15);
  spawnParticles(x, y, '#ffaa00', 4, 90,  0.12);
}

/* ─────────────────────────────────────────────────────────────────
   9. ESTADO DO JOGO
───────────────────────────────────────────────────────────────── */
const Game = {
  running:    false,
  paused:     false,
  over:       false,
  victory:    false,

  // Jogador
  player: {
    x: 38 * TILE, y: 28 * TILE,   // Começa no salão principal
    w: 18, h: 24,
    speed: 90,    // px/s caminhando
    runSpeed: 155,
    hp: 100, maxHp: 100,
    stamina: 100, maxStamina: 100,
    staminaRegen: 25,   // por segundo
    staminaDrain: 40,   // por segundo ao correr
    isRunning: false,
    flashTimer: 0,
  },

  // Câmera
  cam: { x:0, y:0 },

  // Lanterna
  flashlight: { battery: 100, drain: 1.5 },

  // Arma
  gun: { ammo: 12, reserve: 48, reloading: false, reloadTimer: 0, reloadTime: 2.0, shootCooldown: 0, shootRate: 0.35 },

  // Inventário
  inventory: [],
  maxSlots: 10,

  // Progresso
  keys:      { blue:false, red:false, gold:false },
  docsFound: 0,
  totalDocs: 5,
  exitUnlocked: false,

  // Mouse (coordenadas na tela)
  mouse: { x:0, y:0 },

  // Controles
  keys_held: {},

  // Timers
  stepTimer:   0,
  stepInterval:0.35,
  damageFlashTimer: 0,
  cameraShakeTimer: 0,
  notifyTimer: 0,

  // Sala atual
  currentRoom: null,
  roomNameTimer: 0,

  // Objeto próximo para interagir
  nearObject: null,

  // Puzzle ativo
  activePuzzle: null,
  puzzleInput:  '',

  // Documento ativo
  activeDoc: null,

  // Item inspecionado
  inspectedSlot: -1,
};

/* ─────────────────────────────────────────────────────────────────
   10. INVENTÁRIO
───────────────────────────────────────────────────────────────── */
function addToInventory(itemId) {
  const def = ITEM_DEFS[itemId];
  if (!def) return false;

  // Verifica se já tem (para itens empilháveis) - munição e medkit
  if (itemId === 'ammo' || itemId === 'medkit' || itemId === 'battery') {
    const existing = Game.inventory.find(s => s.itemId === itemId);
    if (existing) { existing.qty++; return true; }
  }

  if (Game.inventory.length >= Game.maxSlots) {
    showNotification('INVENTÁRIO CHEIO!');
    return false;
  }
  Game.inventory.push({ itemId, qty: def.qty });
  return true;
}

function removeFromInventory(index, qty = 1) {
  const slot = Game.inventory[index];
  if (!slot) return;
  slot.qty -= qty;
  if (slot.qty <= 0) Game.inventory.splice(index, 1);
}

function hasItem(itemId) {
  return Game.inventory.some(s => s.itemId === itemId);
}

function useItem(index) {
  const slot = Game.inventory[index];
  if (!slot) return;
  const def  = ITEM_DEFS[slot.itemId];
  if (!def || !def.usable) return;

  if (slot.itemId === 'medkit') {
    if (Game.player.hp >= Game.player.maxHp) { showNotification('VIDA JÁ ESTÁ CHEIA.'); return; }
    Game.player.hp = Math.min(Game.player.maxHp, Game.player.hp + 40);
    updateHUD();
    showNotification('KIT MÉDICO USADO — +40 HP');
    Audio.playSFX('pickup');
    removeFromInventory(index);
  } else if (slot.itemId === 'ammo') {
    Game.gun.reserve = Math.min(96, Game.gun.reserve + 12);
    updateHUD();
    showNotification('MUNIÇÃO ADICIONADA — +12');
    Audio.playSFX('pickup');
    removeFromInventory(index);
  } else if (slot.itemId === 'battery') {
    Game.flashlight.battery = 100;
    updateHUD();
    showNotification('LANTERNA RECARREGADA!');
    Audio.playSFX('pickup');
    removeFromInventory(index);
  }
  renderInventoryUI();
}

/* ─────────────────────────────────────────────────────────────────
   11. HUD
───────────────────────────────────────────────────────────────── */
function updateHUD() {
  const p = Game.player;

  // Vida
  const hpPct = clamp(p.hp / p.maxHp * 100, 0, 100);
  $('health-bar').style.width = hpPct + '%';
  if (hpPct > 60)      $('health-bar').style.background = 'linear-gradient(90deg,#c0392b,#2ecc71)';
  else if (hpPct > 30) $('health-bar').style.background = 'linear-gradient(90deg,#c0392b,#f39c12)';
  else                 $('health-bar').style.background = 'var(--blood-lt)';
  $('health-text').textContent = Math.ceil(p.hp);

  // Stamina
  $('stamina-bar').style.width = clamp(p.stamina / p.maxStamina * 100, 0, 100) + '%';

  // Munição
  $('ammo-current').textContent = Game.gun.reloading ? 'REL' : Game.gun.ammo;
  $('ammo-reserve').textContent = Game.gun.reserve;

  // Lanterna
  $('flashlight-bar').style.width = clamp(Game.flashlight.battery, 0, 100) + '%';

  // Chaves
  $('slot-blue').classList.toggle('obtained', Game.keys.blue);
  $('slot-red').classList.toggle('obtained',  Game.keys.red);
  $('slot-gold').classList.toggle('obtained', Game.keys.gold);

  // Documentos
  $('doc-count').textContent = `${Game.docsFound}/${Game.totalDocs}`;
  $('slot-docs').classList.toggle('obtained', Game.docsFound > 0);
}

function showNotification(msg, duration = 2500) {
  const el = $('notification');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(Game._notifyTimeout);
  Game._notifyTimeout = setTimeout(() => el.classList.add('hidden'), duration);
}

function showRoomName(name) {
  const el = $('location-name');
  el.textContent = name;
  el.classList.add('visible');
  clearTimeout(Game._roomTimeout);
  Game._roomTimeout = setTimeout(() => el.classList.remove('visible'), 3000);
}

/* ─────────────────────────────────────────────────────────────────
   12. UI DE INVENTÁRIO
───────────────────────────────────────────────────────────────── */
function renderInventoryUI() {
  const grid = $('inventory-grid');
  grid.innerHTML = '';

  for (let i = 0; i < Game.maxSlots; i++) {
    const slot = Game.inventory[i];
    const el   = document.createElement('div');
    el.className = 'inv-slot' + (slot ? '' : ' empty');
    if (i === Game.inspectedSlot) el.classList.add('selected');

    if (slot) {
      const def = ITEM_DEFS[slot.itemId];
      el.innerHTML = `
        <span class="slot-icon">${def.icon}</span>
        <span class="slot-name">${def.name}</span>
        ${slot.qty > 1 ? `<span class="slot-qty">×${slot.qty}</span>` : ''}
      `;
      el.addEventListener('click', () => inspectSlot(i));
    } else {
      el.innerHTML = `<span class="slot-icon" style="opacity:0.2">—</span>`;
    }
    grid.appendChild(el);
  }

  // Actualiza painel de inspeção
  if (Game.inspectedSlot >= 0 && Game.inventory[Game.inspectedSlot]) {
    const slot = Game.inventory[Game.inspectedSlot];
    const def  = ITEM_DEFS[slot.itemId];
    $('inspect-icon').textContent = def.icon;
    $('inspect-name').textContent = def.name;

    // Texto especial para documentos
    let descText = def.desc;
    if (def.doc && DOCUMENTS[slot.itemId]) descText = 'Clique em USAR para ler o documento.';
    $('inspect-desc').textContent = descText;

    const useBtn = $('inspect-use-btn');
    if (def.usable || def.doc) {
      useBtn.classList.remove('hidden');
      useBtn.textContent = def.doc ? 'LER DOCUMENTO' : 'USAR';
      useBtn.onclick = () => {
        if (def.doc) openDocument(slot.itemId);
        else useItem(Game.inspectedSlot);
      };
    } else {
      useBtn.classList.add('hidden');
    }
  } else {
    $('inspect-icon').textContent = '?';
    $('inspect-name').textContent = 'Selecione um item';
    $('inspect-desc').textContent = 'Clique em um item para ver detalhes.';
    $('inspect-use-btn').classList.add('hidden');
  }
}

function inspectSlot(i) {
  Game.inspectedSlot = (Game.inspectedSlot === i) ? -1 : i;
  renderInventoryUI();
}

/* ─────────────────────────────────────────────────────────────────
   13. DOCUMENTOS
───────────────────────────────────────────────────────────────── */
function openDocument(docId) {
  const doc = DOCUMENTS[docId];
  if (!doc) return;
  $('doc-title').textContent = doc.title;
  $('doc-body').textContent  = doc.body;
  Game.activeDoc = docId;
  pauseGameLogic();
  Screens.hideOverlay('screen-inventory');
  Screens.showOverlay('screen-document');
}

function closeDocument() {
  Screens.hideOverlay('screen-document');
  resumeGameLogic();
}

/* ─────────────────────────────────────────────────────────────────
   14. PUZZLE
───────────────────────────────────────────────────────────────── */
function openPuzzle(puzzleId) {
  const data = PUZZLE_DATA[puzzleId];
  if (!data) return;
  Game.activePuzzle  = puzzleId;
  Game.puzzleInput   = '';
  $('puzzle-title').textContent  = data.title;
  $('puzzle-hint').textContent   = data.hint;
  $('puzzle-display').textContent = '_ _ _ _';
  $('puzzle-result').textContent = '';
  $('puzzle-result').className   = 'puzzle-result';
  pauseGameLogic();
  Screens.showOverlay('screen-puzzle');
}

function puzzleKey(val) {
  if (!Game.activePuzzle) return;
  const data = PUZZLE_DATA[Game.activePuzzle];
  if (val === 'C') {
    Game.puzzleInput = '';
  } else if (val === 'E') {
    checkPuzzle();
    return;
  } else {
    if (Game.puzzleInput.length >= 4) return;
    Game.puzzleInput += val;
  }
  // Atualiza display
  const chars = Game.puzzleInput.split('');
  while (chars.length < 4) chars.push('_');
  $('puzzle-display').textContent = chars.join(' ');
}

function checkPuzzle() {
  if (!Game.activePuzzle) return;
  const data   = PUZZLE_DATA[Game.activePuzzle];
  const result = $('puzzle-result');

  if (Game.puzzleInput === data.code) {
    result.textContent = '✓ ACESSO CONCEDIDO';
    result.className   = 'puzzle-result success';
    Audio.playSFX('puzzle_open');
    // Aplica recompensa
    if (data.reward === 'unlock_exit') {
      unlockExit();
    }
    // Abre porta associada
    const doorId = Game.activePuzzle === 'puzzle_lab' ? 'door_lab' : null;
    if (doorId) {
      const door = worldObjects.find(o => o.id === doorId);
      if (door) door.opened = true;
    }
    setTimeout(() => {
      Screens.hideOverlay('screen-puzzle');
      Game.activePuzzle = null;
      resumeGameLogic();
      showNotification('PORTA DESBLOQUEADA!');
    }, 1200);
  } else {
    result.textContent = '✗ CÓDIGO INVÁLIDO';
    result.className   = 'puzzle-result fail';
    Game.puzzleInput   = '';
    $('puzzle-display').textContent = '_ _ _ _';
  }
}

function unlockExit() {
  Game.exitUnlocked = true;
  const exitObj = worldObjects.find(o => o.id === 'exit_door');
  if (exitObj) exitObj.active = true;
  showNotification('SAÍDA DESBLOQUEADA! Vá para a garagem!');
}

/* ─────────────────────────────────────────────────────────────────
   15. INTERAÇÕES
───────────────────────────────────────────────────────────────── */
function findNearObject() {
  const px = Game.player.x + Game.player.w / 2;
  const py = Game.player.y + Game.player.h / 2;
  const range = 48;

  for (const obj of worldObjects) {
    if (obj.type === 'item') {
      if (obj.collected) continue;
      const ox = obj.x, oy = obj.y;
      if (Math.abs(px - ox) < range && Math.abs(py - oy) < range) return obj;
    } else if (obj.type === 'door') {
      if (obj.opened) continue;
      const cx = obj.x + (obj.w || TILE) / 2;
      const cy = obj.y + (obj.h || TILE) / 2;
      if (Math.abs(px - cx) < range + 16 && Math.abs(py - cy) < range + 16) return obj;
    } else if (obj.type === 'puzzle') {
      if (obj.solved) continue;
      if (Math.abs(px - obj.x) < range && Math.abs(py - obj.y) < range) return obj;
    } else if (obj.type === 'exit') {
      if (!obj.active) continue;
      if (Math.abs(px - obj.x) < range + 24 && Math.abs(py - obj.y) < range + 24) return obj;
    }
  }
  return null;
}

function interact() {
  const obj = Game.nearObject;
  if (!obj) return;

  if (obj.type === 'item') {
    // Coleta o item
    if (addToInventory(obj.itemId)) {
      obj.collected = true;
      Audio.playSFX('pickup');
      const def = ITEM_DEFS[obj.itemId];
      showNotification(`${def.icon} ${def.name.toUpperCase()} COLETADO`);

      // Chaves
      if (obj.itemId === 'key_blue')  { Game.keys.blue = true; updateHUD(); }
      if (obj.itemId === 'key_red')   { Game.keys.red  = true; updateHUD(); }
      if (obj.itemId === 'key_gold')  { Game.keys.gold = true; updateHUD(); }

      // Documentos
      if (ITEM_DEFS[obj.itemId].doc) {
        Game.docsFound++;
        updateHUD();
        // Abre automaticamente para leitura
        setTimeout(() => openDocument(obj.itemId), 400);
      }
    }
  } else if (obj.type === 'door') {
    if (obj.puzzleId) {
      // Abre puzzle
      openPuzzle(obj.puzzleId);
    } else if (obj.keyRequired) {
      // Verifica se tem a chave
      const keyName = obj.keyRequired; // e.g. 'key_blue'
      if (hasItem(keyName) || Game.keys[keyName.replace('key_','')] ) {
        obj.opened = true;
        Audio.playSFX('door');
        showNotification('PORTA ABERTA!');
        // Remove a chave do inventário ao usar? Não — mantemos para estilo RE clássico
      } else {
        showNotification(`REQUER ${ITEM_DEFS[keyName].name.toUpperCase()}!`);
        Audio.playSFX('no_ammo');
      }
    }
  } else if (obj.type === 'puzzle') {
    openPuzzle(obj.puzzleId);
  } else if (obj.type === 'exit') {
    triggerVictory();
  }
}

/* ─────────────────────────────────────────────────────────────────
   16. COLISÃO COM PAREDES
───────────────────────────────────────────────────────────────── */
function moveWithCollision(entity, dx, dy) {
  const hw = entity.w / 2;
  const hh = entity.h / 2;

  // Tenta mover X
  const nx = entity.x + dx;
  if (canPlace(nx, entity.y, entity.w, entity.h)) {
    entity.x = nx;
  }
  // Tenta mover Y
  const ny = entity.y + dy;
  if (canPlace(entity.x, ny, entity.w, entity.h)) {
    entity.y = ny;
  }
}

function canPlace(x, y, w, h) {
  const margin = 2;
  const x1 = x + margin;
  const y1 = y + margin;
  const x2 = x + w - margin;
  const y2 = y + h - margin;

  // Verifica os 4 cantos
  for (const [cx, cy] of [[x1,y1],[x2,y1],[x1,y2],[x2,y2]]) {
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    if (isSolid(tx, ty)) return false;
  }

  // Verifica colisão com portas fechadas
  for (const obj of worldObjects) {
    if (obj.type === 'door' && !obj.opened) {
      const dw = obj.w || TILE;
      const dh = obj.h || TILE;
      if (x1 < obj.x + dw && x2 > obj.x &&
          y1 < obj.y + dh && y2 > obj.y) {
        return false;
      }
    }
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────────
   17. COMBATE — TIRO
───────────────────────────────────────────────────────────────── */
function shoot() {
  if (Game.gun.reloading)       { showNotification('RECARREGANDO...'); return; }
  if (Game.gun.shootCooldown > 0) return;
  if (Game.gun.ammo <= 0) {
    Audio.playSFX('no_ammo');
    showNotification('SEM MUNIÇÃO! [R] para recarregar.');
    if (Game.gun.reserve > 0) startReload();
    return;
  }

  Game.gun.ammo--;
  Game.gun.shootCooldown = Game.gun.shootRate;
  Audio.playSFX('shoot');
  updateHUD();

  // Flash de tiro
  const flash = $('muzzle-flash');
  flash.classList.remove('hidden', 'active');
  void flash.offsetWidth; // reflow
  flash.classList.add('active');
  setTimeout(() => { flash.classList.remove('active'); flash.classList.add('hidden'); }, 80);

  // Direção do tiro: do jogador em direção ao mouse
  const px = Game.player.x + Game.player.w / 2 - Game.cam.x;
  const py = Game.player.y + Game.player.h / 2 - Game.cam.y;
  const canvas = $('gameCanvas');
  const mx = Game.mouse.x;
  const my = Game.mouse.y;

  const len = Math.hypot(mx - px, my - py);
  if (len === 0) return;
  const dx = (mx - px) / len;
  const dy = (my - py) / len;

  // Posição de partidas do tiro (boca da arma)
  const muzzleX = Game.player.x + Game.player.w / 2 + dx * 20;
  const muzzleY = Game.player.y + Game.player.h / 2 + dy * 20;
  spawnMuzzleParticles(muzzleX, muzzleY);

  // Raio de colisão do tiro
  const RANGE    = 500;
  const STEP     = 6;
  let rx = muzzleX, ry = muzzleY;
  let hit = false;

  for (let s = 0; s < RANGE / STEP && !hit; s++) {
    rx += dx * STEP;
    ry += dy * STEP;

    // Colisão com parede
    if (isSolid(Math.floor(rx / TILE), Math.floor(ry / TILE))) break;

    // Colisão com zumbi
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (rx > enemy.x && rx < enemy.x + enemy.w &&
          ry > enemy.y && ry < enemy.y + enemy.h) {
        hitEnemy(enemy, rx, ry);
        hit = true;
        break;
      }
    }
  }
}

function hitEnemy(enemy, x, y) {
  enemy.hp--;
  enemy.flashTimer = 0.15;
  spawnBloodParticles(x, y);

  if (enemy.hp <= 0) {
    killEnemy(enemy);
  } else {
    // Zumbi detecta o jogador ao ser atingido
    enemy.state = 'chase';
  }
}

function killEnemy(enemy) {
  enemy.dead = true;
  enemy.state = 'dead';
  enemy.deathTimer = 2.0; // permanece no chão por 2s
  Audio.playSFX('zombie_die');
  spawnBloodParticles(enemy.x + enemy.w/2, enemy.y + enemy.h/2);
}

function startReload() {
  if (Game.gun.reloading) return;
  if (Game.gun.reserve <= 0) { showNotification('SEM MUNIÇÃO RESERVA!'); return; }
  if (Game.gun.ammo >= 12) return;
  Game.gun.reloading = true;
  Game.gun.reloadTimer = Game.gun.reloadTime;
  showNotification('RECARREGANDO...');
  Audio.playSFX('reload');
  updateHUD();
}

/* ─────────────────────────────────────────────────────────────────
   18. IA DOS ZUMBIS
───────────────────────────────────────────────────────────────── */
function updateEnemies(dt) {
  const px = Game.player.x + Game.player.w / 2;
  const py = Game.player.y + Game.player.h / 2;

  for (const enemy of enemies) {
    if (enemy.dead) {
      enemy.deathTimer -= dt;
      continue;
    }

    enemy.flashTimer  = Math.max(0, enemy.flashTimer - dt);
    enemy.atkTimer    = Math.max(0, enemy.atkTimer - dt);
    enemy.groanTimer -= dt;
    if (enemy.groanTimer <= 0) {
      // Gemido periódico se perto o suficiente
      const d = dist(enemy, { x: px, y: py });
      if (d < 250) Audio.playSFX('zombie_groan');
      enemy.groanTimer = rand(4, 12);
    }

    const ex = enemy.x + enemy.w / 2;
    const ey = enemy.y + enemy.h / 2;
    const d  = dist({ x: ex, y: ey }, { x: px, y: py });

    // Máquina de estados
    switch (enemy.state) {
      case 'patrol':
        updatePatrol(enemy, dt);
        // Detecta jogador
        if (d < ZOMBIE_VISION && hasLineOfSight(ex, ey, px, py)) {
          enemy.state = 'chase';
        }
        break;

      case 'chase':
        // Perseguição
        if (d <= ZOMBIE_ATK_RANGE) {
          enemy.state = 'attack';
        } else if (d > ZOMBIE_VISION * 2.5) {
          // Perde o jogador
          enemy.state = 'patrol';
        } else {
          const spd = ZOMBIE_SPEED_CHASE * dt;
          const dx  = (px - ex) / d;
          const dy  = (py - ey) / d;
          enemy.dir.x = dx; enemy.dir.y = dy;
          moveWithCollision(enemy, dx * spd, dy * spd);
        }
        break;

      case 'attack':
        if (d > ZOMBIE_ATK_RANGE * 1.5) {
          enemy.state = 'chase';
        } else if (enemy.atkTimer <= 0) {
          // Ataca
          damagePlayer(ZOMBIE_DAMAGE);
          enemy.atkTimer = ZOMBIE_ATK_COOLDOWN;
        }
        break;
    }
  }

  // Remove inimigos mortos após timer
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead && enemies[i].deathTimer <= 0) {
      enemies.splice(i, 1);
    }
  }
}

function updatePatrol(enemy, dt) {
  if (!enemy.patrol || enemy.patrol.length === 0) return;
  const target = enemy.patrol[enemy.patrolIdx];
  const ex = enemy.x + enemy.w / 2;
  const ey = enemy.y + enemy.h / 2;
  const d  = dist({ x: ex, y: ey }, { x: target[0] + TILE/2, y: target[1] + TILE/2 });

  if (d < 10) {
    enemy.patrolIdx = (enemy.patrolIdx + enemy.patrolDir + enemy.patrol.length) % enemy.patrol.length;
    if (enemy.patrolIdx === 0 || enemy.patrolIdx === enemy.patrol.length - 1) enemy.patrolDir *= -1;
  } else {
    const spd = ZOMBIE_SPEED_PATROL * dt;
    const dx  = (target[0] + TILE/2 - ex) / d;
    const dy  = (target[1] + TILE/2 - ey) / d;
    enemy.dir.x = dx; enemy.dir.y = dy;
    moveWithCollision(enemy, dx * spd, dy * spd);
  }
}

function hasLineOfSight(x1, y1, x2, y2) {
  const steps = 12;
  for (let i = 1; i < steps; i++) {
    const t  = i / steps;
    const lx = lerp(x1, x2, t);
    const ly = lerp(y1, y2, t);
    if (isSolid(Math.floor(lx / TILE), Math.floor(ly / TILE))) return false;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────────
   19. DANO AO JOGADOR
───────────────────────────────────────────────────────────────── */
function damagePlayer(amount) {
  if (Game.over) return;
  Game.player.hp -= amount;
  Audio.playSFX('hurt');
  updateHUD();

  // Efeito visual
  const vign = $('damage-vignette');
  vign.classList.remove('hidden', 'active');
  void vign.offsetWidth;
  vign.classList.add('active');
  setTimeout(() => vign.classList.remove('active'), 400);

  // Tremor de câmera
  const canvas = $('gameCanvas');
  canvas.classList.remove('shake');
  void canvas.offsetWidth;
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 350);

  if (Game.player.hp <= 0) {
    Game.player.hp = 0;
    updateHUD();
    triggerGameOver();
  }
}

/* ─────────────────────────────────────────────────────────────────
   20. FIM DE JOGO E VITÓRIA
───────────────────────────────────────────────────────────────── */
function triggerGameOver() {
  Game.over    = true;
  Game.running = false;
  Audio.stopAmbient();
  setTimeout(() => Screens.show('screen-gameover'), 800);
}

function triggerVictory() {
  Game.victory = true;
  Game.running = false;
  Audio.stopAmbient();

  const isSecret = Game.docsFound >= Game.totalDocs;
  const title    = isSecret ? 'FINAL SECRETO DESBLOQUEADO!' : 'VOCÊ ESCAPOU!';
  const subtitle = isSecret
    ? 'Você descobriu toda a verdade sobre a Mansão dos Mortos.'
    : 'Você sobreviveu... mas a verdade ainda está lá dentro.';

  $('victory-title').textContent    = title;
  $('victory-subtitle').textContent = subtitle;
  $('victory-stats').innerHTML = `
    Documentos encontrados: ${Game.docsFound}/${Game.totalDocs}<br>
    Vida restante: ${Math.ceil(Game.player.hp)} HP<br>
    ${isSecret ? '★ TODOS OS DOCUMENTOS COLETADOS ★' : ''}
  `;

  setTimeout(() => Screens.show('screen-victory'), 600);
}

/* ─────────────────────────────────────────────────────────────────
   21. LOOP DE PAUSA
───────────────────────────────────────────────────────────────── */
function pauseGameLogic()  { Game.paused = true; }
function resumeGameLogic() { Game.paused = false; }

/* ─────────────────────────────────────────────────────────────────
   22. CÂMERA
───────────────────────────────────────────────────────────────── */
function updateCamera(canvas) {
  const tx = Game.player.x + Game.player.w / 2 - canvas.width  / 2;
  const ty = Game.player.y + Game.player.h / 2 - canvas.height / 2;
  // Clamp camera dentro do mapa
  const maxX = MAP_W * TILE - canvas.width;
  const maxY = MAP_H * TILE - canvas.height;
  Game.cam.x = lerp(Game.cam.x, clamp(tx, 0, maxX), 0.12);
  Game.cam.y = lerp(Game.cam.y, clamp(ty, 0, maxY), 0.12);
}

/* ─────────────────────────────────────────────────────────────────
   23. RENDERIZAÇÃO PRINCIPAL
───────────────────────────────────────────────────────────────── */
function render(canvas, ctx) {
  const W = canvas.width;
  const H = canvas.height;
  const cx = Math.floor(Game.cam.x);
  const cy = Math.floor(Game.cam.y);

  // ── Fundo
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, W, H);

  // ── Tiles visíveis
  const startTX = Math.max(0,       Math.floor(cx / TILE) - 1);
  const startTY = Math.max(0,       Math.floor(cy / TILE) - 1);
  const endTX   = Math.min(MAP_W-1, Math.floor((cx + W) / TILE) + 1);
  const endTY   = Math.min(MAP_H-1, Math.floor((cy + H) / TILE) + 1);

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      const tile = tileAt(tx, ty);
      if (tile === 0) continue;

      const sx = tx * TILE - cx;
      const sy = ty * TILE - cy;

      // Cor base do chão
      ctx.fillStyle = floorColor(tile);
      ctx.fillRect(sx, sy, TILE, TILE);

      // Detalhe de textura (grade sutil)
      if (tile !== 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
      }

      // Tile especial: laboratório tem brilho azulado
      if (tile === 3) {
        ctx.fillStyle = 'rgba(0,40,80,0.08)';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
      // Enfermaria: leve verde
      if (tile === 5) {
        ctx.fillStyle = 'rgba(0,60,30,0.08)';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }

  // ── Paredes (tiles 0 com vizinhos de chão = borda de parede)
  drawWalls(ctx, cx, cy, startTX, startTY, endTX, endTY);

  // ── Objetos do mundo
  drawWorldObjects(ctx, cx, cy);

  // ── Partículas
  drawParticles(ctx, cx, cy);

  // ── Inimigos
  drawEnemies(ctx, cx, cy);

  // ── Jogador
  drawPlayer(ctx, cx, cy);

  // ── Lanterna (efeito de luz radial)
  drawFlashlight(ctx, W, H);
}

function drawWalls(ctx, cx, cy, sx, sy, ex, ey) {
  // Desenha tiles de parede como blocos escuros com detalhes
  for (let ty = sy; ty <= ey; ty++) {
    for (let tx = sx; tx <= ex; tx++) {
      if (tileAt(tx, ty) !== 0) continue;
      // Só renderiza se adjacente a chão (borda visível)
      const hasFloor =
        tileAt(tx-1, ty) || tileAt(tx+1, ty) ||
        tileAt(tx, ty-1) || tileAt(tx, ty+1) ||
        tileAt(tx-1,ty-1) || tileAt(tx+1,ty-1) ||
        tileAt(tx-1,ty+1) || tileAt(tx+1,ty+1);
      if (!hasFloor) continue;

      const wx = tx * TILE - cx;
      const wy = ty * TILE - cy;

      // Parede base
      ctx.fillStyle = '#0e0c10';
      ctx.fillRect(wx, wy, TILE, TILE);
      // Brilho da borda superior
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(wx, wy, TILE, 2);
      // Detalhe de tijolo
      if ((tx + ty) % 3 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(wx + 4, wy + 8, TILE - 8, 4);
        ctx.fillRect(wx + 2, wy + 20, TILE - 6, 4);
      }
    }
  }
}

function drawWorldObjects(ctx, cx, cy) {
  const px = Game.player.x + Game.player.w / 2;
  const py = Game.player.y + Game.player.h / 2;

  for (const obj of worldObjects) {
    if (obj.type === 'item') {
      if (obj.collected) continue;
      const sx = obj.x - cx - 10;
      const sy = obj.y - cy - 10;
      // Pulso animado
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.004);

      // Círculo de destaque
      ctx.save();
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(obj.x - cx, obj.y - cy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Ícone do item
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ITEM_DEFS[obj.itemId]?.icon || '?', obj.x - cx, obj.y - cy);

    } else if (obj.type === 'door') {
      const dw = obj.w || TILE;
      const dh = obj.h || TILE;
      const dx = obj.x - cx;
      const dy = obj.y - cy;
      if (obj.opened) {
        // Porta aberta — piso especial
        ctx.fillStyle = 'rgba(60,80,60,0.3)';
        ctx.fillRect(dx, dy, dw, dh);
        ctx.strokeStyle = 'rgba(80,200,80,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx+1, dy+1, dw-2, dh-2);
      } else {
        // Porta fechada
        const isKeyDoor = !!obj.keyRequired;
        const baseColor = isKeyDoor ? (
          obj.keyRequired === 'key_blue'  ? '#1a3050' :
          obj.keyRequired === 'key_red'   ? '#501a1a' :
          obj.keyRequired === 'key_gold'  ? '#403010' : '#1a1a2a'
        ) : '#201a28';
        ctx.fillStyle = baseColor;
        ctx.fillRect(dx, dy, dw, dh);
        ctx.strokeStyle = isKeyDoor ? (
          obj.keyRequired === 'key_blue'  ? '#3498db' :
          obj.keyRequired === 'key_red'   ? '#e74c3c' :
          obj.keyRequired === 'key_gold'  ? '#f1c40f' : '#666'
        ) : '#555';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
        // Ícone de cadeado
        ctx.font = `${Math.min(dw, dh) * 0.55}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒', dx + dw / 2, dy + dh / 2);
      }

    } else if (obj.type === 'puzzle') {
      if (obj.solved) continue;
      const sx = obj.x - cx;
      const sy = obj.y - cy;
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.003);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#0a1520';
      ctx.fillRect(sx - 12, sy - 12, 26, 26);
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx - 12, sy - 12, 26, 26);
      ctx.font = '14px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💻', sx, sy);
      ctx.restore();

    } else if (obj.type === 'exit') {
      if (!obj.active) continue;
      const sx = obj.x - cx;
      const sy = obj.y - cy;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
      ctx.save();
      // Glow verde de saída
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40);
      grad.addColorStop(0, `rgba(46,204,113,${0.35 * pulse})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = pulse;
      ctx.font = '24px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚪', sx, sy);
      ctx.font = 'bold 9px "Courier New"';
      ctx.fillStyle = '#2ecc71';
      ctx.fillText('SAÍDA', sx, sy + 20);
      ctx.restore();
    }
  }
}

function drawEnemies(ctx, cx, cy) {
  for (const enemy of enemies) {
    const ex = enemy.x - cx;
    const ey = enemy.y - cy;

    if (enemy.dead) {
      // Zumbi morto (mancha de sangue)
      ctx.save();
      ctx.globalAlpha = Math.max(0, enemy.deathTimer / 2.0);
      ctx.fillStyle = '#3a0000';
      ctx.beginPath();
      ctx.ellipse(ex + enemy.w/2, ey + enemy.h - 6, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      continue;
    }

    // Sombra
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(ex + enemy.w/2, ey + enemy.h + 2, enemy.w/2 + 2, 5, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // Corpo do zumbi
    const isFlash = enemy.flashTimer > 0;
    const bodyColor = isFlash ? '#ff3333' : (enemy.state === 'chase' || enemy.state === 'attack' ? '#4a1010' : '#2a2218');

    // Torso
    ctx.fillStyle = bodyColor;
    ctx.fillRect(ex + 3, ey + 8, enemy.w - 6, enemy.h - 10);
    // Cabeça
    ctx.fillStyle = isFlash ? '#ff5555' : '#2e1e14';
    ctx.fillRect(ex + 5, ey, enemy.w - 10, 12);
    // Olhos vermelhos pulsantes
    ctx.fillStyle = `rgb(${200 + Math.floor(55*Math.sin(Date.now()*0.008))},0,0)`;
    ctx.fillRect(ex + 7, ey + 3, 3, 3);
    ctx.fillRect(ex + 10, ey + 3, 3, 3);

    // Barra de HP pequena
    const hpPct = enemy.hp / enemy.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(ex, ey - 6, enemy.w, 3);
    ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#c0392b';
    ctx.fillRect(ex, ey - 6, enemy.w * hpPct, 3);

    // Indicador de estado
    if (enemy.state === 'chase' || enemy.state === 'attack') {
      ctx.fillStyle = 'rgba(255,0,0,0.8)';
      ctx.font = '9px "Courier New"';
      ctx.textAlign = 'center';
      ctx.fillText('!', ex + enemy.w/2, ey - 9);
    }
  }
}

function drawPlayer(ctx, cx, cy) {
  const p  = Game.player;
  const sx = p.x - cx;
  const sy = p.y - cy;

  // Sombra
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(sx + p.w/2, sy + p.h + 2, p.w/2 + 1, 5, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // Corpo
  ctx.fillStyle = '#2c3a4a';
  ctx.fillRect(sx + 3, sy + 9, p.w - 6, p.h - 10);

  // Cabeça
  ctx.fillStyle = '#c8a882';
  ctx.fillRect(sx + 5, sy + 1, p.w - 10, 11);

  // Cabelo
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(sx + 5, sy + 1, p.w - 10, 4);

  // Olhos
  ctx.fillStyle = '#e8e8f0';
  ctx.fillRect(sx + 7, sy + 5, 3, 3);
  ctx.fillRect(sx + 11, sy + 5, 3, 3);

  // Arma (aponta para o mouse)
  const px = sx + p.w / 2;
  const py = sy + p.h / 2;
  const mx = Game.mouse.x;
  const my = Game.mouse.y;
  const len = Math.hypot(mx - (px + cx - cx), my - (py + cy - cy));
  if (len > 0.1) {
    const dx = (mx - px) / len;
    const dy = (my - py) / len;
    ctx.save();
    ctx.strokeStyle = '#7a7a8a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + dx * 4,  py + dy * 4);
    ctx.lineTo(px + dx * 18, py + dy * 18);
    ctx.stroke();
    ctx.restore();
  }
}

// Canvas offscreen reutilizável para a máscara de luz
let _lightCanvas = null;
let _lightCtx    = null;

function drawFlashlight(ctx, W, H) {
  // ── Cria / redimensiona o canvas offscreen conforme necessário
  if (!_lightCanvas) {
    _lightCanvas = document.createElement('canvas');
  }
  if (_lightCanvas.width !== W || _lightCanvas.height !== H) {
    _lightCanvas.width  = W;
    _lightCanvas.height = H;
    _lightCtx = _lightCanvas.getContext('2d');
  }
  const lc = _lightCtx;

  // Centro do jogador na tela
  const px = Game.player.x + Game.player.w / 2 - Game.cam.x;
  const py = Game.player.y + Game.player.h / 2 - Game.cam.y;

  // Ângulo da lanterna → direção do mouse
  const mx  = Game.mouse.x;
  const my  = Game.mouse.y;
  const dxm = mx - px;
  const dym = my - py;
  const baseAngle = Math.atan2(dym, dxm);

  // Intensidade (pisca quando bateria fraca)
  let intensity = clamp(Game.flashlight.battery / 100, 0, 1);
  if (Game.flashlight.battery < 15 && Game.flashlight.battery > 0) {
    intensity *= 0.55 + 0.45 * Math.abs(Math.sin(Date.now() * 0.012));
  }
  if (Game.flashlight.battery <= 0) intensity = 0;

  // ════════════════════════════════════════════════
  // PASSO 1 — Preenche o canvas offscreen com
  //           escuridão total (opaca)
  // ════════════════════════════════════════════════
  lc.clearRect(0, 0, W, H);
  lc.fillStyle = 'rgb(0,0,0)';
  lc.fillRect(0, 0, W, H);

  // ════════════════════════════════════════════════
  // PASSO 2 — Apaga pixels da escuridão onde há luz
  //           (destination-out no canvas OFFSCREEN)
  // ════════════════════════════════════════════════
  lc.globalCompositeOperation = 'destination-out';

  // — Halo ambiente imediato (sempre tem um pouquinho de luz perto do corpo)
  const haloR    = 90;
  const haloGrad = lc.createRadialGradient(px, py, 0, px, py, haloR);
  haloGrad.addColorStop(0,   'rgba(0,0,0,0.85)');
  haloGrad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  haloGrad.addColorStop(1,   'rgba(0,0,0,0)');
  lc.fillStyle = haloGrad;
  lc.beginPath();
  lc.arc(px, py, haloR, 0, Math.PI * 2);
  lc.fill();

  if (intensity > 0) {
    // — Cone principal da lanterna
    const coneLen   = 380 * intensity;
    const coneAngle = 0.85; // ~49° de abertura para cada lado
    const coneGrad  = lc.createRadialGradient(px, py, 0, px, py, coneLen);
    coneGrad.addColorStop(0,    'rgba(0,0,0,1)');
    coneGrad.addColorStop(0.15, 'rgba(0,0,0,1)');
    coneGrad.addColorStop(0.55, 'rgba(0,0,0,0.9)');
    coneGrad.addColorStop(0.80, 'rgba(0,0,0,0.6)');
    coneGrad.addColorStop(1,    'rgba(0,0,0,0)');
    lc.fillStyle = coneGrad;
    lc.beginPath();
    lc.moveTo(px, py);
    lc.arc(px, py, coneLen, baseAngle - coneAngle, baseAngle + coneAngle);
    lc.closePath();
    lc.fill();

    // — Hotspot central (núcleo mais brilhante)
    const hotLen   = 150 * intensity;
    const hotAngle = 0.38;
    const hotGrad  = lc.createRadialGradient(px, py, 0, px, py, hotLen);
    hotGrad.addColorStop(0,   'rgba(0,0,0,1)');
    hotGrad.addColorStop(0.6, 'rgba(0,0,0,0.95)');
    hotGrad.addColorStop(1,   'rgba(0,0,0,0)');
    lc.fillStyle = hotGrad;
    lc.beginPath();
    lc.moveTo(px, py);
    lc.arc(px, py, hotLen, baseAngle - hotAngle, baseAngle + hotAngle);
    lc.closePath();
    lc.fill();
  }

  // ════════════════════════════════════════════════
  // PASSO 3 — Desenha a máscara de escuridão
  //           sobre o canvas principal com opacidade
  //           controlada (deixa o cenário visível)
  // ════════════════════════════════════════════════
  lc.globalCompositeOperation = 'source-over'; // reseta
  ctx.save();
  ctx.globalAlpha = 0.91; // ~91% de escuridão nas áreas não iluminadas
  ctx.drawImage(_lightCanvas, 0, 0);
  ctx.restore();

  // ════════════════════════════════════════════════
  // PASSO 4 — Tint quente amarelado sobre o cone
  //           (dá aparência de lanterna real)
  // ════════════════════════════════════════════════
  if (intensity > 0) {
    const coneLen   = 380 * intensity;
    const coneAngle = 0.85;
    ctx.save();
    const warmGrad = ctx.createRadialGradient(px, py, 0, px, py, coneLen * 0.75);
    warmGrad.addColorStop(0,   `rgba(255,240,180,${0.13 * intensity})`);
    warmGrad.addColorStop(0.4, `rgba(255,220,120,${0.08 * intensity})`);
    warmGrad.addColorStop(1,   'rgba(255,200,80,0)');
    ctx.fillStyle = warmGrad;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, coneLen * 0.75, baseAngle - coneAngle, baseAngle + coneAngle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ════════════════════════════════════════════════
  // PASSO 5 — Avisos de bateria
  // ════════════════════════════════════════════════
  ctx.save();
  ctx.textAlign = 'center';
  if (Game.flashlight.battery < 15 && Game.flashlight.battery > 0) {
    ctx.font      = 'bold 11px "Courier New"';
    ctx.fillStyle = `rgba(255,140,0,${0.6 + 0.4 * Math.abs(Math.sin(Date.now() * 0.008))})`;
    ctx.fillText('⚠ BATERIA FRACA', px, py - 45);
  }
  if (Game.flashlight.battery <= 0) {
    ctx.font      = 'bold 11px "Courier New"';
    ctx.fillStyle = 'rgba(255,80,80,0.85)';
    ctx.fillText('⚠ LANTERNA APAGADA  [F] = usar baterias', px, py - 45);
  }
  ctx.restore();

  // Névoa atmosférica levíssima
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.fillStyle   = '#8888aa';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawParticles(ctx, cx, cy) {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - cx, p.y - cy, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ─────────────────────────────────────────────────────────────────
   24. LOOP PRINCIPAL
───────────────────────────────────────────────────────────────── */
let lastTime = 0;
let rafId    = null;

function gameLoop(timestamp) {
  if (!Game.running) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // max 50ms
  lastTime = timestamp;

  if (!Game.paused) {
    update(dt);
  }

  const canvas = $('gameCanvas');
  const ctx    = canvas.getContext('2d');
  updateCamera(canvas);
  render(canvas, ctx);

  rafId = requestAnimationFrame(gameLoop);
}

function update(dt) {
  updatePlayer(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateParticles(dt);
  updateGun(dt);
  updateFlashlight(dt);
  updateNearObject();
  updateRoomDetection();
}

function updatePlayer(dt) {
  const p  = Game.player;
  const kh = Game.keys_held;

  // Corrida
  p.isRunning = (kh['ShiftLeft'] || kh['ShiftRight']) && p.stamina > 0 &&
                (kh['KeyW'] || kh['KeyS'] || kh['KeyA'] || kh['KeyD']);

  const speed = p.isRunning ? p.runSpeed : p.speed;

  // Stamina
  if (p.isRunning) {
    p.stamina = Math.max(0, p.stamina - p.staminaDrain * dt);
    if (p.stamina === 0) p.isRunning = false;
  } else {
    p.stamina = Math.min(p.maxStamina, p.stamina + p.staminaRegen * dt);
  }

  let mdx = 0, mdy = 0;
  if (kh['KeyW'] || kh['ArrowUp'])    mdy -= 1;
  if (kh['KeyS'] || kh['ArrowDown'])  mdy += 1;
  if (kh['KeyA'] || kh['ArrowLeft'])  mdx -= 1;
  if (kh['KeyD'] || kh['ArrowRight']) mdx += 1;

  // Normaliza diagonal
  if (mdx !== 0 && mdy !== 0) { mdx *= 0.707; mdy *= 0.707; }

  const dx = mdx * speed * dt;
  const dy = mdy * speed * dt;

  if (dx !== 0 || dy !== 0) {
    moveWithCollision(p, dx, dy);

    // Som de passos
    Game.stepTimer -= dt;
    if (Game.stepTimer <= 0) {
      Audio.playSFX('step');
      Game.stepTimer = p.isRunning ? Game.stepInterval * 0.65 : Game.stepInterval;
    }
  }

  updateHUD();
}

function updateGun(dt) {
  if (Game.gun.shootCooldown > 0) Game.gun.shootCooldown -= dt;

  if (Game.gun.reloading) {
    Game.gun.reloadTimer -= dt;
    if (Game.gun.reloadTimer <= 0) {
      const needed  = 12 - Game.gun.ammo;
      const loaded  = Math.min(needed, Game.gun.reserve);
      Game.gun.ammo    += loaded;
      Game.gun.reserve -= loaded;
      Game.gun.reloading = false;
      showNotification(`RECARREGADO — ${Game.gun.ammo} balas`);
      updateHUD();
    }
  }
}

function updateFlashlight(dt) {
  Game.flashlight.battery = Math.max(0, Game.flashlight.battery - Game.flashlight.drain * dt);
  if (Game.flashlight.battery <= 0) {
    // Lanterna morta — pisca para avisar
    if (Math.floor(Date.now() / 300) % 2 === 0) {
      // Mostra aviso periódico
    }
  }
}

// Bullets array separado para raios visuais
let bullets = [];

function updateBullets(dt) {
  // Simples: os raios de tiro já foram calculados instantaneamente
  // mantemos apenas para efeitos visuais de traço
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].life -= dt;
    if (bullets[i].life <= 0) bullets.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vx   *= 0.88;
    p.vy   *= 0.88;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateNearObject() {
  Game.nearObject = findNearObject();
  const prompt    = $('interact-prompt');
  const text      = $('interact-text');

  if (Game.nearObject) {
    prompt.classList.remove('hidden');
    const obj = Game.nearObject;
    if (obj.type === 'item')   text.textContent = `Pegar: ${ITEM_DEFS[obj.itemId]?.name || ''}`;
    else if (obj.type === 'door')   text.textContent = obj.label || 'Abrir porta';
    else if (obj.type === 'puzzle') text.textContent = `Usar: ${obj.label}`;
    else if (obj.type === 'exit')   text.textContent = 'ESCAPAR DA MANSÃO!';
  } else {
    prompt.classList.add('hidden');
  }
}

function updateRoomDetection() {
  const room = getRoomAt(Game.player.x, Game.player.y);
  if (room && room !== Game.currentRoom) {
    Game.currentRoom = room;
    showRoomName(room.name);
    $('objective-hint').textContent = getObjective();
  }
}

function getObjective() {
  if (!Game.keys.blue)  return 'Encontre a Chave Azul';
  if (!Game.keys.red)   return 'Encontre a Chave Vermelha';
  if (!Game.keys.gold)  return 'Encontre a Chave Dourada';
  if (!Game.exitUnlocked) return 'Ative o terminal de controle';
  return 'Vá para a saída — garagem!';
}

/* ─────────────────────────────────────────────────────────────────
   25. INICIALIZAÇÃO DO JOGO
───────────────────────────────────────────────────────────────── */
function startNewGame() {
  // Reinicia estado
  Game.running  = false;
  Game.paused   = false;
  Game.over     = false;
  Game.victory  = false;

  Game.player.x  = 38 * TILE;
  Game.player.y  = 28 * TILE;
  Game.player.hp = Game.player.maxHp;
  Game.player.stamina = Game.player.maxStamina;

  Game.cam.x = 0; Game.cam.y = 0;
  Game.flashlight.battery = 100;
  Game.gun.ammo     = 12;
  Game.gun.reserve  = 48;
  Game.gun.reloading = false;
  Game.gun.shootCooldown = 0;

  Game.inventory    = [];
  Game.keys         = { blue:false, red:false, gold:false };
  Game.docsFound    = 0;
  Game.exitUnlocked = false;
  Game.currentRoom  = null;
  Game.inspectedSlot = -1;
  Game.nearObject   = null;

  particles = [];
  bullets   = [];

  // Constrói mapa e objetos
  buildMap();
  initWorldObjects();
  spawnEnemies();

  // Configura canvas
  const canvas = $('gameCanvas');
  resizeCanvas(canvas);

  // Inicia
  Audio.init();
  Audio.playAmbient();
  Screens.show('screen-game');
  updateHUD();
  $('objective-hint').textContent = getObjective();
  showNotification('USE WASD + MOUSE. [E] INTERAGIR. [TAB] INVENTÁRIO.', 4000);

  Game.running = true;
  lastTime = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(gameLoop);
}

function resizeCanvas(canvas) {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

/* ─────────────────────────────────────────────────────────────────
   26. EVENTOS DE INPUT
───────────────────────────────────────────────────────────────── */
function setupInput() {
  // Teclado — keydown
  document.addEventListener('keydown', (e) => {
    // Não processa se overlay aberto (exceto ESC e TAB)
    const isInventory = Screens.isOverlayOpen('screen-inventory');
    const isPuzzle    = Screens.isOverlayOpen('screen-puzzle');
    const isDoc       = Screens.isOverlayOpen('screen-document');
    const isPause     = Screens.isOverlayOpen('screen-pause');

    if (e.code === 'Escape') {
      e.preventDefault();
      if (isInventory) { Screens.hideOverlay('screen-inventory'); resumeGameLogic(); return; }
      if (isPuzzle)    { Screens.hideOverlay('screen-puzzle');    Game.activePuzzle=null; resumeGameLogic(); return; }
      if (isDoc)       { closeDocument(); return; }
      if (isPause)     { Screens.hideOverlay('screen-pause');     resumeGameLogic(); return; }
      if (Game.running && !isPause) {
        pauseGameLogic();
        Screens.showOverlay('screen-pause');
        return;
      }
    }

    if (e.code === 'Tab') {
      e.preventDefault();
      if (!Game.running || Game.over || Game.victory) return;
      if (isInventory) {
        Screens.hideOverlay('screen-inventory');
        resumeGameLogic();
      } else if (!isPuzzle && !isDoc && !isPause) {
        renderInventoryUI();
        pauseGameLogic();
        Screens.showOverlay('screen-inventory');
      }
      return;
    }

    // Bloqueia movimento se overlay aberto
    if (isInventory || isPuzzle || isDoc || isPause) return;

    Game.keys_held[e.code] = true;

    if (e.code === 'KeyE') { e.preventDefault(); interact(); }
    if (e.code === 'KeyR') { e.preventDefault(); startReload(); }
    if (e.code === 'KeyF') {
      e.preventDefault();
      // Usa kit médico rapidamente
      const idx = Game.inventory.findIndex(s => s.itemId === 'medkit');
      if (idx >= 0) { Game.inspectedSlot = idx; useItem(idx); }
      else showNotification('SEM KIT MÉDICO!');
    }
  });

  // Teclado — keyup
  document.addEventListener('keyup', (e) => {
    delete Game.keys_held[e.code];
  });

  // Mouse — movimento
  document.addEventListener('mousemove', (e) => {
    Game.mouse.x = e.clientX;
    Game.mouse.y = e.clientY;
  });

  // Mouse — clique (tiro) — BLOQUEADO em dispositivos touch
  // browsers mobile convertem touchstart em mousedown e isso atirava sozinho
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (window._isMobile) return;
    if (Screens.isOverlayOpen('screen-inventory') ||
        Screens.isOverlayOpen('screen-puzzle')    ||
        Screens.isOverlayOpen('screen-document')  ||
        Screens.isOverlayOpen('screen-pause'))     return;
    if (!Game.running || Game.paused || Game.over || Game.victory) return;
    shoot();
  });

  // Resize
  window.addEventListener('resize', () => {
    const canvas = $('gameCanvas');
    if (canvas) resizeCanvas(canvas);
  });
}

/* ─────────────────────────────────────────────────────────────────
   27. BOTÕES DA UI
───────────────────────────────────────────────────────────────── */
function setupUIButtons() {
  // ── Tela inicial
  $('btn-new-game').addEventListener('click', () => {
    Audio.init();
    startNewGame();
  });
  $('btn-how-to-play').addEventListener('click', () => Screens.show('screen-howto'));
  $('btn-credits').addEventListener('click',    () => Screens.show('screen-credits'));
  $('btn-howto-back').addEventListener('click', () => Screens.show('screen-title'));
  $('btn-credits-back').addEventListener('click',() => Screens.show('screen-title'));

  // ── Pausa
  $('btn-resume').addEventListener('click', () => {
    Screens.hideOverlay('screen-pause');
    resumeGameLogic();
  });
  $('btn-quit-game').addEventListener('click', () => {
    Game.running = false;
    if (rafId) cancelAnimationFrame(rafId);
    Audio.stopAmbient();
    Screens.hideOverlay('screen-pause');
    Screens.show('screen-title');
  });

  // ── Game Over
  $('btn-retry').addEventListener('click', () => {
    Screens.show('screen-game');
    startNewGame();
  });
  $('btn-gameover-menu').addEventListener('click', () => {
    Audio.stopAmbient();
    Screens.show('screen-title');
  });

  // ── Vitória
  $('btn-victory-menu').addEventListener('click', () => {
    Audio.stopAmbient();
    Screens.show('screen-title');
  });

  // ── Puzzle keypad
  document.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      puzzleKey(btn.dataset.val);
    });
  });
  $('btn-puzzle-close').addEventListener('click', () => {
    Screens.hideOverlay('screen-puzzle');
    Game.activePuzzle = null;
    resumeGameLogic();
  });

  // ── Documento
  $('btn-doc-close').addEventListener('click', closeDocument);
}

/* ─────────────────────────────────────────────────────────────────
   28. INICIALIZAÇÃO GERAL
───────────────────────────────────────────────────────────────── */
function init() {
  setupInput();
  setupUIButtons();
  Screens.show('screen-title');
}

// Inicia quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
/* ─────────────────────────────────────────────────────────────────
   CONTROLES MOBILE — Joystick analógico + botões de ação
   VERSÃO CORRIGIDA:
   - Joystick recalcula centro a cada touchstart (corrige drift)
   - touch-action:none no canvas e body para evitar interferência
   - Botões usam pointer events + touch events para máxima compatibilidade
   - Mira automática no inimigo mais próximo ao atirar
───────────────────────────────────────────────────────────────── */
(function () {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;

  window._isMobile = true;

  // Impede que o body e canvas gerem scroll ou gestos durante o jogo
  document.body.style.touchAction  = 'none';
  document.body.style.overflow     = 'hidden';
  document.body.style.userSelect   = 'none';
  document.body.style.webkitUserSelect = 'none';

  /* ── Joystick ─────────────────────────────────────────────── */
  const RADIUS = 52;   // raio máximo do knob em pixels
  const DEAD   = 0.18; // zona morta (18%)

  let joyActive = false;
  let joyId     = null;
  let joyOrigX  = 0;
  let joyOrigY  = 0;

  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const zone = document.getElementById('joystick-zone');

  function moveKnob(dx, dy) {
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function applyMovement(dx, dy) {
    const nx = dx / RADIUS;
    const ny = dy / RADIUS;
    // Aplica movimento nas 4 direções com zona morta
    if (ny < -DEAD) Game.keys_held['KeyW'] = true; else delete Game.keys_held['KeyW'];
    if (ny >  DEAD) Game.keys_held['KeyS'] = true; else delete Game.keys_held['KeyS'];
    if (nx < -DEAD) Game.keys_held['KeyA'] = true; else delete Game.keys_held['KeyA'];
    if (nx >  DEAD) Game.keys_held['KeyD'] = true; else delete Game.keys_held['KeyD'];
  }

  function stopJoy() {
    joyActive = false;
    joyId     = null;
    moveKnob(0, 0);
    delete Game.keys_held['KeyW'];
    delete Game.keys_held['KeyS'];
    delete Game.keys_held['KeyA'];
    delete Game.keys_held['KeyD'];
  }

  // Detecta se o toque está dentro da zona do joystick
  function isTouchInJoystickZone(clientX, clientY) {
    if (!zone) return false;
    const r = zone.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right &&
           clientY >= r.top  && clientY <= r.bottom;
  }

  // touchstart: recalcula o centro do joystick-base em tempo real
  document.addEventListener('touchstart', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      if (isTouchInJoystickZone(t.clientX, t.clientY)) {
        if (joyActive) continue;
        joyActive = true;
        joyId     = t.identifier;
        // CRÍTICO: recalcula o centro do base a cada novo toque
        const r  = base.getBoundingClientRect();
        joyOrigX = r.left + r.width  / 2;
        joyOrigY = r.top  + r.height / 2;
        e.preventDefault();
        break;
      }
    }
  }, { passive: false });

  // touchmove: rastreia o dedo em qualquer lugar da tela
  document.addEventListener('touchmove', (e) => {
    if (!joyActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== joyId) continue;
      let dx  = t.clientX - joyOrigX;
      let dy  = t.clientY - joyOrigY;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
      moveKnob(dx, dy);
      applyMovement(dx, dy);
      e.preventDefault();
      break;
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!joyActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyId) { stopJoy(); break; }
    }
  }, { passive: false });

  document.addEventListener('touchcancel', () => { if (joyActive) stopJoy(); }, { passive: false });

  /* ── Mira automática (sem mouse no mobile) ────────────────── */
  function aimNearest() {
    if (!Game || !Game.enemies || !Game.player) return;
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const p = Game.player;
    let nearest = null, best = Infinity;
    for (const en of Game.enemies) {
      if (en.dead) continue;
      const d = Math.hypot(en.x - p.x, en.y - p.y);
      if (d < best) { best = d; nearest = en; }
    }
    const camX = p.x - W / 2;
    const camY = p.y - H / 2;
    if (nearest) {
      Game.mouse.x = nearest.x - camX;
      Game.mouse.y = nearest.y - camY;
    } else {
      // Sem inimigo: mira à frente (topo do canvas)
      Game.mouse.x = W / 2;
      Game.mouse.y = H / 2 - 100;
    }
  }

  /* ── Verifica se o jogo aceita ações agora ────────────────── */
  function canAct() {
    return Game.running && !Game.paused && !Game.over && !Game.victory &&
      !Screens.isOverlayOpen('screen-inventory') &&
      !Screens.isOverlayOpen('screen-puzzle')    &&
      !Screens.isOverlayOpen('screen-document')  &&
      !Screens.isOverlayOpen('screen-pause');
  }

  /* ── Helper: adiciona touchstart + click como fallback ───── */
  function addActionBtn(id, fn) {
    const btn = document.getElementById(id);
    if (!btn) return;
    let touched = false;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      touched = true;
      fn(btn, e);
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
    }, { passive: false });
    // Fallback click (para emuladores e navegadores que não disparam touchstart)
    btn.addEventListener('click', (e) => {
      if (touched) { touched = false; return; }
      fn(btn, e);
    });
  }

  /* ── Botão ATIRAR ─────────────────────────────────────────── */
  addActionBtn('mob-shoot', () => {
    if (!canAct()) return;
    aimNearest();
    shoot();
  });

  /* ── Botão CORRER ─────────────────────────────────────────── */
  const btnRun = document.getElementById('mob-run');
  if (btnRun) {
    btnRun.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      Game.keys_held['ShiftLeft'] = true;
      btnRun.classList.add('active-run');
    }, { passive: false });
    ['touchend', 'touchcancel'].forEach(ev =>
      btnRun.addEventListener(ev, (e) => {
        e.preventDefault();
        delete Game.keys_held['ShiftLeft'];
        btnRun.classList.remove('active-run');
      }, { passive: false })
    );
  }

  /* ── Botão COLETAR / INTERAGIR ───────────────────────────── */
  addActionBtn('mob-interact', () => {
    if (!canAct()) return;
    interact();
  });

  /* ── Botão RECARREGAR ────────────────────────────────────── */
  addActionBtn('mob-reload', () => {
    if (!canAct()) return;
    startReload();
  });

  /* ── Botão INVENTÁRIO ────────────────────────────────────── */
  addActionBtn('mob-inventory', () => {
    if (!Game.running || Game.over || Game.victory) return;
    if (Screens.isOverlayOpen('screen-inventory')) {
      Screens.hideOverlay('screen-inventory');
      resumeGameLogic();
    } else if (!Screens.isOverlayOpen('screen-puzzle') &&
               !Screens.isOverlayOpen('screen-document') &&
               !Screens.isOverlayOpen('screen-pause')) {
      renderInventoryUI();
      pauseGameLogic();
      Screens.showOverlay('screen-inventory');
    }
  });

  /* ── Exibe os controles mobile apenas na tela de jogo ────── */
  const mobileControls = document.getElementById('mobile-controls');
  const observer = new MutationObserver(() => {
    const gameScreen = document.getElementById('screen-game');
    if (mobileControls && gameScreen) {
      mobileControls.style.display = gameScreen.classList.contains('active') ? 'flex' : 'none';
    }
  });
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

}());
