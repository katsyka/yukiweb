// Moo — a small cow (and maybe her calf) living on your webpages.
(() => {
  if (window.top !== window) return;
  if (window.__mooCowLoaded) return;
  window.__mooCowLoaded = true;

  const SVG = "<svg class=\"cow-svg\" aria-hidden=\"true\" viewBox=\"0 0 230 150\" xmlns=\"http://www.w3.org/2000/svg\">\n<defs>\n  <radialGradient id=\"bodyShade\" cx=\"45%\" cy=\"30%\" r=\"75%\">\n    <stop class=\"b1\" offset=\"0%\" stop-color=\"#fbf9f4\"/><stop class=\"b2\" offset=\"65%\" stop-color=\"#ece6da\"/><stop class=\"b3\" offset=\"100%\" stop-color=\"#c9c0b0\"/>\n  </radialGradient>\n  <linearGradient id=\"legShade\" x1=\"0\" x2=\"1\">\n    <stop class=\"l1\" offset=\"0\" stop-color=\"#d8d0c2\"/><stop class=\"l2\" offset=\".45\" stop-color=\"#f3efe7\"/><stop class=\"l3\" offset=\"1\" stop-color=\"#cfc6b6\"/>\n  </linearGradient>\n  <linearGradient id=\"legFar\" x1=\"0\" x2=\"1\">\n    <stop class=\"f1\" offset=\"0\" stop-color=\"#b8ae9e\"/><stop class=\"f2\" offset=\".5\" stop-color=\"#d6cebf\"/><stop class=\"f3\" offset=\"1\" stop-color=\"#b3a998\"/>\n  </linearGradient>\n  <radialGradient id=\"headShade\" cx=\"40%\" cy=\"35%\" r=\"80%\">\n    <stop class=\"h1\" offset=\"0%\" stop-color=\"#fbf9f4\"/><stop class=\"h2\" offset=\"70%\" stop-color=\"#e9e2d5\"/><stop class=\"h3\" offset=\"100%\" stop-color=\"#c8bfae\"/>\n  </radialGradient>\n  <radialGradient id=\"muzzle\" cx=\"40%\" cy=\"35%\" r=\"70%\">\n    <stop class=\"m1\" offset=\"0\" stop-color=\"#f3c4ba\"/><stop class=\"m2\" offset=\"1\" stop-color=\"#d4968c\"/>\n  </radialGradient>\n  <radialGradient id=\"udder\" cx=\"40%\" cy=\"30%\" r=\"70%\">\n    <stop class=\"u1\" offset=\"0\" stop-color=\"#f6c9c0\"/><stop class=\"u2\" offset=\"1\" stop-color=\"#d9958b\"/>\n  </radialGradient>\n  <linearGradient id=\"patchShade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n    <stop class=\"p1\" offset=\"0\" stop-color=\"#2b2725\"/><stop class=\"p2\" offset=\"1\" stop-color=\"#141211\"/>\n  </linearGradient>\n  <clipPath id=\"bodyClip\"><path d=\"M46,64 C44,46 64,38 92,39 C118,40 140,36 156,44 C170,52 172,74 166,88 C158,102 128,105 100,104 C76,104 54,105 47,92 C43,84 44,74 46,64Z\"/></clipPath>\n  <clipPath id=\"headClip\"><path d=\"M186,40 C196,36 207,40 210,50 C213,62 217,72 216,81 C214,90 202,93 194,89 C188,86 186,77 184,67 C182,58 180,46 186,40Z\"/></clipPath>\n  <clipPath id=\"neckClip\"><path d=\"M150,52 C160,46 174,42 184,45 L188,70 C180,80 166,86 156,82 Z\"/></clipPath>\n  <linearGradient id=\"brass\" x1=\"0\" x2=\"1\">\n    <stop offset=\"0\" stop-color=\"#8f6d1e\"/><stop offset=\".35\" stop-color=\"#e8c766\"/><stop offset=\"1\" stop-color=\"#9a7521\"/>\n  </linearGradient>\n</defs>\n\n\n<!-- far legs -->\n<g class=\"leg leg-rf\">\n  <path d=\"M57,86 L71,86 L69,116 C69,122 67,128 67,138 L59,138 C59,128 58,122 58,116Z\" fill=\"url(#legFar)\"/>\n  <path d=\"M58.5,137 L67.5,137 L69,146 L57,146Z\" fill=\"#2c2420\"/>\n</g>\n<g class=\"leg leg-ff\">\n  <path d=\"M139,86 L153,86 L151,116 C151,122 149,128 149,138 L141,138 C141,128 140,122 140,116Z\" fill=\"url(#legFar)\"/>\n  <path d=\"M140.5,137 L149.5,137 L151,146 L139,146Z\" fill=\"#2c2420\"/>\n</g>\n\n<!-- tail -->\n<g class=\"tail\">\n  <path d=\"M48,56 C38,62 37,84 39,106\" fill=\"none\" class=\"tailhair\" stroke=\"#e3dccf\" stroke-width=\"3.2\" stroke-linecap=\"round\"/>\n  <path d=\"M39,104 C35,108 35,116 38,120 C40,116 42,116 43,120 C45,114 44,107 39,104Z\" class=\"tuft\" fill=\"#1d1a18\"/>\n</g>\n\n<!-- udder -->\n<g class=\"udder\">\n  <ellipse cx=\"80\" cy=\"103\" rx=\"12\" ry=\"8\" fill=\"url(#udder)\"/>\n  <rect x=\"72\" y=\"107\" width=\"3\" height=\"6\" rx=\"1.5\" class=\"teat\" fill=\"#d48e84\"/>\n  <rect x=\"78\" y=\"109\" width=\"3\" height=\"6\" rx=\"1.5\" class=\"teat\" fill=\"#d48e84\"/>\n  <rect x=\"84\" y=\"108\" width=\"3\" height=\"6\" rx=\"1.5\" class=\"teat\" fill=\"#cf887e\"/>\n</g>\n\n<!-- near legs -->\n<g class=\"leg leg-rn\">\n  <path d=\"M70,84 L86,84 L84,116 C84,122 82,128 82,138 L73,138 C73,128 72,122 72,116Z\" fill=\"url(#legShade)\"/>\n  <path d=\"M72.5,137 L82.5,137 L84,146 L71,146Z\" fill=\"#2c2420\"/>\n</g>\n<g class=\"leg leg-fn\">\n  <path d=\"M150,84 L166,84 L164,116 C164,122 162,128 162,138 L153,138 C153,128 152,122 152,116Z\" fill=\"url(#legShade)\"/>\n  <path d=\"M152.5,137 L162.5,137 L164,146 L151,146Z\" fill=\"#2c2420\"/>\n</g>\n\n<!-- neck + head -->\n<g class=\"neck\">\n  <path d=\"M150,52 C160,46 174,42 184,45 L188,70 C180,80 166,86 156,82 Z\" fill=\"url(#headShade)\"/>\n  <path d=\"M158,80 C164,90 172,92 180,84\" class=\"dewlap\" fill=\"#e4ddcf\"/>\n  <g class=\"npatch\" clip-path=\"url(#neckClip)\"><path d=\"M166,44 C176,40 186,44 186,52 C180,58 170,56 166,50Z\" fill=\"url(#patchShade)\"/></g>\n  \n  \n</g>\n\n<!-- body -->\n<g class=\"body\">\n  <path d=\"M46,64 C44,46 64,38 92,39 C118,40 140,36 156,44 C170,52 172,74 166,88 C158,102 128,105 100,104 C76,104 54,105 47,92 C43,84 44,74 46,64Z\" fill=\"url(#bodyShade)\"/>\n  <g class=\"bpatch\" clip-path=\"url(#bodyClip)\" fill=\"url(#patchShade)\">\n    <path d=\"M58,40 C76,34 98,42 95,58 C92,74 72,80 62,70 C54,62 48,46 58,40Z\"/>\n    <path d=\"M112,38 C128,34 146,44 141,60 C137,72 120,72 113,63 C106,55 104,42 112,38Z\"/>\n    <path d=\"M140,76 C152,70 172,76 168,92 C163,104 144,102 139,93 C135,86 135,80 140,76Z\"/>\n    <path d=\"M86,84 C95,79 106,86 102,97 C98,106 84,104 81,97 C79,91 80,87 86,84Z\"/>\n    <path d=\"M40,74 C48,70 56,78 53,88 C50,96 40,96 38,88Z\"/>\n  </g>\n  <g class=\"shag\" fill=\"none\" stroke=\"rgba(90,40,10,.28)\" stroke-width=\"1.2\" stroke-linecap=\"round\">\n    <path d=\"M60,50 q4,6 0,12 q-4,6 0,12\"/><path d=\"M78,46 q4,7 0,14 q-4,7 0,14\"/><path d=\"M98,46 q4,7 0,14 q-4,7 0,14 q4,7 0,12\"/>\n    <path d=\"M118,44 q4,7 0,14 q-4,7 0,14 q4,7 0,12\"/><path d=\"M138,48 q4,7 0,14 q-4,7 0,14\"/><path d=\"M154,52 q4,6 0,12 q-4,6 0,12\"/>\n    <path d=\"M70,96 l-2,8 M86,98 l-1,8 M104,99 l0,7 M124,99 l1,7 M144,96 l2,7 M58,94 l-3,7\"/>\n  </g>\n  <!-- hip and spine highlight -->\n  <path d=\"M58,46 C68,40 84,40 92,41\" fill=\"none\" stroke=\"rgba(255,255,255,.25)\" stroke-width=\"2\" stroke-linecap=\"round\"/>\n  <path d=\"M100,100 C118,101 138,100 154,94\" fill=\"none\" stroke=\"rgba(0,0,0,.08)\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n</g>\n\n<g class=\"neck\">\n  <g class=\"collar\">\n    <path d=\"M165,47 C169,58 171,70 172,82 L177,81.4 C176,69 174,57 170,45.5Z\" fill=\"#6b3a1e\"/>\n    <path d=\"M166.6,48.5 C170.3,59 172.4,70 173.6,81\" stroke=\"#8a5430\" stroke-width=\".7\" fill=\"none\" stroke-dasharray=\"1.6 1.4\"/>\n    <g class=\"bell\">\n      <rect x=\"172.8\" y=\"80.2\" width=\"3.6\" height=\"3\" rx=\"1\" fill=\"#7a5a1a\"/>\n      <path d=\"M170,83 L179.4,83 L181.4,93.5 C181.4,95.6 168,95.6 168,93.5Z\" fill=\"url(#brass)\"/>\n      <path d=\"M171.5,85 L172.6,93\" stroke=\"rgba(255,255,255,.45)\" stroke-width=\"1\" stroke-linecap=\"round\"/>\n      <ellipse cx=\"174.7\" cy=\"94.4\" rx=\"6.6\" ry=\"1.3\" fill=\"#5a4210\"/>\n      <circle cx=\"174.7\" cy=\"95.6\" r=\"1.5\" fill=\"#3b2c0b\"/>\n    </g>\n  </g>\n  <g class=\"head\"><g transform=\"translate(184 52) scale(1.12) translate(-190 -52) translate(-6 0)\">\n    <!-- ear far -->\n    \n    <path d=\"M186,40 C196,36 207,40 210,50 C213,62 217,72 216,81 C214,90 202,93 194,89 C188,86 186,77 184,67 C182,58 180,46 186,40Z\" fill=\"url(#headShade)\"/>\n    <g class=\"hpatch\" clip-path=\"url(#headClip)\">\n      <path d=\"M182,38 C194,32 208,38 210,48 C206,56 198,62 191,60 C186,58 181,50 182,38Z\" fill=\"url(#patchShade)\"/>\n    </g>\n    <path d=\"M196,77 C202,73 214,73 217,79 C219,87 212,93 203,92 C196,91 193,83 196,77Z\" fill=\"url(#muzzle)\"/>\n    <ellipse cx=\"212\" cy=\"81\" rx=\"2.1\" ry=\"1.4\" class=\"nostril\" fill=\"#7c4039\" transform=\"rotate(20 212 81)\"/>\n    <path d=\"M200,88 C204,90 209,90 212,89\" fill=\"none\" stroke=\"#9a5a52\" stroke-width=\"1\" stroke-linecap=\"round\"/>\n    <g class=\"horn\"><path d=\"M190,41 C189,35 192,30 197,29 C195,33 194,37 194,41Z\" fill=\"#e6dcc3\"/>\n    <path d=\"M196,29.5 C195,31 194.5,32 194.5,33\" stroke=\"#9c8f74\" stroke-width=\"1\" fill=\"none\"/></g>\n    <g class=\"longhorn\">\n      <path d=\"M186,42 C178,38 170,30 172,18 C175,26 182,33 190,38Z\" fill=\"#cdbf9f\"/>\n      <path d=\"M191,42 C190,32 196,20 208,13 C203,21 198,31 196,42Z\" fill=\"#ece2c8\"/>\n      <path d=\"M208,13 C205,15 203,17 202,19\" stroke=\"#6a5a40\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\"/>\n    </g>\n    <!-- eye -->\n    <g class=\"eye\">\n      <ellipse cx=\"200\" cy=\"56\" rx=\"3\" ry=\"3.4\" fill=\"#120e0c\"/>\n      <circle cx=\"201\" cy=\"55\" r=\"1\" fill=\"#fff\" opacity=\".85\"/>\n      <ellipse class=\"lid\" cx=\"200\" cy=\"56\" rx=\"3.6\" ry=\"4\" fill=\"#24201e\"/>\n    </g>\n    <path class=\"fringe\" d=\"M183,40 C191,33 206,35 211,45 L209,53 L206,49 L204,57 L201,51 L198,58 L195,51 L192,57 L190,50 L186,54 L185,47Z\" fill=\"#c46e34\"/>\n    <!-- ear near -->\n    <g class=\"ear\">\n      <path d=\"M190,49 C183,47 173,52 169,59 C176,62 185,59 191,54Z\" class=\"earout\" fill=\"#26211f\"/>\n      <path d=\"M187,52 C181,52 175,55 172,58.5 C178,60 184,57.5 188,54.5Z\" class=\"earin\" fill=\"#d79b91\"/>\n      <rect class=\"tag\" x=\"174\" y=\"57\" width=\"6\" height=\"7\" rx=\"1.6\" fill=\"#f2c230\" stroke=\"#b88a10\" stroke-width=\".6\"/>\n    </g>\n  </g></g>\n</g>\n</svg>";
  const BREED_CSS = ".cow { --b1:#fbf9f4; --b2:#ece6da; --b3:#c9c0b0; --h1:#fbf9f4; --h2:#e9e2d5; --h3:#c8bfae;\n  --l1:#d8d0c2; --l2:#f3efe7; --l3:#cfc6b6; --f1:#b8ae9e; --f2:#d6cebf; --f3:#b3a998;\n  --m1:#f3c4ba; --m2:#d4968c; --u1:#f6c9c0; --u2:#d9958b; --teat:#d48e84; --nose:#7c4039;\n  --tail:#e3dccf; --tuft:#1d1a18; --dew:#e4ddcf; --ear:#26211f; --earin:#d79b91;\n  --bp:1; --np:1; --hp:1; --horn:1; --longhorn:0; --fringe:0; --shag:0; }\n.cow.breed-jersey { --b1:#e6b984; --b2:#c98f55; --b3:#875629; --h1:#dcaa72; --h2:#a9703d; --h3:#5c391b;\n  --l1:#a26e3a; --l2:#d09c66; --l3:#956334; --f1:#86582d; --f2:#ad7c4b; --f3:#7c4f28;\n  --m1:#4d3e38; --m2:#221a17; --u1:#e9bda4; --u2:#c38a6c; --teat:#bf856d; --nose:#0f0b0a;\n  --tail:#b07a45; --tuft:#2e2118; --dew:#c48b55; --ear:#875629; --earin:#c78f74;\n  --bp:0; --np:0; --hp:0; }\n.cow.breed-hereford { --b1:#be5c33; --b2:#923c1d; --b3:#561e0c; --h1:#fbf9f4; --h2:#ece6da; --h3:#c8bfae;\n  --l1:#7a2e14; --l2:#a6482a; --l3:#6e2911; --f1:#5e220d; --f2:#84391e; --f3:#561f0b;\n  --tail:#923c1d; --tuft:#f2ece2; --dew:#f1ece2; --ear:#9b4120; --earin:#e0a796;\n  --bp:0; --np:0; --hp:0; }\n.cow.breed-angus { --b1:#46403d; --b2:#24201f; --b3:#0e0d0d; --h1:#433d3a; --h2:#24201f; --h3:#0e0d0d;\n  --l1:#1b1918; --l2:#36312f; --l3:#181615; --f1:#111010; --f2:#23201e; --f3:#0f0e0d;\n  --m1:#3e3533; --m2:#1a1514; --u1:#5e514e; --u2:#3a302e; --teat:#3a302e; --nose:#0b0909;\n  --tail:#2a2625; --tuft:#0c0b0b; --dew:#2a2625; --ear:#1d1a19; --earin:#4a3d3a;\n  --bp:0; --np:0; --hp:0; --horn:0; }\n.cow.breed-highland { --b1:#e09656; --b2:#b0612a; --b3:#6b3411; --h1:#d88d4e; --h2:#ad602c; --h3:#683312;\n  --l1:#8e4a1e; --l2:#bd6f36; --l3:#7f421b; --f1:#6e3815; --f2:#985428; --f3:#643213;\n  --m1:#5c4239; --m2:#2e211d; --u1:#d9a088; --u2:#b07560; --teat:#a86e58; --nose:#1a1210;\n  --tail:#b0612a; --tuft:#8a4a20; --dew:#c4743c; --ear:#a35a28; --earin:#d3946e;\n  --bp:0; --np:0; --hp:0; --horn:0; --longhorn:1; --fringe:1; --shag:1; }\n.b1{stop-color:var(--b1)} .b2{stop-color:var(--b2)} .b3{stop-color:var(--b3)}\n.h1{stop-color:var(--h1)} .h2{stop-color:var(--h2)} .h3{stop-color:var(--h3)}\n.l1{stop-color:var(--l1)} .l2{stop-color:var(--l2)} .l3{stop-color:var(--l3)}\n.f1{stop-color:var(--f1)} .f2{stop-color:var(--f2)} .f3{stop-color:var(--f3)}\n.m1{stop-color:var(--m1)} .m2{stop-color:var(--m2)} .u1{stop-color:var(--u1)} .u2{stop-color:var(--u2)}\n.teat{fill:var(--teat)} .nostril{fill:var(--nose)} .tailhair{stroke:var(--tail)} .tuft{fill:var(--tuft)}\n.dewlap{fill:var(--dew)} .earout{fill:var(--ear)} .earin{fill:var(--earin)}\n.bpatch{opacity:var(--bp)} .npatch{opacity:var(--np)} .hpatch{opacity:var(--hp)}\n.horn{opacity:var(--horn)} .longhorn{opacity:var(--longhorn)} .fringe{opacity:var(--fringe)} .shag{opacity:var(--shag)}\n.cow.nobell .collar { display: none; }\n.cow.calf .udder, .cow.calf .horn, .cow.calf .longhorn, .cow.calf .collar, .cow.calf .tag { display: none; }\n.cow.calf .head { scale: 1.2; }\n";

  const DEFAULTS = {
    enabled: true, name: 'Clarabelle', sound: true, pies: true, size: 'm',
    breed: 'holstein', bell: true, calf: false, hiddenSites: [],
  };
  const SIZES = { s: 92, m: 132, l: 184 };
  const CALF_SCALE = 0.58;
  const ASPECT = 150 / 230;
  const MUZZLE_GRAZE = 0.76;
  const TAIL_X = 0.17;
  const FOOT = 0.027;
  const GROUND = { type: 'ground' };

  const CSS = `
  :host { all: initial; }
  .pasture { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
  .cow { position: absolute; left: 0; bottom: 0; pointer-events: none; will-change: transform; }
  .flip { width: 100%; height: 100%; transform-origin: 50% 100%; transition: transform .25s; }
  .flip.left { transform: scaleX(-1); }
  .cow-svg { width: 100%; height: 100%; display: block; overflow: visible; pointer-events: none; }
  .hit { position: absolute; left: 14%; right: 4%; top: 18%; bottom: 2%; pointer-events: auto; cursor: grab; border-radius: 40%; }
  .cow.drag .hit { cursor: grabbing; }

  .leg-rf { transform-origin: 64px 88px; } .leg-ff { transform-origin: 146px 88px; }
  .leg-rn { transform-origin: 78px 88px; } .leg-fn { transform-origin: 158px 88px; }
  .tail { transform-origin: 48px 56px; }
  .neck { transform-origin: 154px 58px; }
  .head { transform-origin: 184px 52px; }
  .ear  { transform-origin: 189px 51px; }
  .bell { transform-origin: 174.6px 81.6px; transition: rotate .6s; }
  .lid  { transform-origin: 200px 52px; scale: 1 0; animation: blink 5.3s infinite; }

  .leg, .neck, .head, .body, .udder, .tail, .ear {
    transition: transform .7s cubic-bezier(.4,.1,.3,1), rotate .5s, opacity .4s;
  }

  @keyframes blink { 0%, 94%, 100% { scale: 1 0; } 96.5% { scale: 1 1; } }
  @keyframes swish { 0%,100% { rotate: 0deg; } 30% { rotate: 9deg; } 60% { rotate: -5deg; } }
  @keyframes flick { 0%, 86%, 100% { rotate: 0deg; } 89% { rotate: -22deg; } 93% { rotate: 6deg; } }
  @keyframes stepA { 0%,100% { rotate: 13deg; } 50% { rotate: -13deg; } }
  @keyframes stepB { 0%,100% { rotate: -13deg; } 50% { rotate: 13deg; } }
  @keyframes bob { 0%,100% { translate: 0 0; } 25%,75% { translate: 0 -1.4px; } 50% { translate: 0 0; } }
  @keyframes chew { 0%,100% { translate: 0 0; } 50% { translate: 0 1.6px; } }
  @keyframes dangleA { 0%,100% { rotate: 9deg; } 50% { rotate: -6deg; } }
  @keyframes dangleB { 0%,100% { rotate: -7deg; } 50% { rotate: 8deg; } }
  @keyframes breathe { 0%,100% { translate: 0 0; } 50% { translate: 0 1.2px; } }
  @keyframes ring { 0%,100% { rotate: 10deg; } 50% { rotate: -10deg; } }

  .tail { animation: swish 3.4s ease-in-out infinite; }
  .ear  { animation: flick 7.1s infinite; }
  .calf .tail { animation-duration: 2.2s; }

  .walk .leg-rn, .walk .leg-ff, .trot .leg-rn, .trot .leg-ff { animation: stepA .95s ease-in-out infinite; }
  .walk .leg-rf, .walk .leg-fn, .trot .leg-rf, .trot .leg-fn { animation: stepB .95s ease-in-out infinite; }
  .trot .leg { animation-duration: .42s !important; }
  .walk .body, .walk .neck, .walk .udder, .trot .body, .trot .neck, .trot .udder { animation: bob .95s ease-in-out infinite; }
  .trot .body, .trot .neck, .trot .udder { animation-duration: .42s; }
  .trot .tail { animation-duration: .8s; }
  .walk .bell { animation: ring .95s ease-in-out infinite; }
  .trot .bell { animation: ring .42s ease-in-out infinite; }
  .drag .bell, .fall .bell { animation: ring .3s ease-in-out infinite; }

  .graze .neck { transform: translateY(15px) rotate(52deg); }
  .graze .head { transform: rotate(-38deg); animation: chew .55s ease-in-out infinite; }
  .graze .bell { rotate: -48deg; }

  .moo .head { rotate: -16deg; }
  .moo .ear { rotate: -26deg; animation: none; }

  .sleep .leg { transform: scaleY(.35); animation: none; }
  .sleep .body { transform: translateY(34px); animation: breathe 3.6s ease-in-out infinite; }
  .sleep .udder { opacity: 0; }
  .sleep .tail { transform: translate(4px, 34px) rotate(-62deg); animation: none; }
  .sleep .neck { transform: translateY(36px) rotate(14deg); }
  .sleep .head { transform: rotate(8deg); }
  .sleep .bell { rotate: -14deg; }
  .sleep .lid, .happy .lid { animation: none; scale: 1 1; }
  .happy .tail { animation-duration: .7s; }
  .happy .head { rotate: -6deg; }

  .drag .leg-rn, .drag .leg-ff, .fall .leg-rn, .fall .leg-ff { animation: dangleA .5s ease-in-out infinite; }
  .drag .leg-rf, .drag .leg-fn, .fall .leg-rf, .fall .leg-fn { animation: dangleB .5s ease-in-out infinite; }
  .drag .tail { animation-duration: .9s; }
  .drag .head, .fall .head { rotate: -10deg; }

  .shadow { position: absolute; left: 0; bottom: 0; height: 7px; border-radius: 50%;
    background: radial-gradient(closest-side, rgba(0,0,0,.28), rgba(0,0,0,0)); pointer-events: none; }

  .bubble { position: absolute; bottom: 100%; padding: 5px 10px 6px; border-radius: 14px;
    background: #fff; color: #1c1a17; box-shadow: 0 2px 8px rgba(0,0,0,.18);
    font: 600 13px/1.2 ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif;
    white-space: nowrap; opacity: 0; transform: translateY(6px) scale(.9); transform-origin: 50% 100%;
    transition: opacity .2s, transform .25s cubic-bezier(.3,1.6,.5,1); pointer-events: none; }
  .calf .bubble { font-size: 11px; padding: 4px 8px 5px; }
  .bubble.show { opacity: 1; transform: translateY(0) scale(1); }
  .bubble::after { content: ""; position: absolute; top: 100%; width: 0; height: 0;
    border: 6px solid transparent; border-top-color: #fff; }
  .bubble.r { left: 62%; } .bubble.r::after { left: 12px; }
  .bubble.l { right: 62%; } .bubble.l::after { right: 12px; }

  .fx { position: absolute; pointer-events: none; font: 700 16px/1 ui-rounded, system-ui, sans-serif;
    animation: rise 1.8s ease-out forwards; }
  .fx.heart { color: #e0566b; font-size: 15px; }
  .fx.z { color: #5b6b86; font-style: italic; animation-duration: 2.6s; }
  .fx.bang { color: #d0402b; font-size: 20px; animation-duration: 1s; }
  @keyframes rise { 0% { opacity: 0; transform: translate(0,0) scale(.6); }
    15% { opacity: 1; transform: translate(0,-6px) scale(1); }
    100% { opacity: 0; transform: translate(var(--dx, 8px), -46px) scale(1.1); } }

  .dust { position: absolute; width: 10px; height: 10px; border-radius: 50%;
    background: rgba(170,150,120,.5); pointer-events: none; animation: puff .7s ease-out forwards; }
  @keyframes puff { to { opacity: 0; transform: translate(var(--dx), -10px) scale(2.4); } }

  .grass { position: absolute; bottom: 0; pointer-events: none; transform-origin: 50% 100%;
    transition: transform .4s; animation: sprout .5s cubic-bezier(.3,1.5,.5,1); }
  @keyframes sprout { from { transform: scaleY(0); } }

  .pie { position: absolute; bottom: 0; pointer-events: auto; cursor: pointer; transition: opacity .3s, transform .3s; }
  .pie.gone { opacity: 0; transform: scale(.4) translateY(6px); }
  .stink { position: absolute; bottom: 100%; left: 50%; width: 2px; height: 12px; border-radius: 2px;
    background: rgba(120,140,80,.45); animation: stink 2.4s ease-in-out infinite; }
  @keyframes stink { 0% { opacity: 0; transform: translate(-50%, 4px) rotate(-8deg); }
    50% { opacity: 1; } 100% { opacity: 0; transform: translate(-30%, -14px) rotate(10deg); } }

  ${BREED_CSS}

  @media (prefers-reduced-motion: reduce) {
    .tail, .ear, .lid, .bell { animation: none !important; }
    .fx, .dust { animation-duration: .01s !important; }
  }`;

  // ---------- DOM scaffolding ----------
  const host = document.createElement('div');
  host.setAttribute('data-moo-cow', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
  const shadowRoot = host.attachShadow({ mode: 'open' });

  let ttPolicy = null;
  try { if (window.trustedTypes) ttPolicy = trustedTypes.createPolicy('moo-cow', { createHTML: (s) => s }); } catch (_) {}
  const setHTML = (el, html) => { el.innerHTML = ttPolicy ? ttPolicy.createHTML(html) : html; };

  try {
    const sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); shadowRoot.adoptedStyleSheets = [sheet];
  } catch (_) {
    const st = document.createElement('style'); st.textContent = CSS; shadowRoot.appendChild(st);
  }
  const pasture = document.createElement('div');
  pasture.className = 'pasture';
  shadowRoot.appendChild(pasture);

  const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const vw = () => document.documentElement.clientWidth || window.innerWidth;
  const vh = () => window.innerHeight;

  // ---------- world ----------
  const world = { settings: { ...DEFAULTS }, grasses: [], pies: [], mouse: { x: 0, y: 0 } };
  const stats = { moos: 0, pets: 0, grass: 0, pies: 0, drops: 0 };
  let mom = null, calf = null;
  const cows = () => (calf ? [mom, calf] : [mom]);

  // ---------- surfaces: the bottom of the window, or the top edge of anything on the page ----------
  function rectOf(s) {
    if (s.type === 'ground') return { top: vh(), left: 0, right: vw() };
    const r = s.el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, width: r.width, height: r.height };
  }
  const sameSurf = (a, b) => a === b || (a.type === 'el' && b.type === 'el' && a.el === b.el);

  // ---------- sound ----------
  let audio = null;
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (_) { audio = null; }
  }
  const canPlay = () => world.settings.sound && audio && audio.state === 'running';

  function mooSound(pitch, intensity = 1) {
    if (!canPlay()) return;
    const t = audio.currentTime;
    const dur = rand(1.1, 1.6) * (0.8 + 0.2 * intensity) / Math.sqrt(pitch);
    const base = rand(92, 118) * pitch;
    const out = audio.createGain(); out.gain.value = 0.22; out.connect(audio.destination);
    const env = audio.createGain(); env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.9, t + 0.15);
    env.gain.linearRampToValueAtTime(0.75, t + dur - 0.3);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const osc = audio.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 0.86, t);
    osc.frequency.linearRampToValueAtTime(base * 1.12, t + 0.28);
    osc.frequency.linearRampToValueAtTime(base * 1.04, t + dur * 0.65);
    osc.frequency.linearRampToValueAtTime(base * 0.78, t + dur);
    const sub = audio.createOscillator(); sub.type = 'triangle';
    sub.frequency.setValueAtTime(base * 0.5, t);
    const subG = audio.createGain(); subG.gain.value = 0.35;
    const lfo = audio.createOscillator(); lfo.frequency.value = 5.2;
    const lfoG = audio.createGain(); lfoG.gain.value = base * 0.025;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    const mouth = audio.createBiquadFilter(); mouth.type = 'lowpass'; mouth.Q.value = 7;
    mouth.frequency.setValueAtTime(260 * pitch, t);
    mouth.frequency.linearRampToValueAtTime(820 * pitch, t + 0.32);
    mouth.frequency.linearRampToValueAtTime(560 * pitch, t + dur * 0.8);
    mouth.frequency.linearRampToValueAtTime(300 * pitch, t + dur);
    const nasal = audio.createBiquadFilter(); nasal.type = 'peaking';
    nasal.frequency.value = 1150; nasal.Q.value = 3; nasal.gain.value = 5;
    osc.connect(mouth); sub.connect(subG); subG.connect(mouth);
    mouth.connect(nasal); nasal.connect(env); env.connect(out);
    [osc, sub, lfo].forEach((o) => { o.start(t); o.stop(t + dur + 0.05); });
  }

  function bellSound(vol = 0.5) {
    if (!canPlay() || !world.settings.bell) return;
    const t = audio.currentTime;
    const f = rand(410, 470);
    const out = audio.createGain(); out.gain.value = 0.09 * vol; out.connect(audio.destination);
    const body = audio.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = f * 2.2; body.Q.value = 0.8;
    body.connect(out);
    [[1, 1], [2.32, 0.7], [4.25, 0.35], [6.63, 0.18]].forEach(([m, a]) => {
      const o = audio.createOscillator(); o.type = m === 1 ? 'triangle' : 'sine';
      o.frequency.value = f * m * rand(0.995, 1.005);
      const g = audio.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 / Math.pow(m, 0.4));
      o.connect(g); g.connect(body); o.start(t); o.stop(t + 0.6);
    });
  }

  // ---------- effects ----------
  function fx(cls, text, x, y) {
    const el = div('fx ' + cls); el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', rand(-14, 14) + 'px');
    pasture.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  // ---------- the cow ----------
  const MOOS = ['Moo.', 'Mooo!', 'moo?', 'Mooooo.', 'MOO.', 'mm-moo'];
  const CALF_MOOS = ['mew?', 'mmeh!', 'moo!', 'meh.', 'muu?'];

  class Cow {
    constructor(isCalf) {
      this.isCalf = isCalf;
      this.shadow = div('shadow');
      this.el = div('cow idle' + (isCalf ? ' calf' : ''));
      this.bubble = div('bubble r');
      this.flip = div('flip');
      setHTML(this.flip, SVG);
      this.hit = div('hit');
      this.el.append(this.bubble, this.flip, this.hit);
      pasture.append(this.shadow, this.el);

      this.x = rand(0, Math.max(0, vw() - this.W)); this.y = 0; this.vy = 0;
      this.facing = Math.random() < 0.5 ? 1 : -1;
      this.state = 'idle'; this.until = 0; this.target = null; this.speed = 0;
      this.offEdge = false; this.faceAfter = null; this.surf = GROUND;
      this.food = null; this.lastZ = 0; this.sway = 0; this.dropped = false;
      this.nextBell = 0; this.wakeAt = 0; this.pieAt = 0; this.lastBite = 0;
      this.petDist = 0; this.petStart = 0; this.petMoves = 0; this.lastHeart = 0;
      this.press = null;
      this.bindPointer();
      this.applyLook();
      this.face(this.facing);
    }

    get W() { const b = SIZES[world.settings.size] || SIZES.m; return this.isCalf ? b * CALF_SCALE : b; }
    get H() { return this.W * ASPECT; }
    get pitch() { return this.isCalf ? 1.45 : Math.pow(SIZES.m / this.W, 0.35); }
    centerX() { return this.x + this.W / 2; }

    applyLook() {
      this.el.style.width = this.W + 'px'; this.el.style.height = this.H + 'px';
      this.el.className = this.el.className.replace(/\bbreed-\S+/g, '').trim() + ' breed-' + (world.settings.breed || 'holstein');
      this.el.classList.toggle('nobell', !world.settings.bell);
      this.hit.title = this.isCalf ? `${world.settings.name}'s calf` : `${world.settings.name} 🐄`;
    }

    // surface helpers
    feetYOn(s) { return s.type === 'ground' ? 0 : vh() - rectOf(s).top - this.H * FOOT; }
    rangeOn(s) {
      if (s.type === 'ground') return [0, Math.max(0, vw() - this.W)];
      const r = rectOf(s);
      const a = r.left - this.W * 0.2, b = r.right - this.W * 0.8;
      return [a, Math.max(a, b)];
    }
    clampOn(s, x) { const [a, b] = this.rangeOn(s); return Math.max(a, Math.min(b, x)); }
    onSurf(s) {
      if (s.type === 'ground') return true;
      const r = rectOf(s), c = this.centerX();
      return c >= r.left && c <= r.right;
    }
    surfStatus(s) {
      if (s.type === 'ground') return 'ok';
      if (!s.el.isConnected) return 'gone';
      const r = rectOf(s);
      if (r.width < 2) return 'gone';
      if (r.top > vh() - 2) return 'below';
      if (r.top < this.H * 0.9) return 'gone';
      return 'ok';
    }
    canDropOff(s, dir) {
      if (s.type === 'ground') return false;
      const r = rectOf(s);
      return dir < 0 ? r.left > this.W * 0.3 : r.right < vw() - this.W * 0.3;
    }
    probeLanding(prevScreen, newScreen) {
      const xs = [this.centerX(), this.centerX() - this.W * 0.18, this.centerX() + this.W * 0.18];
      const py = Math.min(newScreen, vh() - 1);
      for (const px of xs) {
        if (px < 0 || px >= vw()) continue;
        for (const el of document.elementsFromPoint(px, py)) {
          if (el === host || el === document.documentElement || el === document.body) continue;
          const r = el.getBoundingClientRect();
          if (r.top >= prevScreen - 1 && r.top <= newScreen + 1 && r.width >= this.W * 0.7 &&
              r.height >= 12 && r.top > this.H * 0.9) return { type: 'el', el };
        }
      }
      return null;
    }

    // state
    setState(s, ms) {
      this.state = s;
      this.until = ms ? now() + ms : 0;
      this.el.classList.remove('idle', 'walk', 'trot', 'graze', 'sleep', 'drag', 'fall');
      this.el.classList.add(s === 'eat' ? 'graze' : s);
    }
    face(dir) { this.facing = dir; this.flip.classList.toggle('left', dir < 0); }
    say(text, ms = 1600) {
      this.bubble.textContent = text;
      this.bubble.classList.toggle('r', this.facing > 0);
      this.bubble.classList.toggle('l', this.facing < 0);
      this.bubble.classList.add('show');
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = setTimeout(() => this.bubble.classList.remove('show'), ms);
    }
    headPoint() { return { x: this.x + this.W * (this.facing > 0 ? 0.86 : 0.14), y: vh() - this.y - this.H * 0.75 }; }
    moo(text, intensity = 1) {
      if (this.state === 'sleep') return;
      this.say(text || pick(this.isCalf ? CALF_MOOS : MOOS));
      mooSound(this.pitch, intensity);
      this.el.classList.add('moo');
      clearTimeout(this.mooTimer);
      this.mooTimer = setTimeout(() => this.el.classList.remove('moo'), 1300);
    }
    dust() {
      for (let i = 0; i < 6; i++) {
        const d = div('dust');
        d.style.left = (this.centerX() + rand(-this.W * 0.3, this.W * 0.3)) + 'px';
        d.style.bottom = (this.y + this.H * FOOT) + 'px';
        d.style.setProperty('--dx', rand(-18, 18) + 'px');
        pasture.appendChild(d); setTimeout(() => d.remove(), 800);
      }
    }
    walkTo(x, mode = 'walk', faceAfter) {
      this.target = x; this.faceAfter = faceAfter || null; this.offEdge = false;
      this.speed = (mode === 'trot' ? 95 : 30) * (this.W / SIZES.m) ** (this.isCalf ? 0.2 : 0.6);
      this.setState(mode);
      if (Math.abs(x - this.x) > 1) this.face(x > this.x ? 1 : -1);
    }
    walkOff(dir, mode = 'walk') {
      const r = rectOf(this.surf);
      this.walkTo(dir < 0 ? r.left - this.W * 0.6 : r.right - this.W * 0.4, mode);
      this.offEdge = true;
    }
    startFall(text) {
      this.target = null; this.offEdge = false; this.vy = 0;
      this.setState('fall');
      if (text) this.say(text, 900);
    }
    hop() { this.vy = rand(300, 420); this.target = null; this.setState('fall'); }
    wake(text) {
      this.wakeAt = 0;
      this.setState('idle', rand(1500, 3000));
      if (text) setTimeout(() => this.say(text), 400);
    }

    // ---- brains ----
    decide() { if (this.isCalf) this.decideCalf(); else this.decideMom(); }

    decideMom() {
      if (this.seekFood()) return;
      const s = this.surf, r = Math.random();
      if (s.type === 'el' && r < 0.14) {
        const dirs = [-1, 1].filter((d) => this.canDropOff(s, d));
        if (dirs.length) { this.walkOff(pick(dirs)); return; }
      }
      const h = new Date().getHours();
      const sleepP = h >= 22 || h < 6 ? 0.3 : 0.08;
      if (r < sleepP) { this.setState('sleep', rand(16000, 42000)); this.lastZ = now(); return; }
      if (r < sleepP + 0.38) {
        const [a, b] = this.rangeOn(s);
        const span = Math.min((b - a) * 0.7 + 40, 520);
        this.walkTo(this.clampOn(s, this.x + rand(-span, span)), 'walk');
        return;
      }
      if (r < sleepP + 0.66) { this.setState('graze', rand(4000, 10000)); return; }
      this.setState('idle', rand(2500, 6000));
      if (Math.random() < 0.15) setTimeout(() => this.moo(null, 0.7), 900);
    }

    decideCalf() {
      const m = mom;
      if (['drag', 'fall'].includes(m.state)) { this.setState('idle', 600); return; }
      if (!sameSurf(this.surf, m.surf)) {
        if (this.surf.type === 'el') {
          let dir = m.centerX() < this.centerX() ? -1 : 1;
          if (!this.canDropOff(this.surf, dir)) dir = -dir;
          if (this.canDropOff(this.surf, dir)) { this.walkOff(dir, 'trot'); return; }
          this.setState('idle', rand(2000, 4000));
          if (Math.random() < 0.5) setTimeout(() => this.moo('mmeh!?', 0.7), 300);
          return;
        }
        // mom is up somewhere the calf can't reach: stand under her and complain
        const tx = this.clampOn(GROUND, m.centerX() - this.W / 2);
        if (Math.abs(tx - this.x) > 24) { this.walkTo(tx, Math.abs(tx - this.x) > 200 ? 'trot' : 'walk'); return; }
        this.setState('idle', rand(2000, 4000));
        if (Math.random() < 0.4) setTimeout(() => this.moo(pick(['moo?', 'mmeh!', 'mama?']), 0.6), 400);
        return;
      }
      const behind = m.facing > 0 ? m.x - this.W * 0.75 : m.x + m.W - this.W * 0.25;
      const spot = this.clampOn(this.surf, behind);
      const d = spot - this.x;
      if (m.state === 'sleep') {
        if (Math.abs(d) > 24) { this.walkTo(spot, 'walk', m.facing); return; }
        this.face(m.facing); this.setState('sleep', 0); this.lastZ = now(); return;
      }
      if (Math.abs(d) > 46) { this.walkTo(spot, Math.abs(d) > 220 ? 'trot' : 'walk'); return; }
      if (m.state === 'graze' || m.state === 'eat') { this.face(m.facing); this.setState('graze', rand(2500, 6000)); return; }
      const r = Math.random();
      if (r < 0.2) { this.hop(); return; }
      if (r < 0.34) { this.walkTo(this.clampOn(this.surf, this.x + rand(-140, 140)), 'trot'); return; }
      if (r < 0.4) setTimeout(() => this.moo(null, 0.5), 300);
      this.face(m.centerX() > this.centerX() ? 1 : -1);
      this.setState('idle', rand(1200, 3000));
    }

    seekFood() {
      const grasses = world.grasses;
      if (this.isCalf || !grasses.length) return false;
      const muzzleNow = this.x + this.W * (this.facing > 0 ? MUZZLE_GRAZE : 1 - MUZZLE_GRAZE);
      let best = grasses[0];
      for (const g of grasses) if (Math.abs(g.x - muzzleNow) < Math.abs(best.x - muzzleNow)) best = g;
      if (this.surf.type === 'el') {
        let dir = best.x < this.centerX() ? -1 : 1;
        if (!this.canDropOff(this.surf, dir)) dir = -dir;
        if (!this.canDropOff(this.surf, dir)) return false;
        this.food = best; this.walkOff(dir);
        return true;
      }
      this.food = best;
      const dir = best.x >= this.centerX() ? 1 : -1;
      const tx = dir > 0 ? best.x - this.W * MUZZLE_GRAZE : best.x - this.W * (1 - MUZZLE_GRAZE);
      this.walkTo(this.clampOn(GROUND, tx), Math.abs(tx - this.x) > 350 ? 'trot' : 'walk', dir);
      return true;
    }

    arrive() {
      this.target = null;
      if (this.faceAfter) this.face(this.faceAfter);
      if (this.food && world.grasses.includes(this.food) && this.surf.type === 'ground') { this.setState('eat', 1200); return; }
      this.food = null;
      this.decide();
    }

    eatTick(t) {
      const g = this.food;
      if (!g || !world.grasses.includes(g)) { this.food = null; this.decide(); return; }
      if (t - this.lastBite > 1100) {
        this.lastBite = t; g.bites++;
        g.el.style.transform = `scaleY(${Math.max(0.05, 1 - g.bites * 0.2)})`;
        if (g.bites >= 5) {
          g.el.remove(); world.grasses.splice(world.grasses.indexOf(g), 1); this.food = null;
          stats.grass++;
          if (Math.random() < 0.55) this.pieAt = t + rand(9000, 24000);
          if (Math.random() < 0.5) setTimeout(() => this.moo('mm. moo.', 0.6), 700);
          this.setState('idle', rand(1500, 3000));
        }
      }
    }

    startle(fromX) {
      const p = this.headPoint();
      fx('bang', '!', p.x, p.y - 14);
      this.food = null;
      if (this.state === 'sleep') { this.wake(this.isCalf ? 'mmeh?!' : 'MOO?!'); return; }
      const s = this.surf;
      const away = fromX < this.centerX() ? 1 : -1;
      let tx = this.clampOn(s, this.x + away * rand(180, 300));
      if (Math.abs(tx - this.x) < 60) tx = this.clampOn(s, this.x - away * rand(180, 300));
      this.walkTo(tx, 'trot');
    }

    // ---- per-frame ----
    tick(dt, t) {
      const W = this.W, H = this.H;

      // ride whatever she's standing on (this is how she scrolls with the page)
      if (!['drag', 'fall'].includes(this.state)) {
        const s = this.surf;
        if (s.type === 'el') {
          const st = this.surfStatus(s);
          if (st === 'gone') this.startFall(Math.random() < 0.6 ? (this.isCalf ? 'mmeh!' : 'moo!?') : null);
          else if (st === 'below') { this.surf = GROUND; this.y = 0; this.x = this.clampOn(GROUND, this.x); this.offEdge = false; }
          else {
            this.y = this.feetYOn(s);
            if (!this.onSurf(s) && !this.offEdge) this.startFall();
          }
        } else this.y = 0;
      }

      switch (this.state) {
        case 'walk': case 'trot': {
          const dx = this.target - this.x;
          const step = this.speed * dt;
          const arrived = Math.abs(dx) <= step;
          this.x = arrived ? this.target : this.x + Math.sign(dx) * step;
          if (this.surf.type === 'el' && !this.onSurf(this.surf)) { this.startFall(Math.random() < 0.5 ? (this.isCalf ? 'mmeh!' : 'moo!') : null); break; }
          if (arrived) this.arrive();
          if (!this.isCalf && t > this.nextBell) {
            bellSound(this.state === 'trot' ? 0.6 : 0.25);
            this.nextBell = t + (this.state === 'trot' ? 420 : rand(1800, 3200));
          }
          break;
        }
        case 'eat': this.eatTick(t); break;
        case 'sleep':
          if (t - this.lastZ > 1700) { this.lastZ = t; const p = this.headPoint(); fx('z', pick(['z', 'Z', 'z']), p.x, p.y - 4); }
          if (this.isCalf) {
            if (mom.state !== 'sleep' && !this.wakeAt) this.wakeAt = t + rand(800, 2500);
            if (this.wakeAt && t > this.wakeAt) this.wake();
          } else if (this.until && t > this.until) this.wake('*yawn*');
          break;
        case 'fall': {
          const prevY = this.y;
          this.vy -= 2600 * dt; this.y += this.vy * dt;
          if (this.vy < 0) {
            const prevScreen = vh() - prevY - H * FOOT;
            const newScreen = vh() - this.y - H * FOOT;
            let land = this.probeLanding(prevScreen, newScreen);
            if (!land && this.y <= 0) land = GROUND;
            if (land) {
              this.surf = land;
              this.y = this.feetYOn(land);
              if (this.vy < -420) {
                this.vy = -this.vy * 0.22; this.dust();
                if (!this.isCalf) bellSound(0.7);
              } else {
                this.vy = 0; this.x = this.clampOn(land, this.x);
                this.setState('idle', rand(this.isCalf ? 500 : 1200, this.isCalf ? 1200 : 2200));
                if (this.dropped) {
                  this.dropped = false;
                  setTimeout(() => this.moo(this.isCalf ? 'mmeh?!' : pick(['moo?!', 'moo.', 'oof. moo.']), 0.8), 250);
                }
              }
            }
          }
          break;
        }
        case 'drag':
          if (!this.isCalf && Math.abs(this.sway) > 5 && t > this.nextBell) { bellSound(0.5); this.nextBell = t + 320; }
          break;
        default:
          if (this.until && t > this.until) this.decide();
      }

      if (this.pieAt && t > this.pieAt && this.surf.type === 'ground' && !['drag', 'fall'].includes(this.state)) {
        this.pieAt = 0; addPie(this);
      }

      this.sway *= 0.88;
      this.el.style.transform = `translate(${this.x}px, ${-this.y}px) rotate(${this.sway}deg)`;

      // shadow on whatever is below her
      let floorY = 0;
      if (['drag', 'fall'].includes(this.state)) {
        const below = this.probeLanding(vh() - this.y - H * FOOT, vh());
        floorY = below ? this.feetYOn(below) : 0;
      } else floorY = this.y;
      const gap = Math.max(0, this.y - floorY);
      const lift = Math.min(1, gap / 300);
      this.shadow.style.width = (W * 0.62 * (1 - lift * 0.5)) + 'px';
      this.shadow.style.bottom = (floorY + H * FOOT - 3) + 'px';
      this.shadow.style.transform = `translateX(${this.x + W * 0.19 + W * 0.155 * lift}px)`;
      this.shadow.style.opacity = String(1 - lift * 0.7);
    }

    // ---- pointer: click, drag, pet ----
    bindPointer() {
      const hit = this.hit;
      hit.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        unlockAudio();
        hit.setPointerCapture(e.pointerId);
        this.press = { sx: e.clientX, sy: e.clientY, ox: e.clientX - this.x, oy: (vh() - e.clientY) - this.y, dragging: false, lx: e.clientX };
      });
      hit.addEventListener('pointermove', (e) => {
        const p = this.press;
        if (p) {
          if (!p.dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) {
            p.dragging = true; this.target = null; this.food = null; this.offEdge = false;
            this.setState('drag'); this.bubble.classList.remove('show');
            if (Math.random() < 0.6) this.say(this.isCalf ? 'mmeh!!' : pick(['!!', 'moo!?', 'whoa']), 900);
            if (this.isCalf && mom.state !== 'drag' && mom.state !== 'fall') {
              if (mom.state === 'sleep') mom.wake();
              mom.face(this.centerX() > mom.centerX() ? 1 : -1);
              setTimeout(() => mom.moo('MOO!', 1.2), 300);
            }
          }
          if (p.dragging) {
            this.sway = Math.max(-14, Math.min(14, this.sway + (e.clientX - p.lx) * 0.35));
            p.lx = e.clientX;
            this.x = Math.max(-this.W * 0.3, Math.min(vw() - this.W * 0.7, e.clientX - p.ox));
            this.y = Math.max(0, Math.min(vh() - this.H, (vh() - e.clientY) - p.oy));
          }
          return;
        }
        const t = now();
        if (t - this.petStart > 2500) { this.petStart = t; this.petDist = 0; this.petMoves = 0; }
        this.petDist += Math.min(25, Math.abs(e.movementX) + Math.abs(e.movementY));
        this.petMoves++;
        if (this.petDist > 260 && this.petMoves > 14 && t - this.lastHeart > 380 && this.state !== 'drag') {
          this.lastHeart = t; stats.pets++;
          const hp = this.headPoint();
          fx('heart', '♥', hp.x + rand(-this.W * 0.3, 0) * this.facing, hp.y - 8);
          this.el.classList.add('happy');
          clearTimeout(this.happyTimer);
          this.happyTimer = setTimeout(() => this.el.classList.remove('happy'), 1400);
          if (this.state === 'walk' && !this.offEdge) this.setState('idle', 3000);
          else if (this.until) this.until = Math.max(this.until, t + 2500);
        }
      });
      const end = () => {
        const p = this.press;
        if (!p) return;
        this.press = null;
        if (p.dragging) { this.dropped = true; stats.drops++; this.startFall(); return; }
        if (this.state === 'sleep') { this.wake(); setTimeout(() => this.moo(this.isCalf ? 'mew?' : '…moo?', 0.6), 500); return; }
        stats.moos++;
        this.moo();
      };
      hit.addEventListener('pointerup', end);
      hit.addEventListener('pointercancel', end);
    }

    remove() { this.el.remove(); this.shadow.remove(); }
  }

  // ---------- grass & pies (on the window's bottom edge) ----------
  function grassSVG(h) {
    const blades = [];
    for (let i = 0; i < 9; i++) {
      const bx = 6 + i * 4 + rand(-1.5, 1.5), lean = rand(-7, 7), bh = h * rand(0.55, 1);
      const g = Math.round(rand(110, 160));
      blades.push(`<path d="M${bx - 1.6},${h} Q${bx + lean * 0.4},${h - bh * 0.6} ${bx + lean},${h - bh} Q${bx + lean * 0.3},${h - bh * 0.5} ${bx + 1.6},${h}Z" fill="rgb(${g - 50},${g},${g - 80})"/>`);
    }
    return `<svg width="48" height="${h}" viewBox="0 0 48 ${h}">${blades.join('')}</svg>`;
  }

  function addGrass(clientX) {
    const grasses = world.grasses;
    if (grasses.length >= 6) grasses.shift().el.remove();
    const el = div('grass');
    setHTML(el, grassSVG(Math.round(mom.W * 0.2 + 8)));
    const x = Math.max(24, Math.min(vw() - 24, clientX));
    el.style.left = (x - 24) + 'px';
    pasture.appendChild(el);
    grasses.push({ el, x, bites: 0 });
    if (mom.state === 'sleep') { if (Math.random() < 0.5) mom.wake('…grass?'); }
    else if (!['drag', 'fall', 'eat'].includes(mom.state)) mom.seekFood();
  }

  function addPie(cow) {
    if (!world.settings.pies || world.pies.length >= 5) return;
    const x = cow.x + cow.W * (cow.facing > 0 ? TAIL_X : 1 - TAIL_X);
    const el = div('pie');
    const pw = Math.round(cow.W * 0.16 + 6), ph = Math.round(pw * 0.42);
    setHTML(el, `<svg width="${pw}" height="${ph}" viewBox="0 0 30 12">
      <ellipse cx="15" cy="9" rx="14" ry="3.4" fill="#5c4127"/>
      <ellipse cx="15" cy="6.5" rx="10" ry="3.2" fill="#6e4f30"/>
      <ellipse cx="15" cy="4" rx="6" ry="2.6" fill="#7d5a37"/>
      <ellipse cx="13" cy="3.2" rx="2" ry=".8" fill="#9a7650" opacity=".7"/></svg><div class="stink"></div>`);
    el.title = 'Click to tidy up';
    el.style.left = (x - pw / 2) + 'px';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.add('gone');
      stats.pies++;
      fx('heart', '✨', x - 6, vh() - 30);
      setTimeout(() => el.remove(), 320);
      world.pies.splice(world.pies.indexOf(el), 1);
    });
    pasture.appendChild(el); world.pies.push(el);
  }

  // ---------- global input ----------
  let mp = null;
  window.addEventListener('pointermove', (e) => {
    const t = now();
    world.mouse.x = e.clientX; world.mouse.y = e.clientY;
    if (mp && mom && host.style.display !== 'none') {
      const dtm = t - mp.t;
      if (dtm > 0 && dtm < 60) {
        const speed = Math.hypot(e.clientX - mp.x, e.clientY - mp.y) / dtm;
        if (speed > 2.6) {
          for (const c of cows()) {
            if (c.press || ['drag', 'fall', 'trot'].includes(c.state)) continue;
            const top = vh() - c.y - c.H, bottom = vh() - c.y;
            const inZone = (x, y) => x > c.x - 30 && x < c.x + c.W + 30 && y > top - 30 && y < bottom + 10;
            if (inZone(e.clientX, e.clientY) && !inZone(mp.x, mp.y)) c.startle(e.clientX);
          }
        }
      }
    }
    mp = { x: e.clientX, y: e.clientY, t };
  }, { passive: true, capture: true });

  window.addEventListener('click', (e) => {
    if (!e.altKey || host.style.display === 'none' || !mom) return;
    e.preventDefault(); e.stopPropagation();
    addGrass(e.clientX);
  }, true);

  window.addEventListener('resize', () => {
    for (const c of cows()) if (c.surf.type === 'ground') c.x = c.clampOn(GROUND, c.x);
  });
  document.addEventListener('fullscreenchange', () => applyVisibility());

  // ---------- main loop ----------
  let last = now(), lastSave = 0;
  function tick(t) {
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    if (host.style.display !== 'none') for (const c of cows()) c.tick(dt, t);
    if (t - lastSave > 5000) { lastSave = t; persist(); }
    requestAnimationFrame(tick);
  }

  // ---------- settings, storage, messages ----------
  const hiddenHere = () => (world.settings.hiddenSites || []).includes(location.hostname);
  function applyVisibility() {
    host.style.display = world.settings.enabled && !hiddenHere() && !document.fullscreenElement ? '' : 'none';
  }
  function syncCalf() {
    if (world.settings.calf && !calf && mom) {
      calf = new Cow(true);
      calf.x = mom.clampOn(GROUND, mom.x + (mom.facing > 0 ? -calf.W : mom.W));
      calf.face(mom.facing);
      if (mom.surf.type !== 'ground') { calf.surf = GROUND; }
      calf.setState('idle', rand(400, 1200));
    } else if (!world.settings.calf && calf) {
      calf.remove(); calf = null;
    }
  }
  function apply() {
    for (const c of cows()) { c.applyLook(); if (c.surf.type === 'ground') c.x = c.clampOn(GROUND, c.x); }
    syncCalf();
    applyVisibility();
    if (!world.settings.pies) { world.pies.forEach((p) => p.remove()); world.pies.length = 0; }
  }

  function persist() {
    const delta = { ...stats };
    for (const k in stats) stats[k] = 0;
    const any = Object.values(delta).some((v) => v > 0);
    try {
      if (mom && mom.surf.type === 'ground') chrome.storage.local.set({ cowX: mom.x / Math.max(1, vw() - mom.W) });
      if (any) {
        chrome.storage.local.get({ stats: {} }, ({ stats: saved }) => {
          const next = { ...saved };
          for (const k in delta) next[k] = (next[k] || 0) + delta[k];
          chrome.storage.local.set({ stats: next });
        });
      }
    } catch (_) {}
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _s, reply) => {
      if (msg.type === 'whoami') { reply({ host: location.hostname, hidden: hiddenHere() }); return; }
      if (!world.settings.enabled || hiddenHere()) { reply({ ok: false, reason: 'off' }); return; }
      if (msg.type === 'summon') {
        unlockAudio();
        if (mom.state === 'sleep') mom.wake();
        mom.food = null;
        if (!['drag', 'fall'].includes(mom.state)) {
          if (mom.surf.type === 'el') { mom.surf = GROUND; mom.startFall('coming!'); }
          else mom.walkTo(mom.clampOn(GROUND, vw() / 2 - mom.W / 2), 'trot');
        }
        setTimeout(() => mom.moo(`${world.settings.name || 'Moo'}! …moo.`), 700);
      } else if (msg.type === 'grass') {
        addGrass(rand(80, vw() - 80));
      }
      reply({ ok: true });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      let touched = false;
      for (const k of Object.keys(DEFAULTS)) if (changes[k]) { world.settings[k] = changes[k].newValue; touched = true; }
      if (touched) apply();
    });

    chrome.storage.sync.get(DEFAULTS, (s) => {
      world.settings = { ...DEFAULTS, ...s };
      chrome.storage.local.get({ cowX: null }, ({ cowX }) => start(cowX));
    });
  } catch (_) {
    start(null);
  }

  function start(cowX) {
    mom = new Cow(false);
    if (typeof cowX === 'number') mom.x = mom.clampOn(GROUND, cowX * (vw() - mom.W));
    mom.setState('idle', rand(800, 2500));
    (document.body || document.documentElement).appendChild(host);
    apply();
    requestAnimationFrame(tick);
  }
})();
