/* ==========================================================================
   KevOrb — animated orb for the KevBot button.
   Renders inside the existing 60px navy disc, so the disc is the sphere: no
   glass shell, no rim, no circle inside a circle. `rate` is the entire state
   API (1 idle, ~1.7 thinking, burst on send). Pauses when the tab is hidden or
   the button scrolls off; renders a single static frame under
   prefers-reduced-motion; returns null if canvas is unavailable so the caller
   can keep the original glyph.
   ========================================================================== */
window.KevOrb = (function(){
"use strict";
/* Built from the new site palette: madder is the reference's red, marigold its
   amber, lifted cobalt its blue, lifted fuchsia its magenta. Hues are kept in
   two opposed groups rather than a full spectral sweep, because additive
   blending averages opposites toward grey and at 60px two crossing ribbons
   overlap within ~2px. Warm and cool meeting at the crossing is what makes the
   white highlight; a full rainbow would just make mud. */
var PAL=[
  [0.00, 195, 56, 75],   // madder    #C3384B  the red
  [0.13, 226, 90, 84],   // madder lifted
  [0.25, 232,163, 23],   // marigold  #E8A317  the amber
  [0.34, 250,214,130],   // gold
  [0.42, 255,247,232],   // hot white  (the crossing)
  [0.52, 168,200,236],   // cool light
  [0.62,  75,111,165],   // cobalt lifted  #4B6FA5  the blue
  [0.71,  31, 75,143],   // cobalt    #1F4B8F
  [0.81, 179, 82,153],   // fuchsia lifted #B35299  the magenta
  [0.91, 195, 56, 75],   // back to madder
  [1.00, 195, 56, 75]
];
function pal(p){
  p=p-Math.floor(p);
  for(var i=1;i<PAL.length;i++){
    if(p<=PAL[i][0]){
      var a=PAL[i-1],b=PAL[i],u=(p-a[0])/(b[0]-a[0]);
      return [a[1]+(b[1]-a[1])*u, a[2]+(b[2]-a[2])*u, a[3]+(b[3]-a[3])*u];
    }
  }
  return [255,127,80];
}

var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Orb(host, opts){
  opts=opts||{};
  var detail=!!opts.detail;
  var cv=document.createElement('canvas');
  cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
  // canvas unavailable -> caller keeps the existing glyph
  var ctx=cv.getContext&&cv.getContext('2d');
  if(!ctx) return null;
  if(getComputedStyle(host).position==='static') host.style.position='relative';
  /* Detail mode gets the sphere back: a dark interior, a thin shell, and the
     prismatic rim. Small mode deliberately has none of it, because the navy FAB
     already IS the sphere and a second circle reads as a bug. */
  if(detail){
    var body=document.createElement('div');
    body.style.cssText='position:absolute;inset:0;border-radius:50%;background:'+
      'radial-gradient(circle at 50% 26%,rgba(44,48,58,.14) 0%,rgba(14,15,20,.10) 42%,rgba(0,0,0,.06) 75%,rgba(0,0,0,.04) 100%)';
    var shell=document.createElement('div');
    shell.style.cssText='position:absolute;inset:0;border-radius:50%;background:'+
      'radial-gradient(circle at 50% 50%,rgba(255,255,255,0) 84%,rgba(176,192,218,.10) 93%,rgba(214,228,246,.26) 98.5%,rgba(190,205,228,.14) 100%)';
    host.appendChild(body); host.appendChild(shell);
  }
  host.appendChild(cv);
  if(detail){
    var rim=document.createElement('div');
    rim.style.cssText='position:absolute;inset:0;border-radius:50%;pointer-events:none;'+
      'background:conic-gradient(from 190deg,rgba(228,150,140,.85),rgba(206,208,206,.40),'+
      'rgba(190,238,206,.70),rgba(178,214,232,.42),rgba(150,206,246,.88),rgba(198,200,226,.40),'+
      'rgba(186,158,232,.82),rgba(224,196,196,.42),rgba(236,178,150,.80),rgba(228,150,140,.85));'+
      '-webkit-mask:radial-gradient(closest-side,transparent 97.5%,#000 98.9%,#000 100%);'+
      'mask:radial-gradient(closest-side,transparent 97.5%,#000 98.9%,#000 100%);'+
      'filter:blur(.35px);opacity:.68';
    host.appendChild(rim);
  }

  var core=document.createElement('canvas'), kx=core.getContext('2d');
  var S=60,DPR=1,cx=30,cy=30,R=30;
  var T=16;

  function resize(){
    var r=host.getBoundingClientRect();
    S=Math.max(24,Math.round(r.width)||60);
    DPR=Math.min(2,window.devicePixelRatio||1);
    cv.width=core.width=Math.round(S*DPR);
    cv.height=core.height=Math.round(S*DPR);
    cx=S/2;cy=S/2;R=S/2;
  }

  /* Three ribbons, not four, and heavier: at 60px a fourth adds pixels that
     average into the others instead of reading as its own strand. */
  /* co values are pulled apart on purpose: previously all three sampled the
     same slice of a narrow ramp, so they rendered as one orange mass. Now
     ribbon 1 is warm, ribbon 2 is the hot core, ribbon 3 is cool, and the
     additive crossing between warm and cool is what makes white. th is well
     down from round 1 so the band stays thin and the interior reads near-black. */
  var RIB = detail ? [
    {amp:.092,th:.088,fq:0.90,n: 2,ph:0.00,cs:.16,co:.00,cn:1,af:.42,ae:0.95,yo:-.030,an:1,ap:0.0},
    {amp:.078,th:.070,fq:0.90,n:-2,ph:3.14,cs:.12,co:.34,cn:1,af:.40,ae:1.00,yo: .012,an:1,ap:1.6},
    {amp:.066,th:.062,fq:1.05,n: 3,ph:1.70,cs:.16,co:.56,cn:1,af:.34,ae:0.82,yo:-.004,an:2,ap:2.4},
    {amp:.050,th:.048,fq:0.75,n:-1,ph:4.70,cs:.12,co:.88,cn:1,af:.26,ae:0.62,yo: .022,an:2,ap:0.7}
  ] : [
    {amp:.108,th:.108,fq:0.90,n: 2,ph:0.00,cs:.14,co:.02,cn:1,af:.54,ae:1.00,yo:-.026,an:1,ap:0.0},
    {amp:.092,th:.086,fq:0.90,n:-2,ph:3.14,cs:.10,co:.36,cn:1,af:.50,ae:1.00,yo: .014,an:1,ap:1.6},
    {amp:.074,th:.072,fq:1.05,n: 3,ph:1.70,cs:.14,co:.58,cn:1,af:.42,ae:0.86,yo:-.002,an:2,ap:2.4}
  ];
  var NSEG = detail?170:96, NSTOP = detail?18:10;

  function grad(rb,wt,alpha,gamma){
    var W=S*(detail?.86:.80),x0=(S-W)/2;
    var g=kx.createLinearGradient(x0,0,x0+W,0);
    var co=rb.co+rb.cn*(wt/(2*Math.PI));
    for(var i=0;i<=NSTOP;i++){
      var p=i/NSTOP, c=pal(co+p*rb.cs);
      var fade=Math.pow(Math.sin(Math.PI*p),gamma);
      g.addColorStop(p,'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+(alpha*fade).toFixed(4)+')');
    }
    return g;
  }

  function drawRibbon(rb,wt,bob){
    var W=S*(detail?.86:.80),x0=(S-W)/2;
    var phase=rb.ph+rb.n*wt;
    var amp=S*rb.amp*(0.58+0.42*Math.sin(rb.ap+rb.an*wt));
    var th =S*rb.th *(0.66+0.34*Math.sin(rb.ap+1.0+rb.an*wt));
    var tx=[],ty=[],ee=[];
    for(var i=0;i<=NSEG;i++){
      var u=i/NSEG, x=x0+u*W, q=2*u-1;
      // the taper: ribbons vanish to points instead of hitting the edge
      // higher exponent pulls the envelope in faster, so the strands end in
      // points with dark shoulders either side, as in the reference
      var e=Math.pow(Math.max(0,1-q*q),1.15);
      ty.push(cy+S*rb.yo+bob+amp*e*Math.sin(2*Math.PI*rb.fq*u+phase));
      tx.push(x); ee.push(e);
    }
    var LAY=[[1.00,.24],[0.70,.25],[0.44,.25],[0.22,.24]];
    for(var L=0;L<LAY.length;L++){
      var f=LAY[L][0];
      kx.beginPath(); kx.moveTo(tx[0],ty[0]);
      for(var i=1;i<=NSEG;i++)kx.lineTo(tx[i],ty[i]);
      for(var i=NSEG;i>=0;i--)kx.lineTo(tx[i],ty[i]+th*ee[i]*f);
      kx.closePath();
      kx.fillStyle=grad(rb,wt,rb.af*LAY[L][1],1.35);
      kx.fill();
    }
    kx.lineJoin='round';kx.lineCap='round';
    kx.beginPath(); kx.moveTo(tx[0],ty[0]+th*.18);
    for(var i=1;i<=NSEG;i++)kx.lineTo(tx[i],ty[i]+th*.18);
    kx.lineWidth=Math.max(2,th*.55);
    kx.strokeStyle=grad(rb,wt,rb.ae*.22,1.05); kx.stroke();

    kx.beginPath(); kx.moveTo(tx[0],ty[0]);
    for(var i=1;i<=NSEG;i++)kx.lineTo(tx[i],ty[i]);
    kx.lineWidth=Math.max(detail?1.2:1.6, S*(detail?.0072:.014));
    kx.strokeStyle=grad(rb,wt,rb.ae*.70,1.00); kx.stroke();

    kx.beginPath(); kx.moveTo(tx[0],ty[0]);
    for(var i=1;i<=NSEG;i++)kx.lineTo(tx[i],ty[i]);
    kx.lineWidth=Math.max(.9,S*(detail?.0024:.006));
    kx.strokeStyle=grad(rb,wt,rb.ae*.60,0.85); kx.stroke();
  }

  function render(t){
    var wt=2*Math.PI*(t%T)/T;
    var bob=S*0.012*Math.sin(wt)+S*0.006*Math.sin(2*wt+1.1);

    kx.setTransform(DPR,0,0,DPR,0,0);
    kx.globalCompositeOperation='source-over';
    kx.clearRect(0,0,S,S);
    kx.globalCompositeOperation='lighter';
    for(var i=0;i<RIB.length;i++)drawRibbon(RIB[i],wt,bob);

    // feather so light never touches the disc edge
    kx.globalCompositeOperation='destination-in';
    var m=kx.createRadialGradient(cx,cy,R*(detail?.55:.38),cx,cy,R*(detail?.96:.92));
    m.addColorStop(0,'rgba(0,0,0,1)');
    m.addColorStop(detail?.93:.80,'rgba(0,0,0,1)');
    m.addColorStop(1,'rgba(0,0,0,0)');
    kx.fillStyle=m; kx.fillRect(0,0,S,S);

    var W=cv.width;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalCompositeOperation='source-over';
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.globalCompositeOperation='lighter';
    if(detail){
      ctx.filter='blur('+(W*.115)+'px)';ctx.globalAlpha=.72;ctx.drawImage(core,0,0);
      ctx.filter='blur('+(W*.048)+'px)';ctx.globalAlpha=.60;ctx.drawImage(core,0,0);
      ctx.filter='blur('+(W*.018)+'px)';ctx.globalAlpha=.55;ctx.drawImage(core,0,0);
      ctx.filter='blur('+(W*.005)+'px)';ctx.globalAlpha=.60;ctx.drawImage(core,0,0);
    }else{
      // 3 passes is plenty at this size
      ctx.filter='blur('+(W*.105)+'px)';ctx.globalAlpha=.80;ctx.drawImage(core,0,0);
      ctx.filter='blur('+(W*.038)+'px)';ctx.globalAlpha=.66;ctx.drawImage(core,0,0);
    }
    ctx.filter='none';ctx.globalAlpha=1;ctx.drawImage(core,0,0);
  }

  var clock=0, rate=1, last=0, raf=0, running=false, visible=true;
  // NOTE: an IntersectionObserver below will correct `visible` on first tick.
  function frame(now){
    var dt=last?Math.min((now-last)/1000,.05):0; last=now;
    clock+=dt*rate;
    rate+=(1-rate)*0.045;
    render(clock);
    raf=requestAnimationFrame(frame);
  }
  function start(){ if(running||REDUCED)return; running=true; last=0; raf=requestAnimationFrame(frame); }
  function stop(){ running=false; if(raf)cancelAnimationFrame(raf); raf=0; }

  resize();
  render(0);                       // a resting frame is painted before any loop
  if(REDUCED){ /* one static frame, deliberately no loop */ }
  else start();

  window.addEventListener('resize',function(){resize();render(clock);});
  /* Fires when the host first gains a box (e.g. its panel opens), which is the
     only signal that the initial 0-width measurement is now stale. */
  if('ResizeObserver' in window){
    var lastS=0;
    new ResizeObserver(function(){
      var w=Math.round(host.getBoundingClientRect().width);
      if(w>0 && w!==lastS){ lastS=w; resize(); render(clock);
        if(!document.hidden && visible) start(); }
    }).observe(host);
  }
  document.addEventListener('visibilitychange',function(){
    if(document.hidden) stop(); else if(visible) start();
  });
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      es.forEach(function(e){ visible=e.isIntersecting;
        if(visible && !document.hidden) start(); else stop(); });
    },{threshold:.01}).observe(host);
  }

  var api={
    burst:function(x){ rate=x||3.4; if(!running&&!REDUCED)start(); },
    setRate:function(x){ rate=x; if(!running&&!REDUCED)start(); },
    /* Call when the host becomes visible. An orb built inside a display:none
       container measured 0 and fell back to the 60px default, and the
       IntersectionObserver had paused it; this re-measures and restarts. */
    resume:function(){ visible=true; resize(); render(clock); if(!document.hidden) start(); },
    destroy:function(){ stop(); cv.remove(); }
  };
  host.__orb=api;
  return api;
}


return { create: function(host, opts){ return Orb(host, opts); } };
})();

// KevBot Chat Widget
// Add this script to your page and call KevBot.init('YOUR_WORKER_URL')

(function() {
  'use strict';

  const KevBot = {
    workerUrl: null,
    isOpen: false,
    history: [],

    init: function(workerUrl) {
      this.workerUrl = workerUrl;
      this.injectStyles();
      this.createWidget();
      this.bindEvents();
    },

    injectStyles: function() {
      const styles = `
        /* ================================================================
           KevBot, restyled to the new site's design language.
           One token block, one dark block. The previous build had two
           competing prefers-color-scheme blocks and 15 hardcoded literals,
           which is why it could not follow a theme.
           ================================================================ */
        .kevbot-fab, .kevbot-panel {
          --kb-bg:#F4F4F5; --kb-surface:#FFFFFF; --kb-raised:#E9E9EC;
          --kb-ink:#111113; --kb-ink2:#5B5B62; --kb-rule:#D8D8DD;
          --kb-invert:#111113; --kb-on-invert:#F2F2F4;
          --kb-marigold:#E8A317; --kb-on-mari:#241700;
          --kb-cobalt:#1F4B8F; --kb-on-hue:#FFFFFF;
          --kb-accent:#AB3142;
          /* The orb blends additively, so its disc stays dark in BOTH modes.
             Deliberately NOT --kb-invert, which flips. */
          --kb-orb-disc:#111113; --kb-on-orb-disc:#F2F2F4;
          /* Rim and halo. The rim is measured against the DISC, not the page,
             which is why one value covers every case: the FAB on a light page,
             the FAB on a dark page, and the avatar on the header, which does
             invert. Before this the FAB sat at 1.01 against the dark page and
             the avatar at 1.00 against the light-mode header. */
          --kb-orb-rim:rgba(198,210,228,.55);
          --kb-glow-warm:rgba(232,163,23,.20);
          --kb-glow-cool:rgba(75,111,165,.24);
          --kb-glow-r:26px;
          --kb-orb-lift:0 6px 18px rgba(0,0,0,.20);
          --kb-r:10px;
          --kb-sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
          --kb-mono:"SF Mono",Menlo,ui-monospace,Consolas,monospace;
        }
        @media (prefers-color-scheme: dark) {
          .kevbot-fab, .kevbot-panel {
            --kb-bg:#0F0F12; --kb-surface:#17171B; --kb-raised:#22222A;
            --kb-ink:#F2F2F4; --kb-ink2:#A2A2AC; --kb-rule:#2C2C33;
            --kb-invert:#EDEDF0; --kb-on-invert:#111113;
            --kb-accent:#D26978;
            --kb-cobalt:#4B6FA5;
            /* Brighter rim, hotter halo, wider throw: on a #0F0F12 page the
               disc is the same value as the background, so the rim and glow
               are the only things drawing the orb's edge. */
            --kb-orb-rim:rgba(214,226,244,.72);
            --kb-glow-warm:rgba(232,163,23,.30);
            --kb-glow-cool:rgba(90,132,196,.34);
            --kb-glow-r:34px;
            --kb-orb-lift:0 6px 20px rgba(0,0,0,.55);
          }
        }

        /* ---- the button ---- */
        .kevbot-fab {
          position: fixed; bottom: 24px; right: 24px;
          width: 60px; height: 60px; border-radius: 50%;
          background: var(--kb-orb-disc);
          border: none; cursor: pointer; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          /* Ring, then lift, then a two-tone halo: warm off one shoulder and
             cool off the other, so it reads as spectral no matter which hue
             the canvas happens to be on. Same idea as the bloom the orb
             composites internally, done in one paint. box-shadow is not
             clipped by this element's own overflow:hidden. */
          box-shadow:
            0 0 0 1.5px var(--kb-orb-rim),
            var(--kb-orb-lift),
            -7px -5px var(--kb-glow-r) 2px var(--kb-glow-warm),
             7px  5px var(--kb-glow-r) 2px var(--kb-glow-cool);
          transition: transform .2s ease, box-shadow .45s ease;
        }
        .kevbot-fab:hover { transform: translateY(-2px); }
        /* Working state. Same four layers so the shadow interpolates instead
           of snapping; the halo swells while the orb spins faster. */
        .kevbot-fab.kb-hot {
          box-shadow:
            0 0 0 1.5px var(--kb-orb-rim),
            var(--kb-orb-lift),
            -9px -6px calc(var(--kb-glow-r) * 1.75) 5px var(--kb-glow-warm),
             9px  6px calc(var(--kb-glow-r) * 1.75) 5px var(--kb-glow-cool);
        }
        /* Open = the orb is hidden behind the close icon, so drop the halo but
           keep the layer count for a clean transition. */
        .kevbot-fab.open {
          box-shadow:
            0 0 0 1.5px var(--kb-orb-rim),
            var(--kb-orb-lift),
            0 0 0 0 transparent,
            0 0 0 0 transparent;
        }
        /* was --kb-marigold, which is 1.97 against the light page: a focus
           indicator you cannot see. --kb-ink flips with the theme. */
        .kevbot-fab:focus-visible { outline: 3px solid var(--kb-ink); outline-offset: 3px; }
        /* the disc never inverts, so its glyph never needs to either: one rule,
           no dark-mode override. */
        .kevbot-fab svg { width: 26px; height: 26px; fill: var(--kb-on-orb-disc); position: relative; z-index: 1; }
        .kevbot-orb { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; }
        .kevbot-fab .kevbot-orb canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .kevbot-fab.open .kevbot-orb { display: none; }
        .kevbot-fab.open svg.chat-icon { display: none; }
        .kevbot-fab:not(.open) svg.close-icon { display: none; }

        /* ---- the chat box ---- */
        .kevbot-panel {
          position: fixed; bottom: 96px; right: 24px;
          width: 380px; max-width: calc(100vw - 48px); height: 500px;
          background: var(--kb-bg);
          border: 2px solid var(--kb-ink);
          border-radius: var(--kb-r);
          font-family: var(--kb-sans);
          display: none; flex-direction: column; overflow: hidden;
          z-index: 9998;
        }
        .kevbot-panel.open { display: flex; animation: kevbot-slide-up .22s ease backwards; }

        /* header: the invert panel, same device the site uses for contrast blocks */
        .kevbot-header {
          background: var(--kb-invert); color: var(--kb-on-invert);
          padding: 16px 18px; display: flex; align-items: center; gap: 14px;
          flex: none;
        }
        /* the header mark is the same object as the button, smaller: a dark disc
           with the orb inside. Circle, not a squircle, so it reads as the same
           thing. Always dark for the same reason the FAB is. */
        /* 72px, not 34: at avatar size the orb read as a glowing dot. This is
           the size where the braided strands and the glass rim are actually
           legible, which is the whole point of putting it here. */
        .kevbot-avatar {
          width: 72px; height: 72px; border-radius: 50%; flex: none;
          background: var(--kb-orb-disc); color: var(--kb-on-orb-disc);
          display: grid; place-items: center; font-size: 28px;
          position: relative; overflow: hidden;
          box-shadow:
            0 0 0 1.5px var(--kb-orb-rim),
            -6px -4px var(--kb-glow-r) 1px var(--kb-glow-warm),
             6px  4px var(--kb-glow-r) 1px var(--kb-glow-cool);
          transition: box-shadow .45s ease;
        }
        .kevbot-avatar.kb-hot {
          box-shadow:
            0 0 0 1.5px var(--kb-orb-rim),
            -8px -5px calc(var(--kb-glow-r) * 1.75) 4px var(--kb-glow-warm),
             8px  5px calc(var(--kb-glow-r) * 1.75) 4px var(--kb-glow-cool);
        }
        .kevbot-avatar canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .kevbot-title {
          font-size: 19px; font-weight: 800; letter-spacing: -.026em; line-height: 1.08;
        }
        .kevbot-subtitle {
          font-family: var(--kb-mono); font-size: 10px; letter-spacing: .14em;
          text-transform: uppercase; margin-top: 5px; opacity: .78;
        }

        /* messages */
        .kevbot-messages {
          flex: 1; overflow-y: auto; padding: 16px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .kevbot-msg {
          max-width: 84%; padding: 10px 13px; border-radius: var(--kb-r);
          font-size: 13.5px; line-height: 1.55; word-wrap: break-word;
        }
        .kevbot-msg.bot {
          background: var(--kb-raised); color: var(--kb-ink);
          align-self: flex-start; border: 1px solid var(--kb-rule);
        }
        /* cobalt for "you", so marigold stays reserved for actions */
        .kevbot-msg.user {
          background: var(--kb-cobalt); color: var(--kb-on-hue);
          align-self: flex-end; font-weight: 600;
        }
        .kevbot-msg.bot a { color: var(--kb-accent); font-weight: 600;
          text-decoration: underline; text-underline-offset: 2px;
          text-decoration-color: var(--kb-marigold); text-decoration-thickness: 2px; }
        .kevbot-msg.bot a:hover { text-decoration-color: var(--kb-accent); }

        .kevbot-msg.typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
        .kevbot-msg.typing span {
          display: inline-block; width: 6px; height: 6px; border-radius: 50%;
          background: var(--kb-accent);
          animation: kevbot-bounce 1.4s infinite ease-in-out both;
        }
        .kevbot-msg.typing span:nth-child(1) { animation-delay: -.32s; }
        .kevbot-msg.typing span:nth-child(2) { animation-delay: -.16s; }

        /* suggestion chips: the site's outline-chip treatment */
        .kevbot-prompts { display: flex; flex-wrap: wrap; gap: 6px; }
        .kevbot-prompt {
          font-family: var(--kb-sans); font-size: 12px; font-weight: 600;
          padding: 6px 11px; border-radius: 99px; cursor: pointer;
          background: none; border: 1.5px solid var(--kb-ink); color: var(--kb-ink);
          transition: background .16s, color .16s;
        }
        .kevbot-prompt:hover { background: var(--kb-ink); color: var(--kb-bg); }
        .kevbot-prompt:focus-visible { outline: 3px solid var(--kb-marigold); outline-offset: 2px; }

        /* input row */
        .kevbot-input-area {
          flex: none; padding: 12px; display: flex; gap: 8px; align-items: center;
          border-top: 1px solid var(--kb-rule); background: var(--kb-bg);
        }
        .kevbot-input {
          flex: 1; padding: 10px 12px; border-radius: var(--kb-r);
          border: 1px solid var(--kb-rule); background: var(--kb-surface);
          color: var(--kb-ink); font-family: var(--kb-sans); font-size: 13.5px;
          outline: none;
        }
        .kevbot-input::placeholder { color: var(--kb-ink2); }
        .kevbot-input:focus { border-color: var(--kb-marigold); box-shadow: 0 0 0 2px var(--kb-marigold); }
        .kevbot-send {
          width: 40px; height: 40px; flex: none; border: none;
          border-radius: var(--kb-r); cursor: pointer;
          background: var(--kb-marigold); color: var(--kb-on-mari);
          display: grid; place-items: center;
          transition: transform .16s;
        }
        .kevbot-send:hover:not(:disabled) { transform: translateY(-2px); }
        .kevbot-send:disabled { background: var(--kb-raised); color: var(--kb-ink2); cursor: not-allowed; }
        .kevbot-send:focus-visible { outline: 3px solid var(--kb-ink); outline-offset: 2px; }
        .kevbot-send svg { width: 18px; height: 18px; fill: currentColor; }

        @keyframes kevbot-slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes kevbot-bounce {
          0%, 80%, 100% { transform: scale(.7); opacity: .55; }
          40%           { transform: scale(1);  opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kevbot-panel.open { animation: none; }
          .kevbot-msg.typing span { animation: none; }
          .kevbot-fab:hover, .kevbot-send:hover:not(:disabled) { transform: none; }
        }
        /* pre-existing product decision: no KevBot below 768px */
        @media (max-width: 768px) {
          .kevbot-fab, .kevbot-panel { display: none !important; }
        }
      `;
      const styleEl = document.createElement('style');
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    },

    createWidget: function() {
      // Floating action button
      const fab = document.createElement('button');
      fab.className = 'kevbot-fab';
      fab.setAttribute('aria-label', 'Chat with KevBot');
      fab.innerHTML = `
        <span class="kevbot-orb"></span>
        <svg class="close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      `;
      this.fab = fab;

      // Orb, or the original glyph if canvas is unavailable.
      var orbHost = fab.querySelector('.kevbot-orb');
      this.orb = KevOrb.create(orbHost);
      if (!this.orb) {
        orbHost.outerHTML = '<svg class="chat-icon" viewBox="0 0 24 24">'
          + '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>';
      }

      // Chat panel
      const panel = document.createElement('div');
      panel.className = 'kevbot-panel';
      panel.innerHTML = `
        <div class="kevbot-header">
          <div class="kevbot-avatar"></div>
          <div>
            <div class="kevbot-title">KevBot</div>
            <div class="kevbot-subtitle">Ask me about Kevin!</div>
          </div>
        </div>
        <div class="kevbot-messages"></div>
        <div class="kevbot-input-area">
          <input type="text" class="kevbot-input" placeholder="Ask me about Kevin..." maxlength="500">
          <button class="kevbot-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      `;
      this.panel = panel;

      // Header mark: the same orb, smaller. Falls back to the emoji.
      var avatar = panel.querySelector('.kevbot-avatar');
      this.avatarEl = avatar;
      // detail mode: shell + rim restored, per the handoff's panel-orb note
      this.orbAvatar = KevOrb.create(avatar, { detail: true });
      if (!this.orbAvatar) { avatar.textContent = '\u{1F916}'; }
      this.messagesEl = panel.querySelector('.kevbot-messages');
      this.inputEl = panel.querySelector('.kevbot-input');
      this.sendBtn = panel.querySelector('.kevbot-send');

      document.body.appendChild(fab);
      document.body.appendChild(panel);

      // Initial greeting with suggested prompts
      this.addMessage('bot', "Hey! I'm KevBot 🤖 Ask me anything about Kevin: his experience, skills, projects, or how to get in touch!");
      this.addSuggestedPrompts();
    },

    addSuggestedPrompts: function() {
      const prompts = document.createElement('div');
      prompts.className = 'kevbot-prompts';
      prompts.innerHTML = `
        <button class="kevbot-prompt" data-prompt="What does Kevin do?">What does Kevin do?</button>
        <button class="kevbot-prompt" data-action="contact">Contact info</button>
      `;
      this.messagesEl.appendChild(prompts);
      this.promptsEl = prompts;

      // Bind prompt clicks
      prompts.querySelectorAll('.kevbot-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const promptText = btn.dataset.prompt;

          // Hide prompts after click
          prompts.style.display = 'none';

          if (action === 'contact') {
            if (window.plausible) window.plausible('KevBot Prompt Contact');
            // Scroll to connect section
            const connectEl = document.querySelector('#connect');
            if (connectEl) {
              connectEl.scrollIntoView({ behavior: 'smooth' });
            }
            // Close KevBot
            this.toggle();
          } else if (promptText) {
            if (window.plausible) window.plausible('KevBot Prompt WhatDoesKevinDo');
            this.inputEl.value = promptText;
            this.send();
          }
        });
      });
    },

    addFollowUpPrompts: function() {
      // Remove any existing follow-up prompts
      const existing = this.messagesEl.querySelector('.kevbot-followups');
      if (existing) existing.remove();

      const followUps = [
        "Tell me about his experience",
        "What are his skills?",
        "How can I contact him?"
      ];

      const container = document.createElement('div');
      container.className = 'kevbot-prompts kevbot-followups';
      followUps.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'kevbot-prompt';
        btn.textContent = text;
        btn.addEventListener('click', () => {
          if (window.plausible) window.plausible('KevBot FollowUp Clicked');
          this.inputEl.value = text;
          this.send();
        });
        container.appendChild(btn);
      });

      this.messagesEl.appendChild(container);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    },

    bindEvents: function() {
      this.fab.addEventListener('click', () => this.toggle());
      this.sendBtn.addEventListener('click', () => this.send());
      this.inputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.send();
      });
    },

    setOrbRate: function(r) {
      if (this.orb) this.orb.setRate(r);
      if (this.orbAvatar) this.orbAvatar.setRate(r);
      // The halo tracks the same single piece of state the motion does:
      // rate above resting means KevBot is working.
      var hot = r > 1.3;
      if (this.fab) this.fab.classList.toggle('kb-hot', hot);
      if (this.avatarEl) this.avatarEl.classList.toggle('kb-hot', hot);
    },

    burstOrbs: function() {
      if (this.orb) this.orb.burst();
      if (this.orbAvatar) this.orbAvatar.burst();
    },

    toggle: function() {
      this.isOpen = !this.isOpen;
      this.fab.classList.toggle('open', this.isOpen);
      this.setOrbRate(1);
      // the panel just gained layout, so the header orb can size itself now
      if (this.isOpen && this.orbAvatar) this.orbAvatar.resume();
      if (!this.isOpen && this.orb) this.orb.resume();
      this.panel.classList.toggle('open', this.isOpen);
      if (this.isOpen) {
        this.inputEl.focus();
        if (window.plausible) window.plausible('KevBot Open');
      } else {
        if (window.plausible) window.plausible('KevBot Close');
      }
    },

    formatMessage: function(text) {
      // Basic markdown: **bold**, [link](url), and line breaks
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br>');
      return html;
    },

    addMessage: function(type, text) {
      const msg = document.createElement('div');
      msg.className = `kevbot-msg ${type}`;
      if (type === 'bot') {
        msg.innerHTML = this.formatMessage(text);
      } else {
        msg.textContent = text;
      }
      this.messagesEl.appendChild(msg);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      return msg;
    },

    showTyping: function() {
      const typing = document.createElement('div');
      typing.className = 'kevbot-msg typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      this.messagesEl.appendChild(typing);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      return typing;
    },

    classifyMessage: function(text) {
      const lower = text.toLowerCase();
      const categories = [
        { topic: 'contact',    keywords: ['hire', 'hiring', 'contact', 'email', 'calendly', 'reach out', 'get in touch', 'talk to', 'opportunity', 'opportunities'] },
        { topic: 'projects',   keywords: ['quietfeed', 'visionbort', 'kevinos', 'kevbot', 'side project', 'build with claude'] },
        { topic: 'experience', keywords: ['experience', 'background', 'career', 'company', 'companies', 'role', 'roles', 'job', 'worked', 'gridstrong', 'grid strong', 'hvac', 'lever', 'sendoso', 'rocket lawyer', 'oracle', 'hurd'] },
        { topic: 'skills',     keywords: ['skill', 'tools', 'technical', 'sql', 'figma', 'jira', 'mixpanel', 'amplitude', 'fullstory', 'api', 'system design', 'integration', 'a/b'] },
        { topic: 'personal',   keywords: ['cat', 'cats', 'cook', 'cooking', 'recipe', 'recipes', 'virginia tech', 'hobby', 'hobbies', 'nyc', 'new york'] },
      ];
      let topic = 'misc';
      for (const cat of categories) {
        if (cat.keywords.some(kw => lower.includes(kw))) {
          topic = cat.topic;
          break;
        }
      }
      let length_bucket;
      if (text.length <= 50) length_bucket = 'short';
      else if (text.length <= 200) length_bucket = 'medium';
      else length_bucket = 'long';
      return { topic, length_bucket };
    },

    async send() {
      const text = this.inputEl.value.trim();
      if (!text) return;

      this.inputEl.value = '';
      this.inputEl.disabled = true;
      this.sendBtn.disabled = true;

      // Remove follow-up prompts
      const followups = this.messagesEl.querySelector('.kevbot-followups');
      if (followups) followups.remove();

      this.addMessage('user', text);
      if (window.plausible) {
        const meta = this.classifyMessage(text);
        window.plausible('KevBot Message Sent', { props: meta });
      }
      this.burstOrbs();                        // the send itself pulses
      const typing = this.showTyping();
      this.setOrbRate(1.7);                    // then hold at 'thinking'

      try {
        const response = await fetch(this.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: this.history
          }),
        });

        const data = await response.json();
        typing.remove();
        this.setOrbRate(1);

        if (data.error) {
          this.addMessage('bot', "Oops, something went wrong. Try again?");
          if (window.plausible) window.plausible('KevBot Error');
        } else {
          this.addMessage('bot', data.reply);
          // Update history for context
          this.history.push({ role: 'user', content: text });
          this.history.push({ role: 'assistant', content: data.reply });
          // Keep history reasonable
          if (this.history.length > 20) {
            this.history = this.history.slice(-20);
          }
          // Show follow-up prompts
          this.addFollowUpPrompts();
        }
      } catch (error) {
        typing.remove();
        this.setOrbRate(1);
        this.addMessage('bot', "Couldn't connect. Check your internet and try again!");
        if (window.plausible) window.plausible('KevBot Error');
      }

      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.inputEl.focus();
    }
  };

  // Expose globally
  window.KevBot = KevBot;
})();
