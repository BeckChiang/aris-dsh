window.__ModuleLoader__.load({
  id: '@local/dsh-aris',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-aris';
    const HEAD = { 'x-dsh-aris': '1' };
    const POST_HEAD = { 'x-dsh-aris': '1', 'content-type': 'application/json' };

    const CSS = `/* 沿用官方设置页的排版语言：中性表面、细描边、行式布局；颜色只做状态点缀。
   中性色统一用 rgba(127,127,127,α)，深浅主题下自动成立，不依赖具体底色令牌。 */
/* 主区宿主只给一个 overflow:hidden 的定高列，不提供滚动容器：把卡片的上两级父元素
   拉成定高弹性列，滚动交给卡片自己，否则超出一屏的内容直接被裁掉、没法上下翻。
   宽度必须由容器决定：宿主的列若带 align-items:center/flex-start，子项会退化成
   fit-content，卡片就会随内容忽宽忽窄——所以这里显式 stretch + width:100%。 */
div:not(.daris):has(> .daris){display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;min-width:0;width:100%;min-height:0;height:100%}
div:not(.daris):has(> div > .daris){display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;min-width:0;width:100%;min-height:0;height:100%}
.daris{padding:20px 20px 40px;margin:0;display:flex;flex-direction:column;flex:1 1 auto;align-self:stretch;width:100%;min-width:0;min-height:0;height:100%;max-height:100%;overflow-y:auto;box-sizing:border-box;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.22));border-radius:16px;box-shadow:0 2px 14px rgba(0,0,0,.06)}
.daris h2{margin:0 0 2px;font-size:16px;font-weight:600;letter-spacing:.01em}
.daris h3{margin:0;font-size:14px;font-weight:600}
.daris-sub{margin:0;font-size:12.5px;opacity:.65}
.daris-path{font-size:11.5px;opacity:.55;word-break:break-all}
.daris-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}

.daris-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:0 4px 14px;border-bottom:1px solid rgba(127,127,127,.18)}
.daris-head>div:first-child{flex:1 1 auto;min-width:220px}
.daris-bal{display:inline-flex;align-items:baseline;gap:8px;padding:4px 10px;border-radius:8px;border:1px solid rgba(127,127,127,.25);font-size:12px}
.daris-bal-v{font-size:14px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.daris-bal-n{font-size:11px;opacity:.6}
.daris-bal.warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b25e09) 45%,transparent)}
.daris-bal.warn .daris-bal-v{color:var(--dsw-alias-state-warn-primary,#b25e09)}
.daris-bal.halt{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 45%,transparent)}
.daris-bal.halt .daris-bal-v{color:var(--dsw-alias-state-error-primary,#b42318)}

.daris-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:14px 4px 6px}
.daris-tab{cursor:pointer;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit;font-size:12.5px;line-height:20px;padding:4px 14px}
.daris-tab:hover{border-color:rgba(127,127,127,.6)}
.daris-tab.on{border-color:rgba(127,127,127,.7);background:rgba(127,127,127,.14);font-weight:600}

.daris-sec{padding:16px 4px 4px}
.daris-sec-t{display:flex;align-items:center;gap:10px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:var(--dsw-alias-label-primary,inherit);margin-bottom:8px}
.daris-sec-t::after{content:'';flex:1;height:1px;background:rgba(127,127,127,.18)}
.daris-blocks{display:flex;flex-direction:column;gap:10px}

.daris-pipe{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.07));box-shadow:0 1px 2px rgba(0,0,0,.04);overflow:hidden}
.daris-pipe>.daris-sum{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;cursor:pointer;list-style:none;user-select:none;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.04))}
.daris-pipe>.daris-sum:hover{background:var(--dsw-alias-bg-overlay,rgba(127,127,127,.08))}
.daris-pipe>.daris-sum::-webkit-details-marker{display:none}
.daris-pipe>.daris-sum::before{content:'▸';font-size:10px;opacity:.5;transition:transform .15s}
.daris-pipe[open]>.daris-sum::before{transform:rotate(90deg)}
.daris-pipe.st-run{border-left:3px solid var(--dsw-alias-state-success-primary,#18794e)}
.daris-pipe.st-review{border-left:3px solid var(--dsw-alias-brand-primary,#2563eb)}
.daris-pipe.st-human,.daris-pipe.st-error{border-left:3px solid var(--dsw-alias-state-error-primary,#b42318)}
.daris-pipe.st-idle{border-left:3px solid var(--dsw-alias-state-idle-primary,rgba(127,127,127,.55))}
.daris-pipe.st-stop{border-left:3px solid rgba(127,127,127,.5)}
.daris-pipe.st-stopping{border-left:3px solid var(--dsw-alias-state-warning-primary,#b45309)}
.st-stopping .daris-sum-state{color:var(--dsw-alias-state-warning-primary,#b45309);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b45309) 14%,transparent)}
.st-stopping .daris-sum-state::before{background:var(--dsw-alias-state-warning-primary,#b45309)}
.st-stop .daris-sum-state{color:var(--dsw-alias-label-secondary,inherit);opacity:.9}
.st-stop .daris-sum-state::before{background:transparent;border:1px solid rgba(127,127,127,.65);box-sizing:border-box}
.daris-sum-state{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;white-space:nowrap;padding:1px 8px 1px 7px;border-radius:999px;background:rgba(127,127,127,.1)}
.daris-sum-state::before{content:'';width:7px;height:7px;border-radius:50%;background:rgba(127,127,127,.6)}
.st-run .daris-sum-state{color:var(--dsw-alias-state-success-primary,#18794e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 14%,transparent)}
.st-run .daris-sum-state::before{background:var(--dsw-alias-state-success-primary,#18794e);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 22%,transparent)}
.st-review .daris-sum-state{color:var(--dsw-alias-brand-primary,#2563eb);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 14%,transparent)}
.st-review .daris-sum-state::before{background:var(--dsw-alias-brand-primary,#2563eb)}
.st-human .daris-sum-state,.st-error .daris-sum-state{color:var(--dsw-alias-state-error-primary,#b42318);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 14%,transparent)}
.st-human .daris-sum-state::before,.st-error .daris-sum-state::before{background:var(--dsw-alias-state-error-primary,#b42318)}
.st-idle .daris-sum-state{color:var(--dsw-alias-label-secondary,inherit)}
.st-idle .daris-sum-state::before{background:var(--dsw-alias-state-idle-primary,rgba(127,127,127,.6))}
.daris-sum-name{font-size:14px;font-weight:700;letter-spacing:.01em}
.daris-sum-cost{font-size:11.5px;color:var(--dsw-alias-label-secondary,inherit);font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}
.daris-when{font-size:11.5px;padding:1px 7px;border-radius:6px;border:1px dashed rgba(127,127,127,.45);opacity:.8}
.daris-body{padding:2px 12px 12px}
.daris-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:820px){.daris-grid2{grid-template-columns:1fr}}

.daris-block{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.22));border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.05));margin-bottom:10px;overflow:hidden}
.daris-block-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.04))}
.daris-block-t{font-size:12px;font-weight:700;letter-spacing:.03em;color:var(--dsw-alias-label-primary,inherit)}
.daris-block-x{font-size:11.5px;color:var(--dsw-alias-label-secondary,inherit);opacity:.8}
.daris-block-b{padding:10px 11px}
.daris-block.human{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 6%,transparent)}
.daris-block.human .daris-block-t{color:var(--dsw-alias-state-error-primary,#b42318);opacity:1}

.daris-row,.daris-kv{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0}
.daris-k{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit);opacity:.85;min-width:76px}
.daris-v{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.daris-facts{display:flex;gap:28px;flex-wrap:wrap}
.daris-fact{display:flex;flex-direction:column;gap:1px}
.daris-fact>.daris-k{min-width:0}
.daris-fact>.daris-v{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:700}

.daris-now{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.6}
.daris-dot{width:7px;height:7px;border-radius:50%;background:rgba(127,127,127,.5);margin-top:6px;flex:0 0 auto}
.daris-dot.live{background:var(--dsw-alias-brand-primary,#2563eb)}
.daris-pct{font-size:23px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.daris-bar{height:4px;border-radius:999px;background:rgba(127,127,127,.22);overflow:hidden;margin-top:6px}
.daris-bar-fill{height:100%;background:var(--dsw-alias-brand-primary,#2563eb)}
.daris-flag{font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 45%,transparent);color:var(--dsw-alias-state-error-primary,#b42318);white-space:nowrap}
.daris-flag.warn{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b25e09) 45%,transparent);color:var(--dsw-alias-state-warn-primary,#b25e09)}
.daris-sum-latest{font-size:11.5px;font-weight:500;color:var(--dsw-alias-label-secondary,inherit);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris-rowline{display:flex;gap:10px;align-items:baseline;padding:2px 0;font-size:12px}
.daris-note{margin-top:6px;padding:6px 8px;border-radius:6px;background:rgba(127,127,127,.07);font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:150px;overflow:auto}
.daris-stage-row{display:flex;gap:10px;align-items:baseline;padding:2px 0;font-size:12px}
.daris-stage-row .daris-v{flex:1 1 auto;min-width:0;font-weight:600}
.daris-plan-num{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit)}
.daris-todo,.daris-plan{margin:6px 0 0;padding-left:16px;font-size:12px}
.daris-todo li{margin:1px 0}
.daris-fold-s{font-size:12px;font-weight:700;letter-spacing:.03em;color:var(--dsw-alias-label-primary,inherit)}

.daris-btn{cursor:pointer;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit;font-size:12.5px;line-height:20px;padding:4px 12px;border-radius:8px}
.daris-btn:hover{border-color:rgba(127,127,127,.62);background:rgba(127,127,127,.07)}
.daris-btn:disabled{opacity:.45;cursor:default}
.daris-btn.primary{border-color:rgba(127,127,127,.62);background:rgba(127,127,127,.14);font-weight:600}
.daris-btn.danger{color:var(--dsw-alias-state-error-primary,#b42318);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 45%,transparent)}
.daris-btn.success{color:var(--dsw-alias-state-success-primary,#18794e);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 12%,transparent);font-weight:600}
.daris-btn.success:hover{border-color:var(--dsw-alias-state-success-primary,#18794e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 18%,transparent)}
.daris-input{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;padding:4px 8px;font:inherit;font-size:12.5px;background:var(--dsw-alias-bg-layer-1,transparent);color:inherit}
.daris-input:focus{outline:none;border-color:rgba(127,127,127,.62)}
.daris-grow{flex:1 1 420px;min-width:260px}
.daris-num{width:64px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right}
.daris-human-input{width:100%;min-height:64px;resize:vertical;margin:8px 0}
.daris-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0}
.daris-check{display:inline-flex;align-items:center;gap:4px;font-size:12px;opacity:.8;cursor:pointer}

.daris-tag{font-size:11px;padding:0 6px;border-radius:5px;border:1px solid rgba(127,127,127,.28);opacity:.75}
.daris-cost{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.daris-badge{font-size:11px;padding:0 6px;border-radius:5px;background:rgba(127,127,127,.14)}
.daris-empty,.daris-warn{font-size:12px;opacity:.6;padding:6px 0}
.daris-err{font-size:12px;color:var(--dsw-alias-state-error-primary,#b42318);padding:6px 0}
.daris-pre{background:rgba(127,127,127,.06);border:1px solid rgba(127,127,127,.22);border-radius:8px;padding:10px 12px;font-size:11.5px;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.daris-fold{border:1px solid rgba(127,127,127,.22);border-radius:8px;background:transparent;margin:0;overflow:hidden}
.daris-fold>summary{display:flex;align-items:center;gap:6px;padding:7px 11px;cursor:pointer;list-style:none;background:rgba(127,127,127,.04);border-bottom:1px solid transparent}
.daris-fold[open]>summary{border-bottom-color:rgba(127,127,127,.18)}
.daris-fold>summary::-webkit-details-marker{display:none}
.daris-fold>summary::before{content:'B8';font-size:10px;opacity:.55;transition:transform .15s}
.daris-fold[open]>summary::before{content:'BE'}
.daris-fold-body{padding:9px 11px;max-height:240px;overflow:auto}
.daris-bottom2{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;margin-top:12px}
@media (max-width:720px){.daris-bottom2{grid-template-columns:1fr}}

.daris-ev{display:flex;gap:10px;font-size:12px;padding:2px 0}
.daris-ev-row{display:flex;gap:10px;font-size:12px;padding:2px 0}
.daris-ev-at{flex:0 0 84px;font-size:11px;opacity:.5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.daris-ev-tx{flex:1 1 auto;min-width:0}
.daris-human-reason{font-size:12.5px;font-weight:600;color:var(--dsw-alias-state-error-primary,#b42318)}
.daris-human-hint{font-size:12px;opacity:.7;margin-top:2px}
.daris-toast{position:fixed;right:20px;bottom:20px;padding:8px 14px;border-radius:8px;background:rgba(127,127,127,.18);border:1px solid rgba(127,127,127,.35);font-size:12.5px;z-index:50}
.daris-card{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.22));border-radius:8px;padding:12px 14px;margin-bottom:10px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06))}
.daris-cardbody{padding:2px 0}
.daris-name{font-size:13px;font-weight:600}

/* ---- 产物 tab ---- */
.daris-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 10px}
.daris-chip{font:inherit;font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;cursor:pointer}
.daris-chip.on{background:rgba(127,127,127,.2);border-color:rgba(127,127,127,.5);font-weight:600}
.daris-audit{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.daris-tag.bad{color:var(--dsw-alias-state-error-primary,#b42318);border-color:currentColor}
.daris-tag.ok{color:var(--dsw-alias-state-success-primary,#18794e);border-color:currentColor;opacity:.95}
.daris-tag.warn{color:var(--dsw-alias-state-warning-primary,#b45309);border-color:currentColor;opacity:.95}
.daris-tag.run{color:var(--dsw-alias-state-warning-primary,#b26a00);border-color:currentColor;opacity:.9;align-self:center}
/* 主产物条：当前流水线最关键的论文成品固定置顶，不埋在文件列表里。 */
.daris-main{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:space-between;border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 34%,transparent);border-left:3px solid var(--dsw-alias-brand-primary,#2563eb);border-radius:10px;padding:10px 14px;margin:8px 0 12px;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06))}
.daris-main.empty{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b25e09) 38%,transparent);border-left-color:var(--dsw-alias-state-warn-primary,#b25e09)}
.daris-main-l{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 320px}
.daris-main-k{font-size:10.5px;font-weight:700;letter-spacing:.08em;opacity:.68}
.daris-main-n{font-size:14px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris-main-m{font-size:11.5px;opacity:.75;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris-main-r{display:flex;gap:8px;flex-wrap:wrap}
/* 产物页要吃掉剩余高度：列表与预览各自滚动，预览框撑满到卡片底部，而不是停在 620px。 */
.daris-arttab{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.daris-art{display:flex;align-items:stretch;flex:1 1 auto;min-height:360px;margin-top:6px}
.daris-art-list{flex:0 0 auto;min-width:0;min-height:0;overflow:auto}
.daris-art-split{flex:0 0 12px;display:flex;align-items:center;justify-content:center;cursor:col-resize;touch-action:none;border-radius:6px}
.daris-art-split>i{display:block;width:2px;height:100%;background:rgba(127,127,127,.25);border-radius:2px;transition:background .12s,width .12s}
.daris-art-split:hover>i,.daris-art-split.on>i{background:rgba(127,127,127,.62);width:3px}
.daris-art.dragging{user-select:none}
.daris-art.dragging iframe{pointer-events:none}
@media (max-width:820px){.daris-art{flex-direction:column;gap:10px}.daris-art-split{display:none}.daris-art-list{width:100%!important;flex:0 0 auto!important;max-height:45%}}
.daris-art-g{margin-bottom:12px}
.daris-art-gh{font-size:12px;font-weight:600;opacity:.75;margin-bottom:4px}
.daris-art-files{list-style:none;margin:0;padding:0}
.daris-art-f{display:flex;justify-content:space-between;gap:10px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12.5px;border:1px solid transparent}
.daris-art-f:hover{background:rgba(127,127,127,.08)}
.daris-art-f.on{background:rgba(127,127,127,.14);border-color:rgba(127,127,127,.28)}
.daris-art-n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris-art-m{flex:0 0 auto;font-size:11px;opacity:.55;font-family:ui-monospace,Menlo,monospace}
.daris-art-view{border:1px solid rgba(127,127,127,.22);border-radius:8px;padding:10px;min-height:180px;flex:1 1 auto;min-width:0;box-sizing:border-box;overflow:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.05))}
.daris-art-v{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;gap:6px}
.daris-pre-fill{flex:1 1 auto;min-height:0;max-height:none;overflow:auto;margin:2px 0 0}
.daris-pre{margin:6px 0 0;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,monospace}
.daris-build{margin-top:8px;font-size:12.5px}
.daris-build.ok{color:var(--dsw-alias-state-success-primary,#067647)}
.daris-build.bad{color:var(--dsw-alias-state-error-primary,#b42318)}
.daris-art-img{max-width:100%;max-height:100%;object-fit:contain;display:block;border-radius:6px}
.daris-art-pdf{flex:1 1 auto;width:100%;min-height:420px;border:0;border-radius:6px}
.daris-sess{margin-top:6px;max-height:62vh;overflow:auto;border:1px solid rgba(127,127,127,.2);border-radius:8px;padding:8px 10px}
.daris-sess-row{display:flex;gap:8px;padding:5px 0;border-top:1px dashed rgba(127,127,127,.18);font-size:12.5px;line-height:1.5}
.daris-sess-row:first-child{border-top:0}
.daris-sess-k{flex:0 0 62px;opacity:.6;font-size:11.5px;text-align:right;white-space:nowrap}
.daris-sess-t{flex:1 1 auto;min-width:0;white-space:pre-wrap;word-break:break-word}
.daris-sess-row.user .daris-sess-t{font-weight:600}
.daris-sess-row.tool .daris-sess-t{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;opacity:.85}
.daris-sess-row.result .daris-sess-t{opacity:.7}
.daris-sess-row.bad .daris-sess-t{color:var(--dsw-alias-state-error-primary,#b42318)}
.daris-sess-meta{font-size:11.5px;opacity:.6;margin:2px 0 4px}
.daris-sess-sum{cursor:pointer;outline:none}
.daris-sess-sum .daris-sess-t{max-height:3.2em;overflow:hidden}
.daris-err-list{margin:6px 0 0 16px;padding:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-state-error-primary,#b42318)}
`;

    const STATUS = {
      running: ['run', '运行中'],
      idle: ['ok', '待命'],
      blocked: ['warn', '被拦住'],
      stopped: ['off', '已停用'],
      error: ['bad', '出错'],
      unknown: ['off', '未知'],
    };

    const yu = (v) => (Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(4)}` : '—');
    const nm = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const tok = (u) => (u && u.total ? `${(u.total / 1000).toFixed(1)}k` : '0');
    const dur = (ms) => {
      const s = Math.round(nm(ms) / 1000);
      return s ? (s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`) : '—';
    };
    const ft = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    async function getState() {
      const res = await fetch(`/api/dsh-aris/state?t=${Date.now()}`, { headers: HEAD, cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    async function post(action, input) {
      const res = await fetch('/api/dsh-aris/action', {
        method: 'POST',
        headers: POST_HEAD,
        body: JSON.stringify({ action, input: input || {} }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    async function getArtifacts(name) {
      const qs = new URLSearchParams({ name: name || '', audit: '1', t: String(Date.now()) });
      const res = await fetch(`/api/dsh-aris/artifacts?${qs}`, { headers: HEAD, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    async function getArtifactFile(name, rel) {
      const qs = new URLSearchParams({ name: name || '', rel, t: String(Date.now()) });
      const res = await fetch(`/api/dsh-aris/file?${qs}`, { headers: HEAD, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    // 只读：把某一轮的 headless 会话读成时间线（不依赖 GUI 的工作区列表）。
    async function getSession(name, id, limit) {
      const qs = new URLSearchParams({
        name: name || '',
        id: id || '',
        limit: String(limit || 200),
        t: String(Date.now()),
      });
      const res = await fetch(`/api/dsh-aris/session?${qs}`, { headers: HEAD, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    // 编译失败时 action 也返回 200，这里不走 post()（它会因 ok:false 抛错）。
    async function postBuild(input) {
      const res = await fetch('/api/dsh-aris/action', {
        method: 'POST',
        headers: POST_HEAD,
        body: JSON.stringify({ action: 'paper.build', input: input || {} }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : n >= 1024 ? `${(n / 1024).toFixed(0)}KB` : `${n}B`);

    // 渲染兜底：任何页签抛错都显示错误文本与「重试」，而不是整页白屏。
    // （2026-11-12 产物页因 TDZ 白屏后加的——白屏时浏览器控制台才有堆栈，用户端什么都看不到。）
    class TabBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { err: '' };
      }
      static getDerivedStateFromError(error) {
        return { err: String((error && error.message) || error) };
      }
      componentDidUpdate(prev) {
        if (prev.k !== this.props.k && this.state.err) this.setState({ err: '' });
      }
      render() {
        if (!this.state.err) return this.props.children;
        return h('div', { className: 'daris-card' },
          h('div', { className: 'daris-name' }, '这个页签渲染出错（其余页签可用）'),
          h('pre', { className: 'daris-pre' }, this.state.err),
          h('div', { className: 'daris-row', style: { marginTop: 8 } },
            h(Btn, { label: '重试', onClick: () => this.setState({ err: '' }) })));
      }
    }

    function ArtifactsTab(props) {
      const pipes = props.pipes || [];
      const [pick, setPick] = React.useState(pipes[0] ? pipes[0].name : '');
      const [group, setGroup] = React.useState('');
      const [data, setData] = React.useState(null);
      const [err, setErr] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [file, setFile] = React.useState(null);
      const [fileErr, setFileErr] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [build, setBuild] = React.useState(null);

      // 左右分栏宽度：拖动分割线调整，双击复位，记在 localStorage 里跨刷新保留。
      const artRef = React.useRef(null);
      const [split, setSplit] = React.useState(() => {
        try { const v = parseInt(window.localStorage.getItem('daris-art-split') || '', 10); return v >= 180 ? v : 360; } catch (e) { return 360; }
      });
      const [dragging, setDragging] = React.useState(false);
      React.useEffect(() => { try { window.localStorage.setItem('daris-art-split', String(split)); } catch (e) {} }, [split]);
      const onSplitDown = (e) => {
        const box = artRef.current;
        if (!box) return;
        e.preventDefault();
        try { if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
        const boxW = artRef.current.clientWidth, x0 = e.clientX, w0 = split;
        setDragging(true);
        const move = (ev) => {
          const max = Math.max(220, boxW - 300);
          setSplit(Math.max(180, Math.min(max, w0 + (ev.clientX - x0))));
        };
        const up = () => {
          setDragging(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      };

      const load = React.useCallback(async (name) => {
        if (!name) return;
        setLoading(true); setErr('');
        try { const d = await getArtifacts(name); setData(d); return d; }
        catch (e) { setData(null); setErr(String((e && e.message) || e)); }
        finally { setLoading(false); }
      }, []);

      React.useEffect(() => { setFile(null); setBuild(null); if (pick) load(pick); }, [pick, load]);

      const open = async (f) => {
        setFileErr(''); setFile({ rel: f.rel, pending: true });
        try { const d = await getArtifactFile(pick, f.rel); setFile({ rel: f.rel, ...d }); }
        catch (e) { setFile({ rel: f.rel }); setFileErr(String((e && e.message) || e)); }
      };

      const compile = async () => {
        setBusy(true); setBuild(null);
        try {
          const r = await postBuild({ name: pick });
          setBuild({ ok: r.ok !== false, status: r.status, out: r.out, err: r.err, report: r.build || null });
          if (r.ok) {
            const d = await load(pick);
            const m = pickMain(((d && d.groups) || []).reduce((a, g) => a.concat(g.files || []), []));
            if (m) open(m);
          }
        } catch (e) { setBuild({ ok: false, err: String((e && e.message) || e) }); }
        finally { setBusy(false); }
      };

      const groups = (data && data.groups) || [];
      const totals = (data && data.totals) || { files: 0, bytes: 0 };
      const audit = data && data.audit;
      const shown = group ? groups.filter((g) => g.id === group) : groups;

      // 主论文定级：EN 成品 > CN 成品 > 未隔离的 main.pdf > 任意 main.pdf；
      // 编译走 --all 时输出在 <目录>/build/main.pdf，所以 build 版优先。
      const MAIN_PRI = [
        /^paper2\/en\/build\/main\.pdf$/i,
        /^paper2\/cn\/build\/main\.pdf$/i,
        /^paper2\/en\/main\.pdf$/i,
        /^paper2\/cn\/main\.pdf$/i,
        /(^|\/)main\.pdf$/i,
      ];
      function pickMain(files) {
        const list = files || [];
        for (let i = 0; i < MAIN_PRI.length; i++) {
          const hit = list.find((f) => MAIN_PRI[i].test(String(f.rel || '')));
          if (hit) return hit;
        }
        return null;
      }
      const allFiles = groups.reduce((acc, g) => acc.concat(g.files || []), []);
      const mainPdf = (data && data.main) || pickMain(allFiles);
      const mainTex = allFiles.filter((f) => /(^|\/)main\.tex$/i.test(String(f.rel || '')))[0] || null;
      const mainTexRel = (data && data.main && data.main.tex) || (mainTex ? mainTex.rel : null);

      const head = h('div', { className: 'daris-sec' },
        h('div', { className: 'daris-sec-t' }, '产物'),
        h('div', { className: 'daris-row' },
          h('select', { className: 'daris-input', value: pick, onChange: (e) => setPick(e.target.value) },
            pipes.length ? pipes.map((p) => h('option', { key: p.name, value: p.name }, `${p.name}（${p.driver}）`)) : h('option', { value: '' }, '没有流水线')),
          h(Btn, { label: loading ? '扫描中…' : '刷新', disabled: loading || !pick, onClick: () => load(pick) }),
          h(Btn, { label: busy ? '编译中…' : '编译论文', primary: true, disabled: busy || !pick, onClick: compile })),
        h('div', { className: 'daris-tag', style: { marginTop: 6 } },
          data ? `共 ${totals.files} 个文件 · ${kb(totals.bytes)} · 扫描于 ${ft(data.generatedAt)}` : (loading ? '正在扫描…' : '选一条流水线')),
        h('div', { className: 'daris-tag', style: { marginTop: 6 } },
          '只读浏览（六组分类 + 预览）在 Aris_Wiki 的「产物」页；这里保留主论文、编译与引用体检。'),
        build
          ? h('div', { className: `daris-build ${build.ok ? 'ok' : 'bad'}` },
            h('div', null,
              build.ok ? '编译通过' : '编译未通过',
              build.report && !build.report.all
                ? ` · ${build.report.engine} · ${build.report.ms}ms${build.report.pages ? ` · ${build.report.pages} 页` : ''}`
                : (build.status != null && !build.report ? `（退出码 ${build.status}）` : '')),
            build.report && build.report.all && build.report.items
              ? h('ul', { className: 'daris-err-list', style: { color: 'inherit' } }, build.report.items.map((it, i) => h('li', { key: i },
                `${it.dir} · ${it.ok ? `通过 ${it.engine} ${it.pages} 页` : '失败'}`,
                it.ok ? '' : ` —— ${((it.errors || [])[0] || {}).where || ''} ${((it.errors || [])[0] || {}).msg || ''}`)))
              : null,
            build.report && !build.report.all && build.report.pdf ? h('div', { className: 'daris-path' }, build.report.pdf) : null,
            build.report && !build.report.all && build.report.errors && build.report.errors.length
              ? h('ul', { className: 'daris-err-list' }, build.report.errors.slice(0, 6).map((e, i) => h('li', { key: i }, `${e.where ? e.where + '：' : ''}${e.msg}`)))
              : null,
            (!build.report && (build.out || build.err)) ? h('pre', { className: 'daris-pre' }, String(build.out || build.err).slice(-1200)) : null)
          : null);

      const chips = data
        ? h('div', { className: 'daris-chips' },
          h('button', { className: `daris-chip ${group === '' ? 'on' : ''}`, onClick: () => setGroup('') }, `全部 ${totals.files}`),
          groups.map((g) => h('button', { key: g.id, className: `daris-chip ${group === g.id ? 'on' : ''}`, onClick: () => setGroup(g.id) }, `${g.label} ${g.count}`)))
        : null;

      const auditBar = audit
        ? h('div', { className: 'daris-audit' },
          h('span', { className: 'daris-tag' }, `章节 ${(audit.chapters || []).length}`),
          h('span', { className: `daris-tag ${(audit.emptyChapters || []).length ? 'bad' : ''}` }, `空章 ${(audit.emptyChapters || []).length}`),
          h('span', { className: 'daris-tag' }, `图 ${audit.figures || 0}`),
          h('span', { className: `daris-tag ${(audit.missing || []).length ? 'bad' : ''}` }, `缺图 ${(audit.missing || []).length}`),
          h('span', { className: 'daris-tag' }, `未被引用 ${(audit.unused || []).length}`))
        : null;

      const hero = h('div', { className: `daris-main${mainPdf ? '' : ' empty'}` },
        h('div', { className: 'daris-main-l' },
          h('div', { className: 'daris-main-k' }, '主论文'),
          h('div', { className: 'daris-main-n', title: mainPdf ? mainPdf.rel : '' },
            mainPdf ? `${mainPdf.label ? mainPdf.label + ' · ' : ''}${mainPdf.name || mainPdf.rel}` : (data ? '还没有 main.pdf' : '选一条流水线')),
          h('div', { className: 'daris-main-m' },
            mainPdf
              ? `${kb(mainPdf.size)} · 生成于 ${ft(mainPdf.mtime)}`
              : (data ? '点右侧「编译论文」生成；EN 稿含中文占位时会失败（U+3010）' : ''))),
        h('div', { className: 'daris-main-r' },
          mainPdf ? h(Btn, { label: '打开 PDF', primary: true, onClick: () => open(mainPdf) }) : null,
          mainTexRel ? h(Btn, { label: '看源码', onClick: () => open({ rel: mainTexRel }) }) : null,
          h(Btn, { label: busy ? '编译中…' : '编译论文', primary: !mainPdf, disabled: busy || !pick, onClick: compile })));

      const list = h('div', { className: 'daris-art-list', style: { width: split + 'px' } },
        err ? h('div', { className: 'daris-err' }, err) : null,
        (!data && !err && !loading) ? h('div', { className: 'daris-empty' }, '还没有扫描结果。') : null,
        shown.map((g) => (g.count
          ? h('div', { key: g.id, className: 'daris-art-g' },
            h('div', { className: 'daris-art-gh' }, `${g.label} · ${g.count}`),
            h('ul', { className: 'daris-art-files' },
              g.files.slice(0, 150).map((f) => h('li', {
                key: f.rel,
                className: `daris-art-f ${file && file.rel === f.rel ? 'on' : ''}`,
                title: f.rel,
                onClick: () => open(f),
              },
              h('span', { className: 'daris-art-n' }, f.name),
              h('span', { className: 'daris-art-m' }, `${kb(f.size)} · ${ft(f.mtime)}`)))))
          : null)),
        data && data.warnings && data.warnings.length
          ? h('div', { className: 'daris-tag', style: { marginTop: 8 } }, data.warnings.slice(0, 3).join('；'))
          : null);

      let view = h('div', { className: 'daris-empty' }, '点左侧文件在此预览。');
      if (file) {
        if (file.pending) view = h('div', { className: 'daris-tag' }, '读取中…');
        else if (fileErr) view = h('div', { className: 'daris-err' }, fileErr);
        else if (file.error) view = h('div', { className: 'daris-err' }, file.error);
        else if (file.text != null) view = h('div', { className: 'daris-art-v' }, h('div', { className: 'daris-path' }, `${file.rel}${file.truncated ? '（已截断）' : ''}`), h('pre', { className: 'daris-pre daris-pre-fill' }, file.text));
        else if (file.dataUrl && /^image\//.test(file.mime || '')) view = h('div', { className: 'daris-art-v' }, h('div', { className: 'daris-path' }, file.rel), h('img', { className: 'daris-art-img', src: file.dataUrl }));
        else if (file.dataUrl && file.mime === 'application/pdf') view = h('div', { className: 'daris-art-v' }, h('div', { className: 'daris-path' }, file.rel), h('iframe', { className: 'daris-art-pdf', src: file.dataUrl }));
        else view = h('div', { className: 'daris-tag' }, file.error || '这个文件不支持预览');
      }

      return h('div', { className: 'daris-arttab' }, head, hero, chips, auditBar,
        h('div', { className: `daris-art${dragging ? ' dragging' : ''}`, ref: artRef },
          list,
          h('div', {
            className: `daris-art-split${dragging ? ' on' : ''}`,
            title: '拖动调整宽度 · 双击复位',
            onPointerDown: onSplitDown,
            onDoubleClick: () => setSplit(360),
          }, h('i')),
          h('div', { className: 'daris-art-view' }, view)));
    }

    function Btn(props) {
      const cls = ['daris-btn', props.primary ? 'primary' : '', props.danger ? 'danger' : '', props.success ? 'success' : ''].join(' ');
      return h('button', { className: cls, disabled: props.disabled, title: props.title, onClick: props.onClick }, props.label);
    }

    function Pipe(props) {
      const [open, setOpen] = React.useState(!!props.defaultOpen);
      return h('details', { className: props.className, open, onToggle: (e) => setOpen(e.currentTarget.open) },
        h('summary', { className: props.summaryClass || 'daris-sum' }, props.summary),
        open ? props.children : null);
    }

    function Fold(props) {
      const [open, setOpen] = React.useState(!!props.defaultOpen);
      return h('details', { className: props.className || 'daris-fold', open, onToggle: (e) => setOpen(e.currentTarget.open) },
        h('summary', null, h('span', { className: 'daris-fold-s' }, props.label)),
        open ? h('div', { className: 'daris-fold-body' }, props.children) : null);
    }

    function Block(props) {
      return h('div', { className: `daris-block ${props.className || ''}` },
        h('div', { className: 'daris-block-h' },
          h('span', { className: 'daris-block-t' }, props.title),
          props.extra ? h('span', { className: 'daris-block-x' }, props.extra) : null),
        h('div', { className: 'daris-block-b' }, props.children));
    }

    function Badge(props) {
      const style = props.onClick ? { cursor: 'pointer' } : undefined;
      return h('span', { className: `daris-badge ${props.kind}`, title: props.title, style, onClick: props.onClick }, props.text);
    }

    function Full(props) {
      return props.value ? h('span', { className: props.err ? 'daris-err' : 'daris-warn' }, props.value) : null;
    }

    // 折叠分组：审核页的每一项设置都归到一条「路径」下，默认收起
    function Group(props) {
      const { title, sub, badge, defaultOpen, children } = props;
      const [open, setOpen] = React.useState(Boolean(defaultOpen));
      return h('div', { className: 'daris-card' },
        h('div', { className: 'daris-row', style: { justifyContent: 'space-between', cursor: 'pointer', alignItems: 'flex-start' }, onClick: () => setOpen(!open) },
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { className: 'daris-name' }, `${open ? '▾' : '▸'} ${title}`),
            sub ? h('div', { className: 'daris-sub' }, sub) : null),
          badge ? h('span', { className: 'daris-tag' }, badge) : null),
        open ? h('div', { style: { marginTop: 8 } }, children) : null);
    }

    // 审核结果：两条通道的审稿产物按结论分类，集中在一处看
    function ReviewResults(props) {
      const { reviews } = props;
      const rv = reviews || { total: 0, groups: [], byLatest: {}, humanActions: [] };
      const groups = rv.groups || [];
      const latestCounts = rv.byLatest || { accept: 0, revise: 0, reject: 0, unknown: 0 };
      const human = rv.humanActions || [];
      const [verdict, setVerdict] = React.useState('all');
      const [channel, setChannel] = React.useState('all');
      const [openKey, setOpenKey] = React.useState('');
      const [histKey, setHistKey] = React.useState('');
      const [texts, setTexts] = React.useState({});
      const [err, setErr] = React.useState('');
      const VERD = [['all', '全部'], ['accept', '通过'], ['revise', '待修'], ['reject', '退回'], ['unknown', '未判定']];
      const CH = [['all', '两条通道'], ['kimi', 'Kimi'], ['gpt', 'GPT'], ['other', '未标注']];
      const chCount = (c) => (c === 'all' ? groups.length : groups.filter((g) => g.latest && g.latest.channel === c).length);
      const shown = groups.filter((g) => {
        const l = g.latest || {};
        if (verdict !== 'all' && l.verdict !== verdict) return false;
        if (channel !== 'all' && l.channel !== channel) return false;
        return true;
      });
      const load = async (g) => {
        const it = g.latest || {};
        const key = g.key;
        if (openKey === key) { setOpenKey(''); return; }
        setOpenKey(key);
        if (texts[key] || !it.name || !(it.mdRel || it.rel)) return;
        try {
          const res = await getArtifactFile(it.name, it.mdRel || it.rel);
          setTexts((prev) => ({ ...prev, [key]: String((res && res.text) || '（空）') }));
        } catch (e) {
          setErr(String((e && e.message) || e));
        }
      };
      const toneOf = (v) => (v === 'accept' ? 'ok' : v === 'reject' ? 'bad' : v === 'revise' ? 'warn' : '');
      const statRow = h('div', { className: 'daris-row', style: { marginTop: 4, flexWrap: 'wrap' } },
        h('span', { className: `daris-tag ${human.length ? 'bad' : 'ok'}`.trim() }, `需人工 ${human.length}`),
        h('span', { className: 'daris-tag warn' }, `当前待修 ${latestCounts.revise || 0} 个 scope`),
        h('span', { className: 'daris-tag ok' }, `已通过 ${latestCounts.accept || 0}`),
        h('span', { className: 'daris-tag' }, `稿件 ${groups.length} 份 / 记录 ${rv.total || 0} 条`));
      const humanBlock = human.length
        ? h('div', { style: { marginTop: 10 } },
          h('div', { className: 'daris-sub' }, '需要人处理（机器不会自己往下走）'),
          human.map((a, i) => h('div', { key: `h-${i}`, className: 'daris-row', style: { marginTop: 6, flexWrap: 'wrap' } },
            h('span', { className: `daris-tag ${a.level === 'bad' ? 'bad' : 'warn'}`.trim() }, a.level === 'bad' ? '人工' : '注意'),
            h('span', { className: 'daris-tag' }, a.name || '-'),
            h('strong', null, a.title),
            a.detail ? h('span', { className: 'daris-sub' }, a.detail) : null,
            a.at ? h('span', { className: 'daris-path' }, ft(a.at)) : null)))
        : h('div', { className: 'daris-tag ok', style: { marginTop: 8 } }, '没有需要人处理的项。');
      const filters = h('div', null,
        h('div', { className: 'daris-row', style: { marginTop: 6, flexWrap: 'wrap' } },
          VERD.map(([v, label]) => h(Btn, {
            key: `v-${v}`,
            label: `${label} ${v === 'all' ? groups.length : (latestCounts[v] || 0)}`,
            primary: verdict === v,
            onClick: () => setVerdict(v),
          }))),
        h('div', { className: 'daris-row', style: { marginTop: 6, flexWrap: 'wrap' } },
          CH.map(([c, label]) => h(Btn, {
            key: `c-${c}`,
            label: `${label} ${chCount(c)}`,
            primary: channel === c,
            onClick: () => setChannel(c),
          }))));
      const rows = shown.length
        ? shown.map((g) => {
          const it = g.latest || {};
          const key = g.key;
          const open = openKey === key;
          const histOpen = histKey === key;
          const headTags = [
            h('span', { key: 't', className: 'daris-tag' }, `${open ? '▾' : '▸'} ${ft(it.at)}`),
            h('span', { key: 'n', className: 'daris-tag' }, it.name || g.project || '-'),
            g.scope ? h('span', { key: 's', className: 'daris-tag' }, g.scope) : null,
            h('span', { key: 'v', className: `daris-tag ${toneOf(it.verdict)}`.trim() }, it.verdict),
            it.score != null ? h('span', { key: 'sc', className: 'daris-tag' }, `${it.score}/10`) : null,
            h('span', { key: 'r', className: 'daris-tag' }, `第 ${g.rounds} 轮` + (g.historyCount ? ` · 历史 ${g.historyCount} 条` : '')),
            h('span', { key: 'c', className: 'daris-tag' }, it.channel === 'gpt' ? 'GPT' : it.channel === 'kimi' ? 'Kimi' : (it.channel || '-')),
            it.model ? h('span', { key: 'm', className: 'daris-path' }, it.model) : null,
          ].filter(Boolean);
          const body = open
            ? h('div', { style: { marginTop: 6 } },
              it.summary ? h('div', { className: 'daris-sub' }, it.summary) : null,
              (g.must && g.must.length)
                ? h('div', { style: { marginTop: 6 } },
                  h('div', { className: 'daris-sub' }, `必须解决（${g.must.length} 条）`),
                  g.must.map((m, i) => h('div', { key: `m-${i}`, className: 'daris-path' }, `· ${m}`)))
                : null,
              h('div', { className: 'daris-row', style: { marginTop: 6, flexWrap: 'wrap' } },
                h(Btn, { label: histOpen ? '收起历史' : `历史 ${g.historyCount} 条`, onClick: () => setHistKey(histOpen ? '' : key) }),
                it.mdRel || it.rel ? h('span', { className: 'daris-path' }, `${it.name || ''}/${it.mdRel || it.rel}`) : null),
              histOpen
                ? (g.history || []).map((hj, i) => h('div', { key: `hj-${i}`, className: 'daris-row', style: { marginTop: 4, flexWrap: 'wrap' } },
                  h('span', { className: 'daris-tag' }, ft(hj.at)),
                  h('span', { className: `daris-tag ${toneOf(hj.verdict)}`.trim() }, hj.verdict),
                  hj.score != null ? h('span', { className: 'daris-tag' }, `${hj.score}/10`) : null,
                  h('span', { className: 'daris-tag' }, `第 ${hj.round || '-'} 轮`)))
                : null,
              texts[key]
                ? h('pre', { className: 'daris-pre', style: { maxHeight: 340 } }, texts[key].slice(0, 6000))
                : null)
            : null;
          return h('div', { key, style: { marginTop: 8 } },
            h('div', { className: 'daris-row', style: { cursor: 'pointer', flexWrap: 'wrap' }, onClick: () => load(g) }, headTags),
            body);
        })
        : [h('div', { key: 'empty', className: 'daris-tag', style: { marginTop: 8 } }, '没有符合筛选的稿件。')];
      return h(Group, {
        title: '审核结果 · 每份稿子只看最新一轮',
        sub: '一份稿子改几轮就有几条记录，这里按「项目 + scope」归并，只把最新一轮摆出来；旧轮次点开可见。「需要人处理」只列机器自己不会再推进的事。',
        badge: human.length ? `需人工 ${human.length}` : `${groups.length} 份稿件`,
        defaultOpen: true,
      },
        h('div', null, statRow, humanBlock, filters, err ? h('div', { className: 'daris-err', style: { marginTop: 8 } }, err) : null, h('div', null, rows),
          rv.truncated ? h('div', { className: 'daris-tag', style: { marginTop: 8 } }, '只显示最近 100 条，完整清单在各自 .aris/reviews/') : null));
    }

    // 审核线路：明确选一条，另一条会被闸门挡住
    function RouteCard(props) {
      const { codex, busy, act, pipes } = props;
      const runningPipes = (pipes || []).filter((p) => p && p.running).map((p) => p.name);
      const locked = runningPipes.length > 0;
      const route = (codex && codex.route) || { channel: 'auto', options: [] };
      const opts = route.options && route.options.length ? route.options : [
        { value: 'auto', label: '自动（谁先占锁谁跑）', hint: '' },
        { value: 'kimi', label: 'Kimi 邮箱', hint: '' },
        { value: 'gpt', label: 'GPT 外审', hint: '' },
      ];
      const cur = opts.find((o) => o.value === route.channel) || opts[0];
      return h(Group, {
        title: '审核线路 · 这一轮走哪条通道',
        sub: '选定后另一条通道的派单/投递会被直接拒绝；两条都开放就是「自动」，靠审核单飞锁互斥。',
        badge: cur.label,
        defaultOpen: true,
      },
        h('div', null,
          h('div', { className: 'daris-row', style: { marginTop: 4 } },
            opts.map((o) => h(Btn, {
              key: o.value,
              label: o.label,
              primary: o.value === route.channel,
              disabled: busy || (locked && o.value !== route.channel),
              onClick: () => { if (locked && o.value !== route.channel) return; act('review.route', { channel: o.value }); },
            }))),
          h('div', { className: 'daris-sub', style: { marginTop: 8 } }, cur.hint || ''),
          (() => {
            const projs = (route && route.projects) || [];
            if (!projs.length) return null;
            const mismatch = projs.filter((x) => x.exists && x.active && x.active !== route.channel && route.channel !== 'auto');
            return h('div', { style: { marginTop: 8 } },
              h('div', { className: 'daris-sub' }, '项目侧生效通道（reviewer.json 的 active）'),
              h('div', { className: 'daris-row', style: { flexWrap: 'wrap', marginTop: 4 } },
                projs.map((x) => h('span', {
                  key: x.root,
                  className: 'daris-tag ' + (x.active === route.channel || route.channel === 'auto' ? 'ok' : 'warn'),
                  title: x.file || '',
                }, `${x.name}：${x.active || '未配置'}`))),
              mismatch.length
                ? h('div', { className: 'daris-err', style: { marginTop: 6 } },
                  `有 ${mismatch.length} 个项目的 reviewer.json 还是旧通道（${mismatch.map((m) => m.name).join('、')}）。点上面的线路按钮保存一次即可同步；不同步的话，流水线自己的送审仍按项目配置走。`)
                : null);
          })(),
          locked
            ? h('div', { className: 'daris-err', style: { marginTop: 6 } },
              `流水线「${runningPipes.join('、')}」正在运行，运行期间审核线路锁定，不能切换——跑到一半换通道会让同一轮出现两种审稿人。等这一轮结束再改。`)
            : null));
    }

    function GptReviewCards(props) {
      const { codex, pipes, busy, act } = props;
      const [draft, setDraft] = React.useState(null);
      const [root, setRoot] = React.useState('');
      const [filesText, setFilesText] = React.useState('');
      const [taskKey, setTaskKey] = React.useState('routine_review');
      const [draftRole, setDraftRole] = React.useState(null);
      const [draftOutput, setDraftOutput] = React.useState(null);
      const [wsMode, setWsMode] = React.useState(null);
      const [wsPath, setWsPath] = React.useState(null);
      const [copied, setCopied] = React.useState('');
      const [view, setView] = React.useState(null);
      if (!codex) return h('div', { className: 'daris-empty' }, 'GPT 外审状态还没读到。');
      if (codex.error) return h('div', { className: 'daris-err' }, `GPT 外审状态读取失败：${codex.error}`);
      const c = draft || codex.config || {};
      const taskDefs = codex.taskDefs || codex.stageDefs || [];
      const models = codex.models || [];
      const info = (slug) => models.find((m) => m.slug === slug) || null;
      const effortsOf = (slug) => {
        const m = info(slug);
        return m && m.efforts && m.efforts.length ? m.efforts : ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
      };
      const save = async (patch) => {
        setDraft({ ...c, ...patch });
        const r = await act('codex.save', { codex: patch });
        if (r && r.saved) setDraft(null); // 服务端已回读，用落盘真值替换草稿
      };
      const saveTask = async (key, patch) => {
        const tasks = { ...(c.tasks || {}) };
        tasks[key] = { ...(tasks[key] || {}), ...patch };
        await save({ tasks });
      };
      const openSession = async (sid) => {
        if (!sid) return;
        setView({ sessionId: sid, loading: true });
        const r = await act('codex.session', { sessionId: sid });
        setView(r && r.ok ? { sessionId: sid, data: r.session } : { sessionId: sid, err: (r && r.error) || '读取失败' });
      };
      const sessionPanel = view
        ? h('div', { style: { marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.03)', borderRadius: 8 } },
          h('div', { className: 'daris-row' },
            h('span', { className: 'daris-k' }, '会话回放'),
            h('span', { className: 'daris-tag' }, view.sessionId),
            h(Btn, { label: '复制续聊指令', primary: true, onClick: () => copy(`codex resume ${view.sessionId}`) }),
            h(Btn, { label: '关闭', onClick: () => setView(null) })),
          view.loading ? h('div', { className: 'daris-tag', style: { marginTop: 6 } }, '正在读会话文件…') : null,
          view.err ? h('div', { className: 'daris-err', style: { marginTop: 6 } }, view.err) : null,
          (view.data) ? h('div', { style: { marginTop: 6 } },
            h('div', { className: 'daris-path' }, `${view.data.file || ''}`),
            h('div', { className: 'daris-tag', style: { marginTop: 4 } },
              `模型 ${(view.data.meta || {}).model || '?'} · 起源 ${(view.data.meta || {}).originator || '?'} · 工作区 ${(view.data.meta || {}).cwd || '?'} · ${view.data.total || 0} 条消息`),
            (view.data.dropped ? h('div', { className: 'daris-tag', style: { marginTop: 4 } }, `只显示最近 ${(view.data.turns || []).length} 条，更早的 ${view.data.dropped} 条未展开`) : null),
            (view.data.turns || []).map((t, i) => h('div', { key: i, style: { marginTop: 8 } },
              h('div', { className: 'daris-k' }, t.role === 'user' ? '发给 GPT 的' : 'GPT 回复'),
              h('pre', { className: 'daris-pre', style: { maxHeight: 320, overflow: 'auto', marginTop: 4 } }, t.text)))) : null)
        : null;
      const manual = codex.manual || {};
      const last = codex.lastManual || null;
      const pp = codex.promptPreview || {};
      const roleText = draftRole !== null ? draftRole : String(pp.role || '');
      const outputText = draftOutput !== null ? draftOutput : String(pp.output || '');
      const ws = codex.workspace || { mode: 'root', path: '' };
      const modeDefs = codex.workspaceModes && codex.workspaceModes.length
        ? codex.workspaceModes
        : [{ mode: 'root', label: '项目根', hint: 'ChatGPT 续聊时能看到整个项目（推荐）' },
          { mode: 'subdir', label: '指定子目录', hint: '视野收窄到一个目录，省 token；续聊也只能看到该目录' },
          { mode: 'copy', label: '隔离副本', hint: '把送审文件复制到 tmp/codex-sandbox/<stamp>/ 再跑，跑完清理' }];
      const mode = wsMode !== null ? wsMode : (ws.mode || 'root');
      const subPath = wsPath !== null ? wsPath : (ws.path || '');
      const copy = (text) => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
        } catch (e) { /* 剪贴板不可用就退回手选 */ }
        setCopied(text);
      };
      const nSessions = (codex.storage && codex.storage.codexSessions) || {};
      const budgetFields = h('div', { className: 'daris-row', style: { marginTop: 10 } },
        h('div', null, h('div', { className: 'daris-k' }, '每小时上限'), h('input', { className: 'daris-input daris-num', type: 'number', min: 1, max: 60, value: c.hourlyLimit, onChange: (e) => setDraft({ ...c, hourlyLimit: e.target.value }) })),
        h('div', null, h('div', { className: 'daris-k' }, '每日上限（0=不限）'), h('input', { className: 'daris-input daris-num', type: 'number', min: 0, value: c.dailyLimit, onChange: (e) => setDraft({ ...c, dailyLimit: e.target.value }) })),
        h('div', null, h('div', { className: 'daris-k' }, '单次超时（分钟）'), h('input', { className: 'daris-input daris-num', type: 'number', min: 1, max: 30, value: c.timeoutMinutes, onChange: (e) => setDraft({ ...c, timeoutMinutes: e.target.value }) })),
        h('div', null, h('div', { className: 'daris-k' }, '代理'), h('input', { className: 'daris-input', value: c.proxy || '', onChange: (e) => setDraft({ ...c, proxy: e.target.value }) })),
        h('div', null, h('div', { className: 'daris-k' }, '沙箱'), h('select', { className: 'daris-input', value: c.sandboxMode || 'read-only', onChange: (e) => setDraft({ ...c, sandboxMode: e.target.value }) },
          h('option', { value: 'read-only' }, 'read-only（只读正文）'),
          h('option', { value: 'danger-full-access' }, 'full-access（可翻仓库）'))));

      const statusRow = h('div', { className: 'daris-row', style: { marginTop: 8 } },
        h('span', { className: c.enabled ? 'daris-tag ok' : 'daris-tag', style: { fontWeight: 600 } }, c.enabled ? '● 已启用' : '○ 已停用'),
        h(Btn, { label: c.enabled ? '停用' : '启用', primary: !c.enabled, disabled: busy, onClick: () => save({ enabled: !c.enabled }) }),
        h('span', { className: 'daris-tag' }, codex.exeOk ? 'codex.exe 已找到' : 'codex.exe 未找到'),
        h('span', { className: 'daris-tag' }, `本小时 ${codex.usedThisHour}/${c.hourlyLimit}`),
        h('span', { className: 'daris-tag' }, `今日 ${codex.todayCount}${Number(c.dailyLimit) > 0 ? '/' + c.dailyLimit : '（不限）'}`),
        Number(codex.consecutiveFailures) > 0 ? h('span', { className: 'daris-tag' }, `连续失败 ${codex.consecutiveFailures}/3`) : null);

      const saveChannel = h('div', { className: 'daris-row', style: { marginTop: 10 } },
        h(Btn, { label: '保存通道设置', primary: true, disabled: busy, onClick: () => save({ hourlyLimit: Number(c.hourlyLimit) || 4, dailyLimit: Number(c.dailyLimit) || 0, timeoutMinutes: Number(c.timeoutMinutes) || 8, proxy: String(c.proxy || ''), sandboxMode: c.sandboxMode || 'read-only' }) }));

      const quota = codex.quota || {};
      const quotaWin = (w) => {
        const used = Math.round(w.usedPercent);
        const reset = w.resetsInMinutes == null
          ? ''
          : (w.resetsInMinutes >= 120 ? ` · ${Math.round(w.resetsInMinutes / 60)} 小时后重置` : ` · ${Math.max(0, w.resetsInMinutes)} 分钟后重置`);
        return `${w.label} 已用 ${used}%${reset}`;
      };
      const quotaRow = h('div', { className: 'daris-row', style: { marginTop: 8 } },
        h('span', { className: 'daris-k' }, '订阅额度'),
        quota.ok && quota.plan ? h('span', { className: 'daris-tag' }, `计划 ${quota.plan}`) : null,
        quota.ok
          ? (quota.windows || []).map((w) => h('span', {
            key: w.key,
            className: w.usedPercent >= 90 ? 'daris-tag bad' : (w.usedPercent >= 70 ? 'daris-tag warn' : 'daris-tag ok'),
          }, quotaWin(w)))
          : h('span', { className: 'daris-tag' }, quota.error || '额度不可得（还没跑过派单）'),
        quota.ok
          ? h('span', { className: 'daris-tag' + (quota.stale ? ' warn' : '') },
            quota.ageMinutes == null ? '' : `取自 ${quota.ageMinutes} 分钟前那次派单${quota.stale ? '（可能已过期）' : ''}`)
          : null);

      const g1 = h(Group, {
        title: 'GPT 外审通道 · 状态与额度',
        sub: '本机 ChatGPT 桌面端的 Codex CLI（订阅登录，不另付费）。额度共用订阅，所以闸门在派单前生效：超限直接拒，不静默降级。',
        badge: c.enabled ? '已启用' : '已停用',
      },
        h('div', null,
          statusRow,
          quotaRow,
          h('div', { className: 'daris-path', style: { marginTop: 6 } }, codex.exe || '（未解析到 codex.exe）'),
          h('div', { className: 'daris-tag', style: { marginTop: 6 } }, `会话库 ~/.codex/sessions 现占 ${((nSessions.bytes || 0) / 1048576).toFixed(2)} MB、${nSessions.files || 0} 个文件（默认只报体积，不自动删）`),
          budgetFields,
          saveChannel,
          h('div', { className: 'daris-tag', style: { marginTop: 8 } },
            c.sandboxMode === 'danger-full-access'
              ? 'full-access：GPT 可以自己执行命令翻仓库，也可能误改文件；只读靠提示词里那四条硬规则约束。'
              : 'read-only：这台机上 codex 的只读 shell 辅助进程起不来（orchestrator_helper_exit_nonzero），所以 GPT 只读送审材料，不会去翻文件。')));

      const modeBtns = h('div', { className: 'daris-row', style: { marginTop: 8 } },
        modeDefs.map((m) => { const k = m.key || m.mode; return h(Btn, { key: k, label: m.label, primary: mode === k, disabled: busy, onClick: () => setWsMode(k) }); }));

      const g2 = h(Group, {
        title: '派单工作区 · GPT 能看到哪',
        sub: '这里决定 -C（GPT 眼里的工作区），也决定你在 ChatGPT 里续聊时它还能看到什么。',
        badge: mode === 'subdir' && subPath ? `subdir · ${subPath}` : mode,
      },
        h('div', null,
          modeBtns,
          h('div', { className: 'daris-sub', style: { marginTop: 6 } }, (modeDefs.find((m) => (m.key || m.mode) === mode) || {}).hint || ''),
          mode === 'subdir'
            ? h('input', { className: 'daris-input', style: { marginTop: 6, width: '100%' }, placeholder: '子目录（相对项目根），例如 dataset_gen', value: subPath, onChange: (e) => setWsPath(e.target.value) })
            : null,
          h('div', { className: 'daris-tag', style: { marginTop: 8 } }, '联动：续聊视野跟着这里走——选了子目录，ChatGPT 续聊时只看得到那个子目录。'),
          h('div', { className: 'daris-row', style: { marginTop: 8 } },
            h(Btn, { label: '保存工作区', primary: true, disabled: busy, onClick: () => save({ workspace: { mode, path: mode === 'subdir' ? subPath.trim() : '' } }) }),
            h('span', { className: 'daris-tag' }, `当前 ${ws.mode}${ws.path ? ' · ' + ws.path : ''}`),
            h('span', { className: 'daris-tag' }, c.cleanCopy === false ? '隔离副本保留' : '隔离副本跑完自动清'))));

      const promptBox = h('div', null,
        h('div', { className: 'daris-k', style: { marginTop: 8 } }, '角色段（role）'),
        h('textarea', { className: 'daris-input', style: { width: '100%', minHeight: 150, fontFamily: 'ui-monospace, monospace', fontSize: 12 }, value: roleText, onChange: (e) => setDraftRole(e.target.value) }),
        h('div', { className: 'daris-k', style: { marginTop: 8 } }, '输出段（output）'),
        h('textarea', { className: 'daris-input', style: { width: '100%', minHeight: 110, fontFamily: 'ui-monospace, monospace', fontSize: 12 }, value: outputText, onChange: (e) => setDraftOutput(e.target.value) }),
        (pp.unknown && pp.unknown.length) ? h('div', { className: 'daris-err', style: { marginTop: 6 } }, `有未定义占位符：${pp.unknown.join('、')}（会被原样发出去）`) : null,
        h('div', { className: 'daris-row', style: { marginTop: 8 } },
          h(Btn, { label: '保存提示词', primary: true, disabled: busy, onClick: async () => { await save({ prompt: { role: roleText, output: outputText } }); setDraftRole(null); setDraftOutput(null); } }),
          h(Btn, { label: '恢复默认内容', disabled: busy, onClick: () => { const d = pp.defaults || {}; setDraftRole(d.role || ''); setDraftOutput(d.output || ''); } }),
          h('span', { className: 'daris-tag' }, '保存后下一次派单立即生效')),
        h('div', { className: 'daris-k', style: { marginTop: 10 } }, '渲染预览（样例材料）'),
        h('pre', { className: 'daris-pre', style: { maxHeight: 260 } }, String(pp.prompt || '')));

      const g3 = h(Group, {
        title: '送审提示词 · 可改可预览',
        sub: '派单时真正发出去的就是这两段渲染后的结果。可用占位符：{{model}} {{effort}} {{taskLabel}} {{taskHint}} {{access}} {{cwd}} {{fileCount}} {{chars}} {{files}} {{date}}',
        badge: pp.chars ? `预览 ${pp.chars} 字符` : '',
      }, promptBox);

      const taskRows = taskDefs.map((def) => {
        const st = (c.tasks || {})[def.key] || {};
        const slug = st.model || '';
        return h('div', { key: def.key, className: 'daris-row', style: { marginTop: 6 } },
          h('span', { className: 'daris-tag', style: { minWidth: 150, display: 'inline-block' }, title: def.hint || '' }, def.label),
          h('select', { className: 'daris-input', value: slug, onChange: (e) => saveTask(def.key, { model: e.target.value }) },
            models.length
              ? models.map((m) => h('option', { key: m.slug, value: m.slug }, `${m.slug} · ${Math.round((m.contextWindow || 0) / 1000)}k`))
              : h('option', { value: slug }, slug || '（模型清单读不到）')),
          h('select', { className: 'daris-input daris-num', value: st.effort || '', onChange: (e) => saveTask(def.key, { effort: e.target.value }) },
            effortsOf(slug).map((x) => h('option', { key: x, value: x }, x))),
          h(Btn, { label: st.enabled === false ? '关' : '开', disabled: busy, onClick: () => saveTask(def.key, { enabled: st.enabled === false }) }));
      });

      const g4 = h(Group, {
        title: 'GPT 任务分类 · 每类用哪个模型',
        sub: '按「这一单要审什么」配默认模型与思考强度，不绑流水线阶段（阶段会变，任务类型稳定）。',
        badge: `${taskDefs.length} 类`,
      }, h('div', null, taskRows));

      const lastBlock = last
        ? h('div', { style: { marginTop: 10 } },
          h('div', { className: 'daris-k' }, `${last.ok ? '上次派单' : '上次失败'} · ${last.target} · ${last.task || '-'} · ${ft(last.at)}`),
          last.ok
            ? h('div', null,
              h('div', { className: 'daris-tag', style: { marginTop: 6 } }, `模型 ${last.cliModel || last.model} / ${last.effort} · ${last.tokens} tokens · ${Math.round((last.ms || 0) / 1000)}s · ${last.chars || 0} 字符 · ${(last.files && last.files.length) || 1} 个文件 · verdict ${last.verdict || 'unknown'}`),
              (last.notes && last.notes.length) ? h('div', { className: 'daris-err', style: { marginTop: 6 } }, last.notes.join('；')) : null,
              last.file ? h('div', { className: 'daris-path' }, last.file) : null,
              last.sessionId ? h('div', { style: { marginTop: 8 } },
                h('div', { className: 'daris-row' },
                  h(Btn, { label: '复制续聊指令', primary: true, onClick: () => copy(`codex resume ${last.sessionId}`) }),
                  h(Btn, { label: '查看会话', onClick: () => openSession(last.sessionId) }),
                  h('span', { className: 'daris-tag' }, last.sessionId)),
                copied ? h('pre', { className: 'daris-pre', style: { marginTop: 6 } }, copied) : null,
                h('div', { className: 'daris-tag', style: { marginTop: 6 } }, '续聊：复制上面的指令（`codex resume <会话 id>`）即可在 ChatGPT 里打开这条会话继续聊。续聊不占面板的 4 次/小时窗口，仍用你订阅的额度；提示词里的只读规则还在，但写操作不会被拦、也不会进项目审计日志。')) : null,
              h('pre', { className: 'daris-pre', style: { marginTop: 6 } }, String(last.reply || '').slice(0, 1500)))
            : h('div', { className: 'daris-err' }, String(last.error || '')))
        : null;

      const g5 = h(Group, {
        title: '手动派单 · 送哪些文件',
        sub: '一行一个相对路径，支持 * 通配（最多 8 个文件，单文件超 6 万字符会截断并提示）。结果落到 <项目>/.aris/reviews/。',
        badge: manual.running ? '进行中' : '',
      },
        h('div', null,
          h('div', { className: 'daris-row', style: { marginTop: 10 } },
            h('select', { className: 'daris-input', value: root, onChange: (e) => setRoot(e.target.value) },
              h('option', { value: '' }, '选择流水线…'),
              (pipes || []).map((p) => h('option', { key: p.root, value: p.root }, p.name)))),
          h('textarea', { className: 'daris-input', style: { marginTop: 8, width: '100%', minHeight: 64, fontFamily: 'ui-monospace, monospace', fontSize: 12 }, placeholder: '例如：\npaper/main.md\nrefs.bib\ndataset_gen/*.md', value: filesText, onChange: (e) => setFilesText(e.target.value) }),
          h('div', { className: 'daris-row', style: { marginTop: 8 } },
            h('select', { className: 'daris-input', value: taskKey, onChange: (e) => setTaskKey(e.target.value) },
              taskDefs.map((d) => h('option', { key: d.key, value: d.key }, d.label))),
            h(Btn, { label: manual.running ? '正在审…' : '派单', primary: true, success: !manual.running, disabled: busy || manual.running || !root || !filesText.trim(), onClick: () => act('codex.run', { root, files: filesText, task: taskKey }) })),
          manual.running ? h('div', { className: 'daris-tag', style: { marginTop: 8 } }, `进行中：${manual.target} · ${manual.task || '-'} · 起于 ${ft(manual.at)}`) : null,
          lastBlock,
          sessionPanel));

      const recentRows = (codex.recent || []).map((r, i) => h('div', { key: i, className: 'daris-row', style: { marginTop: 6 } },
        h('span', { className: 'daris-tag' }, ft(r.at)),
        h('span', { className: 'daris-tag' }, r.task || r.gate || '-'),
        h('span', { className: 'daris-tag' }, `${r.cliModel || r.model}/${r.effort}`),
        h('span', { className: 'daris-tag' }, r.ok ? 'ok' : 'fail'),
        h('span', { className: 'daris-tag' }, `${r.tokens || 0} tok`),
        h('span', { className: 'daris-tag' }, `${Math.round((r.ms || 0) / 1000)}s`),
        r.sessionId ? h(Btn, { label: '复制续聊指令', onClick: () => copy(`codex resume ${r.sessionId}`) }) : null,
        r.sessionId ? h(Btn, { label: '查看会话', onClick: () => openSession(r.sessionId) }) : null,
        r.ok ? null : h('span', { className: 'daris-err' }, String(r.error || '').slice(0, 120))));

      const g6 = h(Group, {
        title: '最近调用 · 每次谁审的',
        sub: '每条都能「复制续聊指令」，粘到终端执行即在 ChatGPT 里打开该会话；明细在 .dsh/codex-runs.jsonl，事件流在 <项目>/.aris-run/codex/*.events.jsonl。',
        badge: `${(codex.recent || []).length} 条`,
      }, h('div', null, recentRows.length ? recentRows : h('div', { className: 'daris-tag', style: { marginTop: 6 } }, '还没有调用记录。')), sessionPanel);

      const g7 = h(Group, { title: '说明 · 两条不可信与只读三层' },
        h('div', { className: 'daris-sub' }, '模型清单读自本机 codex 的 models_cache.json，钉死的型号消失时会拒单而不是静默回退。模型自报身份不可信（实测 -m gpt-6-luna 却自报 gpt-6.2-sol），以 CLI 会话里的 turn_context.model 为准。只读靠三层：提示词硬规则（软约束）、送审文件隔离副本（物理隔离）、派单后扫命令与文件变更（事后审计）。'));

      return h('div', null, g1, g2, g3, g4, g5, g6, g7);
    }

    function ArisPanel() {
      const [data, setData] = React.useState(null);
      const [err, setErr] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [toast, setToast] = React.useState(null);
      const [tab, setTab] = React.useState('pipes');
      const [newRoot, setNewRoot] = React.useState('');
      // 人工回复草稿：按 root 存，轮询不会清空
      const [humanNotes, setHumanNotes] = React.useState({});
      const setHumanNote = (root, v) => setHumanNotes((prev) => ({ ...prev, [root]: v }));
      const [drawer, setDrawer] = React.useState(null);
      const [kimiMin, setKimiMin] = React.useState('');
      const [kimiStart, setKimiStart] = React.useState('');
      const [evCap, setEvCap] = React.useState('');
      const [form, setForm] = React.useState(null);
      const [wsPaths, setWsPaths] = React.useState([]);
      const [kimiPrompt, setKimiPrompt] = React.useState('');
      const live = React.useRef(true);

      const load = React.useCallback(async () => {
        try {
          const next = await getState();
          if (!live.current) return;
          setData(next);
          setErr(null);
          setForm((prev) => prev || {
            mailbox: (next.settings && next.settings.mailbox) || '',
            model: (next.settings && next.settings.model) || 'deepseek-flash',
            maxConcurrent: String((next.settings && next.settings.maxConcurrent) || 3),
            maxMinutes: String((next.settings && next.settings.maxMinutes) || 120),
          });
          setKimiMin((prev) => prev || String(((next.settings && next.settings.kimi) || {}).intervalMinutes || 30));
          setKimiStart((prev) => prev || String(((next.settings && next.settings.kimi) || {}).startTime || ''));
          setEvCap(String(Number(next.eventsPerCard) || 6));
        } catch (e) {
          if (live.current) setErr(String((e && e.message) || e));
        }
      }, []);

      const loadWorkspaces = React.useCallback(async () => {
        try {
          const res = await post('workspace.list', {});
          if (!live.current) return;
          setWsPaths(((res && res.workspaces) || []).map((w) => String((w && w.path) || '').toLowerCase()));
        } catch (e) {
          // 工作区服务不可用不影响主面板
        }
      }, []);

      React.useEffect(() => {
        live.current = true;
        load();
        loadWorkspaces();
        const t = setInterval(load, 5000);
        return () => {
          live.current = false;
          clearInterval(t);
        };
      }, [load]);

      const ACT_LABEL = { stop: '停用', start: '启用', run: '运行一次', resume: '解除暂停', 'mailbox.collect': '检查回复', recover: '检查恢复', 'runtime.reset': '清空运行记录', 'prompt.reset': '重置提示词', 'human.reply': '提交裁决', 'workspace.register': '添加到工作区', remove: '移除', add: '添加流水线', 'handoff.set': '切换执行权', 'settings.save': '保存设置' };
      const act = React.useCallback(async (name, input) => {
        setBusy(true);
        setToast(null);
        try {
          const res = await post(name, input);
          if (res.dashboard) setData(res.dashboard);
          const label = ACT_LABEL[name] || name;
          if (name === 'stop' && res && res.graceful) setToast('已登记停止：当前会话跑完就会自动停止');
          else if (name === 'stop') setToast('已停用，不会再自动起轮');
          else setToast(`${label} 完成`);
          return res;
        } catch (e) {
          setToast(`${name} 失败：${String((e && e.message) || e)}`);
          return null;
        } finally {
          setBusy(false);
        }
      }, []);

      if (err && !data) {
        return h('div', { className: 'daris' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'daris-toast bad' }, `无法连接插件宿主：${err}`),
          h(Btn, { label: '重试', onClick: load }));
      }
      if (!data) return h('div', { className: 'daris' }, h('style', { dangerouslySetInnerHTML: { __html: CSS } }), '正在读取流水线状态…');

      const s = data.settings || {};
      const bal = data.balance || { level: 'unknown', total: null, warnAt: 10, haltAt: 5 };
      const pipes = data.pipelines || [];
      const mb = data.mailbox || { pending: 0, items: [] };
      const ho = data.handoff || { mode: 'dsh' };
      const kimiWorst = Number(kimiMin) ? `DSH 起跑间隔 ${Number(kimiMin) * 2} 分钟；最坏链路 ≈ ${Number(kimiMin) + 25} 分钟（取件 ${kimiMin} + 审稿 15 + 收件 10）` : '按 15 分钟估算，DSH 起跑间隔 30 分钟';

      const openPrompt = async (root) => {
        setBusy(true);
        try {
          const res = await post('prompt.get', { root });
          setDrawer({ kind: 'prompt', root, text: res.text || '' });
        } catch (e) {
          setToast(String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      };

      const openLogs = async (root) => {
        setBusy(true);
        try {
          const res = await post('logs', { root });
          setDrawer({ kind: 'logs', root, data: res });
        } catch (e) {
          setToast(String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      };

      const openSession = async (p) => {
        setBusy(true);
        try {
          const res = await getSession(p.name, p.lastSessionId, 200);
          setDrawer({ kind: 'session', root: p.root, data: res });
        } catch (e) {
          setToast(String((e && e.message) || e));
        } finally {
          setBusy(false);
        }
      };

      // 会话时间线：左列标签、右列正文；结果行最长 800 字（宿主已截断）。
      const sessLabel = (it) => (it.kind === 'user' ? '提问' : it.kind === 'assistant' ? '助手' : it.kind === 'tool' ? (it.name || '工具') : '结果');
      const sessionEl = (d) => {
        const items = (d && d.items) || [];
        const c = (d && d.counts) || {};
        const meta = [
          `${d ? d.frames : 0} 帧`,
          `${c.tool || 0} 次工具调用`,
          c.failed ? `${c.failed} 次失败` : null,
          d && d.model ? `模型 ${d.model}` : null,
          d && d.truncated ? `只显示最后 ${items.length} 条（共 ${d.total} 条）` : null,
          d && d.brokenFrames ? `跳过 ${d.brokenFrames} 个坏帧（正在写入）` : null,
        ].filter(Boolean).join(' · ');
        return h('div', null,
          h('div', { className: 'daris-sess-meta' }, meta),
          items.length
            ? h('div', { className: 'daris-sess' }, items.map((it, i) => h('div', {
                key: i,
                className: `daris-sess-row ${it.kind}${it.bad ? ' bad' : ''}`,
              },
              h('span', { className: 'daris-sess-k' }, sessLabel(it)),
              h('span', { className: 'daris-sess-t' }, String(it.text || '')))))
            : h('div', { className: 'daris-empty' }, '这个会话里还没有可显示的消息'));
      };

      const loadKimiPrompt = async () => {
        setBusy(true);
        try {
          const res = await post('kimi.prompt', {});
          if (res && res.text) {
            setKimiPrompt(res.text);
            setToast('已生成，可复制或存到文件');
          } else {
            setToast('生成失败：先在上面的设置里填邮箱目录');
          }
        } catch (e) {
          setToast(`生成失败：${String((e && e.message) || e)}`);
        } finally {
          setBusy(false);
        }
      };

      const copyKimiPrompt = () => {
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.clipboard && nav.clipboard.writeText) {
          nav.clipboard.writeText(kimiPrompt)
            .then(() => setToast('已复制到剪贴板'))
            .catch(() => setToast('复制失败，请手动选中文本'));
        } else {
          setToast('当前环境不支持自动复制，请手动选中');
        }
      };

      const saveKimiPrompt = async () => {
        try {
          const res = await post('kimi.prompt', { write: true });
          setToast(res && res.file ? `已写入 ${res.file}` : '写入失败');
        } catch (e) {
          setToast(`写入失败：${String((e && e.message) || e)}`);
        }
      };

      const planText = (p) => {
        if (!p.plan) return '还没有计划数据';
        if (p.driver === 'frrs') {
          const cur = (p.plan.stages || []).find((x) => x.name === p.plan.current);
          const curText = cur ? `${cur.name} ${cur.done}/${cur.total}（${cur.status || '—'}）` : p.plan.current;
          const doneStages = (p.plan.stages || []).filter((x) => x.status === 'done').length;
          return `当前 ${curText} · 已完成 ${doneStages}/${(p.plan.stages || []).length} 个阶段`;
        }
        return `当前阶段 ${p.plan.current || '—'}`;
      };

      function LimitsBox(props) {
        const p = props.p;
        const [runs, setRuns] = React.useState(String((p.limits && p.limits.dailyRuns) || 0));
        const [cny, setCny] = React.useState(String((p.limits && p.limits.dailyCny) || 0));
        const unlimited = !Number(runs) && !Number(cny);
        return h('div', null,
          h('div', { className: 'daris-inline' },
            h('span', { className: 'daris-k' }, '每天最多'),
            h('input', { className: 'daris-input daris-num', value: runs, disabled: unlimited, onChange: (e) => setRuns(e.target.value), title: '每天最多执行几轮，0=不限' }),
            h('span', { className: 'daris-tag' }, '轮 ·'),
            h('input', { className: 'daris-input daris-num', value: cny, disabled: unlimited, onChange: (e) => setCny(e.target.value), title: '每天最多花多少钱，0=不限' }),
            h('span', { className: 'daris-tag' }, '元'),
            h('label', { className: 'daris-check', title: '勾选后不做任何每日限制' },
              h('input', {
                type: 'checkbox',
                checked: unlimited,
                onChange: (e) => { if (e.target.checked) { setRuns('0'); setCny('0'); } },
              }), '不限'),
            h(Btn, {
              label: '保存',
              disabled: props.busy,
              onClick: () => props.act('limits.save', { root: p.root, dailyRuns: Number(runs) || 0, dailyCny: Number(cny) || 0 }),
            })),
          h('div', { className: 'daris-tag', style: { marginTop: 6 } }, `今日已跑 ${p.today ? p.today.runs : 0} 轮 · ${yu(p.today && p.today.cny)}`));
      }

      function HumanBox(props) {
        const p = props.p;
        // 输入内容放在面板层（humanNotes），本组件每轮渲染都会重建，
        // 用局部 useState 会被 5 秒一次的轮询复位成空。
        const text = String((props.notes && props.notes[p.root]) || '');
        const setText = (v) => props.setNote(p.root, v);
        const block = p.plan && p.plan.block ? p.plan.block : null;
        const reason = block ? block.reason : p.blocked || '';
        const hint = block ? block.hint : '';
        const summary = `【${p.name}】${p.stage.stage}${block && block.id ? ` · ${block.id}` : ''}\n原因：${reason || '（未记录）'}${hint ? `\n建议：${hint}` : ''}`;
        const copy = () => {
          const nav = typeof navigator !== 'undefined' ? navigator : null;
          const extra = p.activity && p.activity.text ? p.activity.text : '—';
          if (nav && nav.clipboard) {
            nav.clipboard.writeText(summary + `\n\n本轮上下文：${extra}`)
              .then(() => props.toast('摘要已复制'), () => props.toast('复制失败，请手动选中'));
          } else {
            props.toast('当前环境不支持自动复制');
          }
        };
        return h(Block, { title: '需要人工介入', className: 'human' },
          h('div', { className: 'daris-human-reason' }, reason || '没有记录阻塞原因'),
          hint ? h('div', { className: 'daris-human-hint' }, `建议：${hint}`) : null,
          h('textarea', {
            className: 'daris-input daris-human-input',
            placeholder: '写一句你的裁决或补充信息；下一轮模型会读到它',
            value: text,
            onChange: (e) => setText(e.target.value),
          }),
          h('div', { className: 'daris-inline' },
            h(Btn, { label: '提交并批准重启', primary: true, disabled: props.busy || !text.trim(), onClick: async () => { const r = await props.act('human.reply', { root: p.root, text, restart: true }); if (r && r.ok) setText(''); } }),
            h(Btn, { label: '只留备注', disabled: props.busy || !text.trim(), onClick: async () => { const r = await props.act('human.reply', { root: p.root, text, restart: false }); if (r && r.ok) setText(''); } }),
            h(Btn, { label: '复制摘要另开对话', onClick: copy })));
      }

      const stateOf = (p) => {
        if (p.status === 'error') return { key: 'error', label: '出错', cls: 'st-error' };
        if (p.plan && p.plan.block) return { key: 'human', label: '等待人工', cls: 'st-human' };
        if (p.stage.status === 'blocked_on_user') return { key: 'human', label: '等待人工', cls: 'st-human' };
        if (p.stopping) return { key: 'stopping', label: '停止中', cls: 'st-stopping' };
        if (p.running) return { key: 'run', label: '正在运行', cls: 'st-run' };
        // 停用优先于「等待审核」：停用后即使还有在途审稿，也不该继续显示得像会自动起轮。
        if (!p.enabled) return { key: 'stop', label: '已停止', cls: 'st-stop' };
        if (Number(p.pending) > 0) return { key: 'review', label: '等待审核', cls: 'st-review' };
        return { key: 'idle', label: '待命', cls: 'st-idle' };
      };

      const card = (p) => {
        const st = stateOf(p);
        const last = p.lastRun || null;
        const inWs = wsPaths.indexOf(String(p.root || '').toLowerCase()) >= 0;
        const plan = p.plan || null;
        const items = (plan && plan.items) || [];
        const cap = Number(data.eventsPerCard) || 6;
        const events = (p.events || []).slice().reverse().slice(0, cap);
        const needsHuman = st.key === 'human';
        const waiting = Number(p.pending) > 0;
        const review = p.lastReview || null;
        const reviewLine = review
          ? `${review.verdict || '—'}${review.acceptance ? ` / ${review.acceptance}` : ''}${review.must != null ? ` · MUST ${review.must}` : ''}`
          : '还没有审查记录';
        // 注意：这里必须叫 activity。曾经叫 act，把外层动作分发器 act() 遮住，
        // 卡片里的「停用 / 运行一次 / 检查回复 …」全部抛 TypeError，点了毫无反应。
        const activity = p.activity || null;
        const latest = String((activity && activity.text) || (events[0] && events[0].text) || (last && last.verdict) || '').replace(/\s+/g, ' ').slice(0, 80);
        const row = (k, v) => h('div', { className: 'daris-rowline' }, h('span', { className: 'daris-k' }, k), h('span', { className: 'daris-v' }, v));
        const planFold = plan && plan.stages && plan.stages.length
          ? h(Fold, { key: 'plan', className: 'daris-fold daris-fold-half', label: `计划明细 · ${plan.stages.length} 个阶段` },
            plan.stages.map((sg, i) => h('div', { key: i, className: 'daris-stage-row' },
              h('span', { className: 'daris-badge' }, sg.status === 'done' ? '完成' : sg.status === 'in_progress' ? '进行' : '待办'),
              h('span', { className: 'daris-v' }, sg.name),
              h('span', { className: 'daris-plan-num' }, `${sg.done}/${sg.total}`))),
            items.length
              ? h('div', { style: { marginTop: 8, borderTop: '1px solid rgba(127,127,127,.18)', paddingTop: 6 } },
                items.map((it, i) => h('div', { key: i, className: 'daris-ev-row' },
                  h('span', { className: 'daris-ev-at' }, it.done ? '✔' : '·'),
                  h('span', { className: 'daris-ev-tx' }, it.text))))
              : null)
          : null;
        const eventsFold = events.length
          ? h(Fold, { key: 'events', className: 'daris-fold daris-fold-half', label: `最近事件 · ${events.length} 条` },
            events.map((e, i) => h('div', { key: i, className: 'daris-ev-row' },
              h('span', { className: 'daris-ev-at' }, ft(e.at)),
              h('span', { className: 'daris-ev-tx' }, e.text))))
          : null;
        return h(Pipe, { key: p.root, className: `daris-pipe ${st.cls}`, summary: [
            h('span', { className: 'daris-sum-state' }, st.label),
            p.reviewGap && Number(p.reviewGap.count) >= 2
              ? h('span', { className: 'daris-flag', title: `连续 ${p.reviewGap.count} 轮没有送审（最近一次送审：${p.reviewGap.lastSubmitAt || '无记录'}）` }, `未送审 ${p.reviewGap.count} 轮`)
              : null,
            p.staleReview && p.staleReview.over
              ? h('span', { className: 'daris-flag warn', title: `最oldest在途请求已等待 ${p.staleReview.ageMin} 分钟，超过阈值 ${p.staleReview.limit} 分钟：检查 Kimi 取件任务是否在跑` }, `Kimi 未取件 ${p.staleReview.ageMin} 分钟`)
              : null,
            h('span', { className: 'daris-sum-name' }, p.name),
            latest ? h('span', { className: 'daris-sum-latest', title: latest }, latest) : null,
            h('span', { className: 'daris-tag' }, p.stage.stage || '—'),
            h('span', { className: 'daris-sum-cost' }, `上轮 ${yu(last && last.cny && last.cny.total)}`),
            h('span', { className: 'daris-sum-cost' }, `总计 ${yu(p.totals.cny)}`),
            h('span', { className: 'daris-sum-cost' }, `${p.totals.runs} 轮`),
            p.stopping
              ? h('span', { className: 'daris-when' }, '已登记停止 · 本轮跑完即停')
              : p.enabled && waiting
              ? h('span', { className: 'daris-when' }, `下次运行 ${ft(p.nextAt)}`)
              : (p.enabled && p.nextAt
                ? h('span', { className: 'daris-when', title: p.nextAtBasis === 'quota' ? 'GPT 本小时额度已用完，等到窗口滑出才会起下一轮' : p.nextAtBasis === 'mailbox' ? '在途审稿等 Kimi 取件回件' : '按节拍起下一轮' },
                    `${p.nextAtBasis === 'quota' ? '等 GPT 额度 · ' : p.nextAtBasis === 'mailbox' ? '等 Kimi 取件 · ' : '下次 '}${ft(p.nextAt)}`)
                : null)] },
          h('div', { className: 'daris-body' },
            h('div', { className: 'daris-grid2' },
              h(Block, { title: '正在做什么', extra: p.stopping ? '运行中 · 已登记停止' : p.running ? (activity && activity.phase ? activity.phase : '启动中') : (activity ? '上一轮（已结束）' : '') },
                p.running
                  ? h('div', null,
                    row('模型', activity && activity.model ? activity.model : '—'),
                    row('已运行', activity && activity.elapsedMs ? `${Math.max(1, Math.round(activity.elapsedMs / 60000))} 分钟` : '刚启动'),
                    row('回合', activity && activity.runId ? activity.runId : '—'),
                    p.stopping
                      ? h('div', { className: 'daris-note' }, '已登记停止：当前会话跑完就会自动停止（不中断本轮，避免留下半截提交）。若要立刻停，用下面的「强制停止」。')
                      : null,
                    activity && activity.text
                      ? h('div', { className: 'daris-note' }, activity.text)
                      : h('div', { className: 'daris-sub' }, '已启动，等模型的第一个动作…'))
                  : h('div', null,
                    row('状态', (activity && activity.ended ? '上一轮已结束 · ' : '') + (!p.enabled ? `已停止，不会自动起轮${waiting ? `（在途 ${p.pending} 条审稿，回件也不起轮）` : ''}` : waiting ? `等待审核（在途 ${p.pending} 条）` : st.key === 'human' ? '等待人工裁决' : '上一轮已收尾，等节拍起下一轮')),
                    activity && activity.text ? h('div', { className: 'daris-note' }, activity.text) : null)),
              h(Block, { title: '总计划 · 计划与事件', extra: plan ? `${plan.percent}% · ${plan.done}/${plan.total}` : '—' },
                h('div', { className: 'daris-pct' }, plan ? `${plan.percent}%` : '—'),
                h('div', { className: 'daris-bar' }, h('div', { className: 'daris-bar-fill', style: { width: `${plan ? plan.percent : 0}%` } })),
                h('div', { className: 'daris-tag' }, plan ? `${plan.current} · ${plan.currentStatus || p.stage.stage || ''}` : '没有计划数据'),
                h('div', { className: 'daris-sub' }, '明细与事件在卡片底部，两列并排'))),
            h(Block, { title: '运行数据' },
              h('div', { className: 'daris-facts' },
                h('div', { className: 'daris-fact' }, h('span', { className: 'daris-k' }, '上轮结论'), h('span', { className: 'daris-v' }, last ? `${last.verdict || '已完成'}${last.exit != null ? ` · exit ${last.exit}` : ''}${last.steps ? ` · ${last.steps} 步` : ''}${last.ms ? ` · ${Math.max(1, Math.round(last.ms / 60000))} 分钟` : ''}` : '—')),
                h('div', { className: 'daris-fact' }, h('span', { className: 'daris-k' }, '上轮结束'), h('span', { className: 'daris-v' }, last && (last.finishedAt || last.at) ? `${ft(last.finishedAt || last.at)} · ${yu(last.cny && last.cny.total)} · ${last.usage && last.usage.total ? `${Math.round(last.usage.total / 1000)}k tokens` : '—'}` : '—')),
                h('div', { className: 'daris-fact' }, h('span', { className: 'daris-k' }, '审核结果'), h('span', { className: 'daris-v' }, review
                  ? `${review.verdict || '—'}${review.score != null ? ` ${review.score}/10` : ''}${review.acceptance ? ` · ${review.acceptance}` : ''}${review.must != null ? ` · MUST ${review.must}` : ''} · ${ft(review.at)}${review.scope ? ` · ${review.scope}` : ''}`
                  : '还没有审查记录')),
                h('div', { className: 'daris-fact' }, h('span', { className: 'daris-k' }, '最近会话'), h('span', { className: 'daris-v daris-mono', title: p.lastSessionId || '' }, p.lastSessionId || '—')))),
            h(Block, { title: '操作' },
              h('div', { className: 'daris-inline' },
                p.stage.status === 'paused'
                  ? h(Btn, { label: '解除暂停', primary: true, disabled: busy, onClick: () => act('resume', { root: p.root }) })
                  : null,
                h(Btn, { label: p.running ? '运行中…' : '运行一次', primary: true, disabled: busy || p.running, onClick: () => act('run', { root: p.root }) }),
                p.stopping
                  ? h(Btn, { label: '停止中…', disabled: true })
                  : p.enabled
                  ? h(Btn, { label: '停用', disabled: busy, onClick: () => act('stop', { root: p.root }) })
                  : h(Btn, { label: '启用', success: true, disabled: busy, onClick: () => act('start', { root: p.root }) }),
                p.stopping
                  ? h(Btn, { label: '强制停止', danger: true, title: '立刻杀掉本轮进程（可能留下未提交的改动）', disabled: busy, onClick: () => act('stop', { root: p.root, force: true }) })
                  : null,
                p.stopping
                  ? h(Btn, { label: '取消停止', title: '撤回停止意图：本轮继续跑完，之后照常起下一轮', disabled: busy, onClick: () => act('start', { root: p.root }) })
                  : null,
                h(Btn, { label: '检查回复', disabled: busy, onClick: () => act('mailbox.collect', {}) }),
                h(Btn, { label: '检查恢复', title: '把「运行中但进程已消失」的回合标成中断', disabled: busy, onClick: () => act('recover', {}) }),
                p.running ? null : h(Btn, { label: '清空运行记录', title: '把运行记录、费用台账与进行中标记归档到 .aris-run/history，并清零面板统计', onClick: () => act('runtime.reset', { root: p.root }) }),
                h(Btn, { label: '提示词', onClick: () => openPrompt(p.root) }),
                h(Btn, { label: '重置提示词', onClick: () => act('prompt.reset', { root: p.root }) }),
                h(Btn, { label: '日志', onClick: () => openLogs(p.root) }),
                h(Btn, { label: p.running ? '会话 · 运行中' : '会话', title: p.running ? '这一轮正由独立的 headless 进程持有：可只读查看对话与工具调用，但不要在这里发消息（会和它抢写同一个会话日志）' : '只读查看这一轮 headless 会话的对话与工具调用（不写任何文件）', disabled: busy || !p.lastSessionId, onClick: () => openSession(p) }),
                p.running ? h('span', { className: 'daris-tag run', title: '执行者是独立的 headless DSH 进程；桌面端打开这条会话会按「孤儿轮次」提示「任务已停止」，那是误报' }, '运行中 · headless 持有') : null,
                h(Btn, { label: inWs ? '会话已挂到工作区' : '添加到工作区', title: inWs ? '该根目录已在工作区列表里；点一下把新会话补挂进 second 分组' : '把当前流水线的根目录登记为 DSH 工作区，并把该目录下的会话挂进分组', primary: !inWs, disabled: busy, onClick: async () => { const r = await act('workspace.register', { root: p.root, title: p.name }); if (r) { loadWorkspaces(); setToast(r.created ? '已添加工作区' : '已在工作区，已补挂新会话'); } } }),
                h(Btn, { label: '移除', danger: true, disabled: busy, onClick: () => act('remove', { root: p.root }) }))),
            h(Block, { title: '每日上限' }, h(LimitsBox, { p, busy, act })),
            needsHuman ? h(HumanBox, { p, busy, act, toast: setToast, notes: humanNotes, setNote: setHumanNote }) : null,
            (p.blocked && !needsHuman) || p.lastError
              ? h('div', { className: 'daris-alerts' },
                p.blocked && !needsHuman ? h(Full, { value: `预检：${p.blocked}` }) : null,
                p.lastError ? h(Full, { err: true, value: `最近错误：${String(p.lastError).slice(0, 240)}` }) : null)
              : null,
            h('div', { className: 'daris-path', style: { marginTop: 10 } }, p.root),
            (planFold || eventsFold)
              ? h('div', { className: 'daris-bottom2' }, planFold, eventsFold)
              : null));
      };

      const tabs = h('div', { className: 'daris-tabs' },
        [['pipes', '流水线'], ['artifacts', '产物'], ['review', '审核'], ['settings', '设置']].map(([id, label]) =>
          h('button', { key: id, className: `daris-tab ${tab === id ? 'on' : ''}`, onClick: () => setTab(id) }, label)));

      let body = null;
      if (tab === 'pipes') {
        const humanList = (data.reviews && data.reviews.humanActions) || [];
        body = h('div', null,
          humanList.length
            ? h('div', { className: 'daris-sec' },
              h('div', { className: 'daris-sec-t' }, `需要人处理 · ${humanList.length}`),
              humanList.map((a, i) => h('div', { key: `hm-${i}`, className: 'daris-row', style: { marginTop: 6, flexWrap: 'wrap', alignItems: 'baseline' } },
                h('span', { className: `daris-tag ${a.level === 'bad' ? 'bad' : 'warn'}`.trim() }, a.level === 'bad' ? '人工' : '注意'),
                h('span', { className: 'daris-tag' }, a.name || '-'),
                h('strong', null, a.title),
                a.detail ? h('span', { className: 'daris-sub', style: { flex: '1 1 320px' } }, a.detail) : null,
                a.at ? h('span', { className: 'daris-path' }, ft(a.at)) : null,
                a.file ? h(Btn, { label: '打开清单', onClick: async () => { try { const res = await getArtifactFile(a.name, a.file); setDrawer({ kind: 'file', title: a.title, root: `${a.name}/${a.file}`, text: String((res && res.text) || '（空）') }); } catch (e) { setToast(`打开失败：${String((e && e.message) || e)}`); } } }) : null)))
            : null,
          h('div', { className: 'daris-sec' },
            h('div', { className: 'daris-sec-t' }, '添加流水线'),
            h('div', { className: 'daris-row' },
              h('input', { className: 'daris-input daris-grow', placeholder: '流水线根目录，例如 C:/Users/me/Frrs/second', value: newRoot, onChange: (e) => setNewRoot(e.target.value) }),
              h(Btn, { label: '添加', primary: true, disabled: busy || !newRoot.trim(), onClick: async () => { const r = await act('add', { root: newRoot.trim() }); if (r) setNewRoot(''); } }),
              h('span', { className: 'daris-tag' }, '自动识别 FRRS 或 ARIS 目录'))),
          h('div', { className: 'daris-sec' },
            h('div', { className: 'daris-sec-t' }, `流水线 · ${pipes.length}`),
            pipes.length
              ? h('div', { className: 'daris-blocks' }, pipes.map(card))
              : h('div', { className: 'daris-empty' }, '还没有流水线。填一个根目录，添加后即可在这里启停、看成本。'))
);
      } else if (tab === 'artifacts') {
        body = h(ArtifactsTab, { pipes });
      } else if (tab === 'review') {
        const lock = (data.codex && data.codex.lock) || {};
        const lockTag = lock.locked && !lock.expired
          ? `运行中：${lock.channel} · ${lock.task || '-'} · ${lock.target || '-'}`
          : '当前空闲';
        body = h('div', null,
          h(RouteCard, { codex: data.codex, busy, act, pipes: data.pipelines || [] }),
          h(ReviewResults, { reviews: data.reviews }),
          h(Group, {
            title: '审核锁 · 同一时刻只跑一条',
            sub: 'Kimi 投递占锁、收件解锁；GPT 派单占锁、跑完解锁。锁没放掉之前，另一个通道的派单会被直接拒绝。',
            badge: lockTag,
            defaultOpen: false,
          },
            h('div', null,
              h('div', { className: 'daris-row', style: { marginTop: 8 } },
                h('span', { className: 'daris-tag' }, lockTag),
                lock.locked && !lock.expired && lock.ageMs
                  ? h('span', { className: 'daris-tag' }, `${Math.round(lock.ageMs / 60000)} 分钟前开始`)
                  : null),
              lock.file ? h('div', { className: 'daris-path', style: { marginTop: 6 } }, lock.file) : null)),
          h(Group, {
            title: 'Kimi 邮箱通道 · 投递与取件',
            sub: '子进程把请求写进 in/，Kimi 客户端定时取件作答，回复落 out/，DSH 再收件入账。',
            badge: `待处理 ${mb.pending}`,
            defaultOpen: false,
          },
            h('div', null,
              h('div', { className: 'daris-k', style: { marginTop: 4 } }, '执行权'),
              h('div', { className: 'daris-sub' }, '同一时刻只能有一方执行。交回 Kimi 时会先停掉本机所有流水线，DSH 只保留收件。'),
              h('div', { className: 'daris-row', style: { marginTop: 8 } },
                h(Btn, { label: 'DSH 接管', primary: ho.mode === 'dsh', disabled: busy, onClick: () => act('handoff.set', { mode: 'dsh' }) }),
                h(Btn, { label: '交回 Kimi Work', primary: ho.mode === 'kimi', disabled: busy, onClick: () => act('handoff.set', { mode: 'kimi' }) }),
                h('span', { className: 'daris-tag' }, ho.at ? `最近切换 ${ft(ho.at)}` : '尚未切换过')),
              h('div', { className: 'daris-k', style: { marginTop: 14 } }, `邮箱 · 待处理 ${mb.pending}`),
              h('div', { className: 'daris-path' }, mb.path || '未配置'),
              mb.items && mb.items.length
                ? h('ul', { style: { margin: '8px 0 0 18px', padding: 0 } }, mb.items.map((it, i) => h('li', { key: i }, it.text)))
                : h('div', { className: 'daris-tag', style: { marginTop: 6 } }, mb.exists ? '没有待处理请求' : '邮箱目录不存在'),
              h('div', { className: 'daris-row', style: { marginTop: 8 } },
                h(Btn, { label: '立即收件', disabled: busy, onClick: () => act('mailbox.collect') })),
              h('div', { className: 'daris-k', style: { marginTop: 14 } }, '取件节奏'),
              h('div', { className: 'daris-sub' }, '填 Kimi automation 里实际配置的周期与开始时刻：DSH 按 2 倍周期起跑（保证取件快于生成），并把起跑相位错开半个周期，避免和 Kimi 撞在同一分钟。'),
              h('div', { className: 'daris-row', style: { marginTop: 8 } },
                h('input', { className: 'daris-input daris-num', type: 'number', value: kimiMin, onChange: (e) => setKimiMin(e.target.value) }),
                h('span', { className: 'daris-tag' }, '分钟'),
                h('input', { className: 'daris-input daris-num', type: 'time', step: 60, value: kimiStart, onChange: (e) => setKimiStart(e.target.value) }),
                h('span', { className: 'daris-tag' }, '首次取件时刻'),
                h(Btn, { label: '保存', primary: true, disabled: busy, onClick: () => act('settings.save', { settings: { kimi: { intervalMinutes: Number(kimiMin) || 0, startTime: kimiStart.trim() } } }) })),
              h('div', { className: 'daris-tag', style: { marginTop: 8 } }, kimiWorst),
              h('div', { className: 'daris-k', style: { marginTop: 14 } }, '取件提示词'),
              h('div', { className: 'daris-sub' }, '生成后整段贴进 Kimi Work 的定时任务；邮箱地址与唤醒间隔已按当前设置填好。规则是一轮只取一条，剩下的留到下次唤醒。'),
              h('div', { className: 'daris-row', style: { marginTop: 8 } },
                h(Btn, { label: kimiPrompt ? '重新生成' : '生成提示词', primary: true, disabled: busy, onClick: loadKimiPrompt }),
                kimiPrompt ? h(Btn, { label: '复制', disabled: busy, onClick: copyKimiPrompt }) : null,
                kimiPrompt ? h(Btn, { label: '存到文件', disabled: busy, onClick: saveKimiPrompt }) : null),
              kimiPrompt
                ? h('textarea', { className: 'daris-input', style: { marginTop: 10, minHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12, lineHeight: 1.6 }, value: kimiPrompt, readOnly: true })
                : null)),
          h(GptReviewCards, { codex: data.codex, pipes, busy, act }));
      } else {
        const f = form || { mailbox: '', model: 'deepseek-flash', maxConcurrent: '3', maxMinutes: '120' };
        body = h('div', null,
          h('div', { className: 'daris-card' },
            h('div', { className: 'daris-name' }, '邮箱与运行参数'),
            h('div', { className: 'daris-k', style: { marginTop: 10 } }, '邮箱目录'),
            h('input', { className: 'daris-input daris-grow', value: f.mailbox, onChange: (e) => setForm({ ...f, mailbox: e.target.value }) }),
            h('div', { className: 'daris-k', style: { marginTop: 10 } }, '默认模型'),
            h('select', { className: 'daris-input', value: f.model, onChange: (e) => setForm({ ...f, model: e.target.value }) },
              h('option', { value: 'deepseek-flash' }, 'deepseek-flash'),
              h('option', { value: 'deepseek-v4-pro' }, 'deepseek-v4-pro')),
            h('div', { className: 'daris-row', style: { marginTop: 10 } },
              h('div', null, h('div', { className: 'daris-k' }, '同时运行'), h('input', { className: 'daris-input daris-num', type: 'number', min: 1, value: f.maxConcurrent, onChange: (e) => setForm({ ...f, maxConcurrent: e.target.value }) })),
              h('div', null, h('div', { className: 'daris-k' }, '单轮超时（分钟）'), h('input', { className: 'daris-input daris-num', type: 'number', min: 5, value: f.maxMinutes, onChange: (e) => setForm({ ...f, maxMinutes: e.target.value }) })),
              h('div', null, h('div', { className: 'daris-k' }, '卡片事件条数'), h('input', { className: 'daris-input daris-num', type: 'number', min: 0, max: 30, value: evCap, onChange: (e) => setEvCap(e.target.value) }))),
            h('div', { className: 'daris-row', style: { marginTop: 12 } },
              h(Btn, { label: '保存设置', primary: true, disabled: busy, onClick: () => act('settings.save', { settings: { mailbox: f.mailbox, model: f.model, maxConcurrent: Number(f.maxConcurrent), maxMinutes: Number(f.maxMinutes), eventsPerCard: Number(evCap) || 0 } }) }))),
          h('div', { className: 'daris-card' },
            h('div', { className: 'daris-name' }, '运行环境'),
            h('div', { className: 'daris-kv' },
              h('div', null, h('div', { className: 'daris-k' }, 'DSH 驱动'), h('div', { className: 'daris-v' }, `${data.dsh.kind} · ${data.dsh.file || ''}`)),
              h('div', null, h('div', { className: 'daris-k' }, '工作区'), h('div', { className: 'daris-v daris-path' }, data.workspace)),
              h('div', null, h('div', { className: 'daris-k' }, '注册表'), h('div', { className: 'daris-v daris-path' }, data.registryFile)),
              h('div', null, h('div', { className: 'daris-k' }, '更新于'), h('div', { className: 'daris-v' }, ft(data.at)))),
            h('div', { className: 'daris-tag', style: { marginTop: 8 } }, '后台节拍跑在 DSH 进程里：关掉面板仍在，退出 DSH 才停。')),
          h('div', { className: 'daris-card' },
            h('div', { className: 'daris-name' }, '工作区'),
            h('div', { className: 'daris-sub' }, '登记入口在流水线卡片上：点「添加到工作区」即把该流水线当前根目录挂成 DSH 工作区分组（已登记时按钮变成「会话已挂到工作区」，点一下只补挂新会话）。'),
            wsPaths.length
              ? h('div', { className: 'daris-row', style: { marginTop: 8, gap: 6 } }, wsPaths.map((w, i) =>
                  h('span', { key: i, className: 'daris-tag daris-mono', title: w }, w.split(/[\\/]/).filter(Boolean).pop() || w)))
              : h('div', { className: 'daris-empty', style: { marginTop: 8 } }, '还没有登记工作区。')));
      }

      const drawerEl = drawer
        ? h('div', { className: 'daris-card', style: { marginTop: 16 } },
            h('div', { className: 'daris-row', style: { justifyContent: 'space-between' } },
              h('div', { className: 'daris-name' }, drawer.kind === 'prompt' ? '提示词' : drawer.kind === 'session' ? `会话 · ${(drawer.data && drawer.data.title) || (drawer.data && drawer.data.id) || ''}` : drawer.kind === 'file' ? `文件 · ${drawer.title || ''}` : `日志 · ${(drawer.data && drawer.data.runId) || ''}`),
              h('div', { className: 'daris-row' },
                drawer.kind === 'prompt'
                  ? h(Btn, { label: '保存提示词', primary: true, disabled: busy, onClick: async () => { await act('prompt.set', { root: drawer.root, text: drawer.text }); setDrawer(null); } })
                  : null,
                h(Btn, { label: '关闭', onClick: () => setDrawer(null) }))),
            h('div', { className: 'daris-path', style: { margin: '4px 0 8px' } }, drawer.root),
            drawer.kind === 'prompt'
              ? h('textarea', { className: 'daris-input', value: drawer.text, onChange: (e) => setDrawer({ ...drawer, text: e.target.value }) })
              : drawer.kind === 'file'
              ? h('pre', { className: 'daris-pre', style: { maxHeight: 420 } }, String(drawer.text || '（空）').slice(0, 20000))
              : drawer.kind === 'session'
              ? sessionEl(drawer.data)
              : h('div', null,
                  h('div', { className: 'daris-k' }, '最终输出'),
                  h('pre', { className: 'daris-pre' }, (drawer.data && drawer.data.final) || '（空）'),
                  h('div', { className: 'daris-k', style: { marginTop: 8 } }, 'stderr'),
                  h('pre', { className: 'daris-pre' }, (drawer.data && drawer.data.stderr) || '（空）'),
                  h('div', { className: 'daris-k', style: { marginTop: 8 } }, '事件尾部'),
                  h('pre', { className: 'daris-pre' }, (drawer.data && drawer.data.events) || '（空）')))
        : null;

      return h('div', { className: 'daris' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'daris-head' },
          h('div', null,
            h('h2', null, 'Aris_Dsh'),
            h('div', { className: 'daris-sub' }, `${pipes.length} 条流水线 · ${data.running} 条在跑 · 每 60 秒自动节拍 · 北京时间工作日 9-12 / 14-18 为高峰价，闲时半价`),
            h('div', { className: 'daris-path' }, data.workspace),
            h('div', { className: 'daris-bal' + (bal.level === 'ok' ? '' : ' ' + bal.level) },
              h('span', { className: 'daris-bal-k' }, 'DeepSeek 余额'),
              h('span', { className: 'daris-bal-v' }, bal.total == null ? '未知' : `¥${Number(bal.total).toFixed(2)}`),
              h('span', { className: 'daris-bal-n' },
                bal.total == null
                  ? (bal.error || '')
                  : bal.level === 'halt'
                    ? `低于 ¥${bal.haltAt}：跑完当前轮次后全部暂停`
                    : bal.level === 'warn'
                      ? `低于 ¥${bal.warnAt} 预警`
                      : `低于 ¥${bal.warnAt} 预警 · 低于 ¥${bal.haltAt} 自动暂停`))),
          h('div', { className: 'daris-row' },
            h(Btn, { label: '立即节拍', disabled: busy, onClick: () => act('tick', { force: true }) }),
            h(Btn, { label: '刷新', disabled: busy, onClick: load }),
            h(Btn, { label: `收件（${mb.pending}）`, disabled: busy, onClick: () => act('mailbox.collect') }))),
        toast ? h('div', { className: `daris-toast ${/失败|无法|错误/.test(toast) ? 'bad' : ''}` }, toast) : null,
        tabs,
        body ? h(TabBoundary, { k: tab }, body) : null,
        drawerEl);
    }

    function ArisIcon(props) {
      const size = (props && props.size) || 22;
      const active = Boolean(props && props.active);
      const stroke = active ? 'var(--dsw-alias-brand-primary)' : 'currentColor';
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke,
        strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.72 },
      },
        h('circle', { cx: 4.6, cy: 12, r: 2.4 }),
        h('circle', { cx: 12, cy: 12, r: 2.4 }),
        h('circle', { cx: 19.4, cy: 12, r: 2.4 }),
        h('path', { d: 'M7 12h2.6M14.4 12H17' }),
        h('path', { d: 'M12 4.6v2.4', opacity: 0.75 }),
        h('path', { d: 'M12 17v2.4', opacity: 0.75 }));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        let tr = (key) => (key === 'title' ? '流水线' : key);
        try {
          const bound = ctx.locale.bind(NS);
          if (typeof bound === 'function') tr = (key) => bound(key) || (key === 'title' ? '流水线' : key);
        } catch {
          /* keep fallback */
        }
        ctx.slots.inject('main', () =>
          ctx.slots.inject('sidebar.panellist', () => {
            const stopIcon = ctx.slots.register(
              { name: 'sidebar.panellist', id: 'aris', order: 20, label: () => 'Aris_Dsh', locale: NS },
              (props) => h(ArisIcon, props),
            );
            const stopPanel = ctx.slots.register({ name: 'main', key: 'aris', locale: NS }, () => h(ArisPanel));
            return () => {
              try { stopPanel && stopPanel(); } catch { /* ignore */ }
              try { stopIcon && stopIcon(); } catch { /* ignore */ }
            };
          }));
      },
    };
  },
});
