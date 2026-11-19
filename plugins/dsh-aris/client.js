window.__ModuleLoader__.load({
  id: '@local/dsh-aris',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-aris';
    const HEAD = { 'x-dsh-aris': '1' };
    const POST_HEAD = { 'x-dsh-aris': '1', 'content-type': 'application/json' };

    const CSS2 = `
.daris2-scope{display:block;padding:7px 16px;border-bottom:1px solid var(--ln);color:var(--tx2)}.daris2-scope select{min-height:32px;height:auto;padding:3px 8px;font:inherit}.daris2-daily{display:grid;grid-template-columns:minmax(65px,1fr) 2fr auto;gap:8px;align-items:center;padding:5px 0}.daris2-daily button{overflow-wrap:anywhere;text-align:left}.daris2-daily i{display:block;height:12px;background:var(--a);border-radius:3px}.daris2-card-h small{margin-left:auto;color:var(--tx2)}

/* ── ARIS 面板 v2（设计稿 mock2 的 m-* → daris2-*） ─────────────────
   宿主侧栏实际可用宽度 380–900px：所有栅格都走 auto-fit/minmax，
   表格一律外层横滚 + 表头/首列 sticky，两栏窄屏自动堆成单列。 */
.daris.daris2{
  --a:var(--dsw-alias-brand-primary,#2563eb);
  --a-bg:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 11%,transparent);
  --ln:rgba(127,127,127,.20);--ln2:rgba(127,127,127,.34);
  --mut:rgba(127,127,127,.95);--sel:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 7%,transparent);
  /* 文本三级 + 横幅字色：逐条对照 mock2/mock.css 的 --tx / --tx-2 / --tx-3 与横幅色 */
  --tx:#111318;--tx2:#5a6270;--tx3:#8b929e;
  --tint-warn:#8a5206;--tint-err:#9a1c15;--tint-info:#31459b;--tint-danger:#8a2018;--tint-pre:#3f4550;
  /* 状态徽标：--st-run/--st-warn/--st-err/--st-ok/--st-idle + 各自底色 */
  --st-run:#2563eb;--st-run-bg:#eaf1ff;
  --st-warn:#b45309;--st-warn-bg:#fef4e6;
  --st-err:#c6231b;--st-err-bg:#fdeceb;
  --st-ok:#157f3d;--st-ok-bg:#e9f7ee;
  --st-idle:#6b7280;--st-idle-bg:#f1f2f4;
  padding:0;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;font-size:13px;line-height:1.55;
}
body[data-ds-dark-theme] .daris.daris2{
  --tx:#e6e9ef;--tx2:#9aa3b2;--tx3:#6b7482;
  --tint-warn:#e8b566;--tint-err:#ff9b90;--tint-info:#a9bcff;--tint-danger:#ff9b90;--tint-pre:#b7bdc8;
  --st-run:#6f9dff;--st-run-bg:#16233c;
  --st-warn:#e8a33d;--st-warn-bg:#2e2415;
  --st-err:#ff7a6b;--st-err-bg:#331a18;
  --st-ok:#4ec98a;--st-ok-bg:#13291e;
  --st-idle:#8b93a1;--st-idle-bg:#1c2027;
}
body[data-ds-dark-theme] table.daris2-tbl th{color:var(--tx2)}
.daris2-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:14px 20px 12px;flex:none;border-bottom:1px solid var(--ln)}
.daris2-head-main{flex:1 1 220px;min-width:0}
.daris2-title{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}
.dari2-linkish{border:0;background:none;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
  .daris2-fresh{color:var(--tx3);font-size:11.5px;font-variant-numeric:tabular-nums}
.daris2-subtitle{display:flex;align-items:center;gap:4px 8px;flex-wrap:wrap;margin-top:3px;font-size:11.5px;color:var(--tx3)}
.daris2-subtitle .sep{opacity:.4}
.daris2-subtitle .bal{font-variant-numeric:tabular-nums}
.daris2-subtitle .bal.warn{color:var(--dsw-alias-state-warn-primary,#b45309)}
.daris2-subtitle .bal.halt{color:var(--dsw-alias-state-error-primary,#b42318)}
.daris2-head-actions{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.daris2-head-actions .daris-btn{font-size:12px;line-height:18px;padding:4px 9px;border-radius:7px}

.daris2-tabs{display:flex;gap:2px;padding:0 14px;margin:0;border-bottom:1px solid var(--ln);overflow-x:auto;flex:none;background:var(--dsw-alias-bg-base,#fff)}
.daris2-tab{display:inline-flex;align-items:center;gap:6px;padding:9px 12px 10px;font:inherit;font-size:12.5px;color:var(--tx2);background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;white-space:nowrap}
.daris2-tab:hover{color:var(--tx)}
.daris2-tab.on{color:var(--tx);font-weight:600;border-bottom-color:var(--a)}
.daris2-cnt{font-size:10.5px;font-weight:500;min-width:16px;text-align:center;padding:0 5px;border-radius:20px;background:rgba(127,127,127,.12);color:var(--tx3);font-variant-numeric:tabular-nums}
.daris2-tab.on .daris2-cnt{background:var(--a-bg);color:var(--a)}
.daris2-body{padding:16px 20px 40px;flex:1 1 auto;min-height:0;overflow:auto}
.daris2-body.arts{padding-top:12px;display:flex;flex-direction:column}

/* KPI */
.daris2-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));border:1px solid var(--ln);border-radius:12px;overflow:hidden;margin:10px 0 12px;background:var(--dsw-alias-bg-base,#fff)}
.daris2-kpi{padding:11px 14px 12px;border-right:1px solid var(--ln);min-width:0}
.daris2-kpi:last-child{border-right:0}
.daris2-kpi-k{font-size:11px;color:var(--tx3);display:flex;align-items:center;gap:4px}
.daris2-kpi-v{font-size:19px;font-weight:600;line-height:1.3;margin-top:2px;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--tx)}
.daris2-kpi-u{font-size:11.5px;font-weight:400;color:var(--tx3);margin-left:2px}
.daris2-kpi-x{font-size:11px;color:var(--tx3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.daris2-kpi.is-run .daris2-kpi-v{color:var(--dsw-alias-brand-primary,#2563eb)}
.daris2-kpi.is-warn .daris2-kpi-v{color:var(--dsw-alias-state-warn-primary,#b45309)}
.daris2-kpi.is-err .daris2-kpi-v{color:var(--dsw-alias-state-error-primary,#b42318)}
.daris2-kpi.is-ok .daris2-kpi-v{color:var(--dsw-alias-state-success-primary,#18794e)}
.daris2-kpi.is-dim .daris2-kpi-v{color:var(--tx3)}

/* 工具条 / chips / 搜索 */
.daris2-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 9px}
.daris2-toolbar .grow{flex:1}
.daris2-chips{display:flex;gap:6px;flex-wrap:wrap}
.daris2-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border:1px solid var(--ln);border-radius:999px;background:var(--dsw-alias-bg-base,#fff);color:var(--tx2);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
.daris2-chip:hover{border-color:var(--ln2)}
.daris2-chip.on{background:var(--a-bg);border-color:color-mix(in srgb,var(--a) 40%,transparent);color:var(--a);font-weight:600}
.daris2-chip .n{opacity:.8;font-variant-numeric:tabular-nums}
.daris2-search{margin-left:auto;min-width:150px;flex:0 1 230px}
.daris2-seg{display:inline-flex;border:1px solid var(--ln2);border-radius:7px;overflow:hidden}
.daris2-seg button{padding:0 10px;height:26px;font:inherit;font-size:12px;color:var(--tx2);background:transparent;border:0;cursor:pointer}
.daris2-seg button+button{border-left:1px solid var(--ln)}
.daris2-seg button.on{background:var(--a-bg);color:var(--a);font-weight:600}

/* 状态 */
.daris2-badge{display:inline-flex;align-items:center;gap:5px;height:21px;padding:0 7px;border-radius:6px;font-size:11.5px;font-weight:500;white-space:nowrap;background:rgba(127,127,127,.12);color:var(--tx2)}
.daris2-badge i{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.daris2-badge.run{color:var(--st-run);background:var(--st-run-bg)}
.daris2-badge.review{color:var(--st-run);background:var(--st-run-bg)}
.daris2-badge.human,.daris2-badge.error{color:var(--st-err);background:var(--st-err-bg)}
.daris2-badge.stopping,.daris2-badge.warn,.daris2-badge.quota{color:var(--st-warn);background:var(--st-warn-bg)}
.daris2-badge.idle,.daris2-badge.stop{color:var(--st-idle);background:var(--st-idle-bg)}
.daris2-tag{display:inline-flex;align-items:center;height:18px;padding:0 5px;border-radius:5px;font-size:10.5px;background:rgba(127,127,127,.12);color:var(--tx2);font-variant-numeric:tabular-nums;white-space:nowrap}
.daris2-tag.pri{background:var(--a-bg);color:var(--a)}
.daris2-tag.must{background:var(--bg-sub,var(--dsw-alias-bg-layer-2,#f5f6f8));box-shadow:inset 0 0 0 1px var(--ln);font-weight:500;font-size:11px;height:19px}
.daris2-tag.ok{color:var(--dsw-alias-state-success-primary,#18794e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 12%,transparent)}
.daris2-tag.warn{color:var(--dsw-alias-state-warn-primary,#b45309);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 12%,transparent)}
.daris2-tag.bad{color:var(--dsw-alias-state-error-primary,#b42318);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 11%,transparent)}
.daris2-band{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 12px;border-radius:10px;margin:10px 0;font-size:12.5px;border:1px solid}
.daris2-quota-band{margin:0 0 10px;align-items:flex-start}
.daris2-quota-note{color:var(--tx2)}
.daris2-band.warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 8%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 30%,transparent);color:var(--tint-warn)}
.daris2-band.err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 8%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 30%,transparent);color:var(--tint-err)}
.daris2-band.info{background:var(--a-bg);border-color:color-mix(in srgb,var(--a) 30%,transparent);color:var(--tint-info)}
.daris2-band b{white-space:nowrap}

/* 表格 */
.daris2-tblwrap{overflow:auto;border:1px solid var(--ln);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);position:relative}
table.daris2-tbl{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;font-size:12.5px}
table.daris2-tbl th{position:sticky;top:0;z-index:3;text-align:left;font-weight:500;font-size:11px;letter-spacing:.02em;color:var(--tx3);padding:8px 10px;border-bottom:1px solid var(--ln);white-space:nowrap;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 92%,rgba(127,127,127,.5))}
table.daris2-tbl th.num,table.daris2-tbl td.num{text-align:right}
table.daris2-tbl td{height:40px;padding:0 10px;border-bottom:1px solid rgba(127,127,127,.13);vertical-align:middle;white-space:nowrap;color:var(--tx2)}
table.daris2-tbl tbody tr:last-child td{border-bottom:0}
table.daris2-tbl tbody tr.row{cursor:pointer}
table.daris2-tbl tbody tr.row:hover td{background:rgba(127,127,127,.055)}
table.daris2-tbl tbody tr.row.open td{background:var(--sel)}
table.daris2-tbl tbody tr.row.open td:first-child{box-shadow:inset 2px 0 0 var(--a)}
table.daris2-tbl td:first-child,table.daris2-tbl th:first-child{position:sticky;left:0;z-index:2;background:var(--dsw-alias-bg-base,#fff);box-shadow:1px 0 0 var(--ln)}
table.daris2-tbl th:first-child{z-index:4;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 92%,rgba(127,127,127,.5))}
table.daris2-tbl tbody tr.row.open td:first-child{background:var(--sel)}
.daris2-cell2{display:flex;flex-direction:column;line-height:1.35}
.daris2-cell2 .s{font-size:11px;color:var(--tx3);overflow:hidden;text-overflow:ellipsis;max-width:240px}
.daris2-name{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--tx)}
.daris2-name .drv{font-size:10.5px;font-weight:400;color:var(--tx3)}
.daris2-now{font-weight:500;max-width:320px;overflow:hidden;text-overflow:ellipsis}
.daris2-now-s{font-size:11px;color:var(--tx3);max-width:320px;overflow:hidden;text-overflow:ellipsis}
.daris2-rail{display:flex;gap:2px;margin-top:4px;max-width:150px}
.daris2-rail i{display:block;height:3px;flex:1;border-radius:2px;background:rgba(127,127,127,.22)}
.daris2-rail i.done{background:rgba(127,127,127,.55)}
.daris2-rail i.cur{background:var(--a)}
.daris2-empty{padding:24px;text-align:center;color:var(--tx3);font-size:12px}
.daris2-hint{display:none;font-size:11px;color:var(--tx3);margin:6px 0}
@media (max-width:900px){.daris2-hint{display:block}}

/* 行详情（表格下方 / 展开行） */
.daris2-detail{margin-top:10px;border:1px solid color-mix(in srgb,var(--a) 28%,transparent);border-radius:12px;background:color-mix(in srgb,var(--a) 3%,transparent);overflow:hidden}
.daris2-detail-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid color-mix(in srgb,var(--a) 18%,transparent);font-size:12.5px}
.daris2-detail-h b{font-size:12.5px}
.daris2-detail-b{padding:12px}
.daris2-detail-empty{margin-top:10px;border:1px dashed var(--ln2);border-radius:12px;padding:10px 12px;font-size:11.5px;color:var(--tx3);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.daris2-dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px 18px;align-items:start}
.daris2-rail{position:sticky;top:-4px;align-self:start;order:9;max-height:calc(100vh - 180px);overflow:auto;padding-right:2px}
.daris2-col{min-width:0;display:flex;flex-direction:column;gap:6px}
.daris2-col>h5{margin:0;font-size:11px;font-weight:600;letter-spacing:.03em;color:var(--tx3);text-transform:none}
.daris2-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 10px;font-size:12px;margin:0}
.daris2-kv dt{color:var(--tx3);white-space:nowrap}
.daris2-kv dd{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--tx2)}
.daris2-kv dd strong{font-weight:600;color:var(--tx)}
.daris2-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px 14px}
.daris2-fact{min-width:0;display:flex;flex-direction:column;gap:1px}
.daris2-fact .k{font-size:11px;color:var(--tx3)}
.daris2-fact .v{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-note{margin-top:4px;padding:6px 8px;border-radius:7px;background:rgba(127,127,127,.07);font-size:11.5px;line-height:1.6;color:var(--tx3);white-space:pre-wrap;max-height:150px;overflow:auto}
.daris2-prog{height:4px;border-radius:3px;background:rgba(127,127,127,.2);overflow:hidden;margin:2px 0 2px}
.daris2-prog>i{display:block;height:100%;background:var(--a);border-radius:3px}

/* 阶段树 */
.daris2-tree{display:flex;flex-direction:column;gap:1px;font-size:12px}
.daris2-trow{position:relative;display:flex;align-items:center;gap:7px;height:24px;padding-left:2px}
.daris2-tree,.daris2-tree ul{list-style:none;margin:0;padding:0}
.daris2-tree ul{margin-inline-start:6px;padding-inline-start:16px;border-inline-start:1px solid var(--ln)}
.daris2-tree ul>li{position:relative}
.daris2-tree ul>li::before{content:"";position:absolute;inset-inline-start:-16px;top:11px;width:12px;border-top:1px solid var(--ln)}
.daris2-tree summary{cursor:pointer}
.daris2-tree summary::before{content:'▸';color:var(--tx3)}
.daris2-tree details[open]>summary::before{content:'▾'}
.daris2-tree .daris2-tree-item{display:flex;align-items:baseline;gap:8px;padding:3px 2px;overflow-wrap:anywhere}
.daris2-tree-item small{margin-inline-start:auto;white-space:nowrap;color:var(--tx3)}
.daris2-tdot{width:7px;height:7px;border-radius:50%;flex:none;background:rgba(127,127,127,.45);box-shadow:0 0 0 2.5px var(--dsw-alias-bg-base,#fff)}
.daris2-tdot.done{background:var(--dsw-alias-state-success-primary,#18794e)}
.daris2-tdot.cur{background:var(--a);box-shadow:0 0 0 2.5px var(--dsw-alias-bg-base,#fff),0 0 0 5px var(--a-bg)}
.daris2-tdot.err{background:var(--dsw-alias-state-error-primary,#b42318)}
.daris2-trow b{font-weight:500;color:var(--tx);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-trow .tmeta{margin-left:auto;font-size:10.5px;color:var(--tx3);white-space:nowrap}
.daris2-todo{margin:2px 0 0;padding-left:16px;font-size:11.5px;color:var(--tx3)}

/* 图 */
.daris2-chart{display:flex;gap:8px;align-items:stretch;margin-top:4px}
.daris2-yaxis{width:44px;flex:none;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;font-size:9.5px;color:var(--tx3);padding-bottom:14px;font-variant-numeric:tabular-nums}
.daris2-barswrap{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden}
.daris2-bars{position:relative;display:flex;align-items:flex-end;gap:3px;min-width:100%;border-bottom:1px solid var(--ln);background-image:linear-gradient(to top,var(--ln) 1px,transparent 1px);background-size:100% 25%}
.daris2-bcol{flex:1 1 auto;min-width:10px;max-width:44px;align-self:stretch;display:flex;align-items:flex-end;justify-content:center;position:relative}
.daris2-bcol i{display:block;width:100%;border-radius:2px 2px 0 0;background:var(--a);opacity:.9}
.daris2-bcol i.warn{background:var(--dsw-alias-state-warn-primary,#b45309)}
.daris2-bcol i.err{background:var(--dsw-alias-state-error-primary,#b42318)}
.daris2-bcol span{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;font-size:9px;color:var(--tx3);white-space:nowrap}
.daris2-avg{position:absolute;left:0;right:0;border-top:1px dashed var(--dsw-alias-state-warn-primary,#b45309);opacity:.75;pointer-events:none}
.daris2-avg b{position:absolute;right:0;top:-13px;font-size:9px;font-weight:500;color:var(--dsw-alias-state-warn-primary,#b45309);background:var(--dsw-alias-bg-base,#fff);padding:0 3px}
.daris2-sum{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;font-size:11px;color:var(--tx3)}
.daris2-pie{display:flex;gap:12px;align-items:flex-start}
.daris2-pie svg{flex:none}
.daris2-lgbox{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.daris2-lg{display:grid;grid-template-columns:8px minmax(0,1fr) auto 34px;align-items:center;gap:8px;padding:3px 0;border-bottom:1px dashed var(--ln);font-size:11.5px}
.daris2-lg:last-child{border-bottom:0}
.daris2-lg i{width:8px;height:8px;border-radius:2px}
.daris2-lg .t{color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-lg b{color:var(--tx);text-align:right;font-variant-numeric:tabular-nums}
.daris2-lg .pc{color:var(--tx3);text-align:right;font-size:11px}
.daris2-piewrap{display:grid;grid-template-columns:132px minmax(0,1fr);gap:16px;align-items:start}

/* 操作分级 */
.daris2-tier{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:6px 0 0}
.daris2-tier .grp{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;padding-right:9px;margin-right:1px;border-right:1px solid var(--ln)}
.daris2-tier .grp:last-child{border-right:0;padding-right:0}
.daris2-lv{font-size:10px;letter-spacing:.04em;color:var(--tx3);border:1px solid var(--ln2);border-radius:6px;padding:1px 5px;white-space:nowrap}
.daris2-lv.l3{color:var(--dsw-alias-state-error-primary,#b42318);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 45%,transparent)}
.daris2-danger{border:1px dashed color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 40%,transparent);border-radius:10px;padding:8px 10px;margin-top:8px}
.daris2-confirm{display:flex;align-items:center;gap:10px;margin-top:8px;padding:7px 10px;border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 9%,transparent);border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 32%,transparent);font-size:12px;color:var(--tint-warn)}
.daris2-confirm.danger{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 8%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 32%,transparent);color:var(--tint-err)}
.daris2-confirm .sp{flex:1}

/* 折叠（一级 / 二级） */
.daris2-fold{border:1px solid var(--ln);border-radius:10px;margin:10px 0 0;overflow:hidden;background:var(--dsw-alias-bg-base,#fff)}
.daris2-fold-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;cursor:pointer;user-select:none;font-size:12.5px;font-weight:600;color:var(--tx)}
.daris2-fold-h:hover{background:rgba(127,127,127,.05)}
.daris2-fold.open .daris2-fold-h{border-bottom:1px solid var(--ln)}
.daris2-fold-b{display:none;padding:12px}
.daris2-fold.open .daris2-fold-b{display:block}
.daris2-fold-h .sp{flex:1}
.daris2-caret{flex:none;width:14px;display:inline-flex;justify-content:center;font-size:10px;color:var(--tx3);transition:transform .15s;transform:rotate(-90deg)}
.daris2-fold.open>.daris2-fold-h>.daris2-caret,.daris2-sub.open>.daris2-sub-h>.daris2-caret{transform:rotate(0)}
.daris2-sub{border:1px solid var(--ln);border-radius:8px;margin-top:8px;background:var(--dsw-alias-bg-base,#fff)}
.daris2-sub:first-of-type{margin-top:0}
.daris2-fold-b>.daris2-sub+.daris2-sub{margin-top:8px}
.daris2-sub-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;cursor:pointer;user-select:none;border-radius:8px}
.daris2-sub-h:hover{background:rgba(127,127,127,.05)}
.daris2-sub-h h4{color:var(--tx);margin:0;font-size:12.5px;font-weight:600}
.daris2-tree-done-h{list-style:none;margin:6px 0 2px;font-size:11px;color:var(--tx3)}
.daris2-tree-item.done span{color:var(--tx3)}
.daris2-tree-item.done small{opacity:.85}
.daris2-plan-grp{margin-top:12px}
.daris2-plan-grp:first-child{margin-top:2px}
.daris2-plan-grp .daris2-sub-h{margin:0 0 4px;align-items:center}
.daris2-plan-grp .daris2-sub-h h4{color:var(--tx)}
.daris2-plan-grp .daris2-plantbl{margin-top:2px}
.daris2-done-grp{margin:6px 0 2px;padding-left:10px;border-left:2px solid var(--ln)}
.daris2-done-h{font-size:11.5px;color:var(--tx3);margin:0 0 2px}
.daris2-donetbl td{color:var(--tx3)!important}
.daris2-donetbl td.tx{text-decoration:none}
.daris2-sub-h .meta{font-size:11.5px;color:var(--tx3);font-weight:400}
.daris2-sub.open>.daris2-sub-h{border-bottom:1px solid var(--ln);border-radius:8px 8px 0 0}
.daris2-sub-b{display:none;padding:10px 12px 12px}
.daris2-sub.open>.daris2-sub-b{display:block}
.daris2-fold .daris2-fold{margin-top:8px;border-radius:8px}
.daris2-fold .daris2-fold-b{padding:10px}
.daris2-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;align-items:start}
.daris2-field{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px dashed var(--ln)}
.daris2-field:last-child{border-bottom:0}
.daris2-field>label{flex:0 0 96px;font-size:11.5px;color:var(--tx3)}
.daris2-field .ctl{flex:1 1 180px;min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.daris2-field .ctl>input,.daris2-field .ctl>select{flex:1 1 120px;min-width:0}
.daris2-fieldtbl{border:1px solid var(--ln);border-radius:10px;padding:4px 12px;background:var(--dsw-alias-bg-base,#fff)}

/* 产物：左右分栏 + 预览 */
.daris2-split{display:flex;align-items:stretch;gap:0;flex:1 1 auto;min-height:0;margin-top:8px}
.daris2-arts-page{display:flex;flex-direction:column;flex:1 1 auto;min-height:100%}
.daris2-arts-left{flex:0 0 var(--lw,340px);min-width:0;min-height:0;border:1px solid var(--ln);border-radius:12px;overflow:auto;background:var(--dsw-alias-bg-base,#fff)}
.daris2-arts-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}
.daris2-arts-tbl th{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 92%,rgba(127,127,127,.5));text-align:left;font-weight:500;font-size:10.5px;color:var(--tx3);padding:7px 9px;border-bottom:1px solid var(--ln);white-space:nowrap}
.daris2-arts-tbl td{padding:6px 9px;border-bottom:1px solid rgba(127,127,127,.11);white-space:nowrap;vertical-align:middle;color:var(--tx2)}
.daris2-arts-tbl tr.f{cursor:pointer}
.daris2-arts-tbl tr.f:hover td{background:rgba(127,127,127,.06)}
.daris2-arts-tbl tr.f.on td{background:var(--sel)}
.daris2-arts-tbl tr.grp td{position:sticky;top:27px;z-index:1;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 80%,rgba(127,127,127,.14));font-size:10.5px;font-weight:600;color:var(--tx3);letter-spacing:.03em;padding:4px 9px}
.daris2-arts-tbl .nm{max-width:170px;overflow:hidden;text-overflow:ellipsis}
.daris2-arts-tbl .sz,.daris2-arts-tbl .tm{font-size:10.5px;color:var(--tx3);font-variant-numeric:tabular-nums;text-align:right}
.daris2-split-bar{position:relative;flex:0 0 6px;align-self:stretch;cursor:col-resize;touch-action:none;border-radius:3px}
.daris2-split-bar::before{content:'';position:absolute;left:2px;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--ln2)}
.daris2-split-bar:hover::before,.daris2-split-bar.on::before{background:var(--a);width:3px}
.daris2-split-bar::after{content:'';position:absolute;left:-4px;right:-4px;top:0;bottom:0}
.daris2-arts-right{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column}
.daris2-prev{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;border:1px solid var(--ln);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
.daris2-prev.empty{border-style:dashed}
.daris2-prev-h{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid var(--ln);font-size:12.5px;font-weight:600}
.daris2-prev-h .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-prev-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 11px 0;font-size:11.5px;color:var(--tx3)}
.daris2-prev-path{padding:5px 11px 8px;font-size:11px;color:var(--tx3);word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.daris2-prev-empty{padding:44px 16px;text-align:center;font-size:12.5px;color:var(--tx3);line-height:1.9}
.daris2-prev-text{margin:0;padding:10px 12px 12px;flex:1 1 auto;min-height:0;max-height:none;overflow:auto;font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:11.5px;line-height:1.65;color:var(--tint-pre);white-space:pre-wrap;word-break:break-word}
.daris2-prev-text .ln{display:block;height:7px;border-radius:3px;background:rgba(127,127,127,.22);margin-bottom:7px}
.daris2-prev-img{display:block;max-width:100%;max-height:100%;object-fit:contain;margin:10px auto}
.daris2-prev-pdf{width:100%;flex:1 1 auto;min-height:320px;height:auto;border:0;display:block}
.daris2-prev-page{padding:12px}
.daris2-prev-page-in{border:1px solid var(--ln);border-radius:8px;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px;color:var(--tx3);background:rgba(127,127,127,.04)}
.daris2-prev-f{display:flex;gap:6px;flex-wrap:wrap;padding:8px 11px 11px;border-top:1px solid var(--ln)}
.daris2-main{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid color-mix(in srgb,var(--a) 32%,transparent);border-left:3px solid var(--a);border-radius:10px;padding:9px 12px;margin:8px 0 10px}
.daris2-main.empty{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 34%,transparent);border-left-color:var(--dsw-alias-state-warn-primary,#b45309)}
.daris2-main-l{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 260px}
.daris2-main-k{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--tx3)}
.daris2-main-n{font-size:13.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-main-m{font-size:11px;color:var(--tx3);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-main-r{display:flex;gap:6px;flex-wrap:wrap}
.daris2-audit{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.daris2-build{margin-top:6px;font-size:12.5px;padding:8px 10px;border-radius:8px;background:rgba(127,127,127,.06)}
.daris2-build.ok{color:var(--dsw-alias-state-success-primary,#18794e)}
.daris2-build.bad{color:var(--dsw-alias-state-error-primary,#b42318)}

/* 审核 */
.daris2-gate{border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 32%,transparent);border-left:3px solid var(--dsw-alias-state-error-primary,#b42318);border-radius:10px;margin:10px 0;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 4%,transparent)}
.daris2-gate-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 20%,transparent)}
.daris2-gate-h b{font-size:12.5px}
.daris2-gate-b{padding:10px 12px 12px}
.daris2-gate-reason{font-size:12.5px;line-height:1.7;color:var(--tint-danger)}
.daris2-gate-advice{margin-top:4px;font-size:12px;line-height:1.7;color:var(--tx2)}
.daris2-gate-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
.daris2-ta{box-sizing:border-box;width:100%;max-width:100%;display:block;margin-top:7px;padding:7px 9px;border:1px solid var(--ln2);border-radius:8px;background:rgba(127,127,127,.05);color:inherit;font:inherit;font-size:12.5px;line-height:1.65;min-height:64px;resize:vertical}
.daris2-ta.mono{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:11px}
.daris2-charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px}
.daris2-card{border:1px solid var(--ln);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
.daris2-card-h{display:flex;align-items:center;gap:8px;padding:8px 11px;border-bottom:1px solid var(--ln);font-size:12px;font-weight:600;color:var(--tx)}
.daris2-card-b{padding:10px 11px}
.daris2-sec{margin:14px 0 0}
.daris2-sec-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
.daris2-sec-h h3{margin:0;font-size:12.5px;font-weight:600}
.daris2-sec-h .meta{font-size:11.5px;color:var(--tx3);font-variant-numeric:tabular-nums}
.daris2-sec-h .sp{flex:1}
.daris2-flow{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--tx3);line-height:1.65}
.daris2-flow code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;padding:0 3px;border-radius:4px;background:rgba(127,127,127,.12)}
.daris2-tblwrap.compact table.daris2-tbl{min-width:760px}

/* 窄屏 */
@media (max-width:900px){
  .daris2-head{padding:12px 14px 10px}
  .daris2-tabs{padding:0 14px}
  .daris2-head-actions{margin-left:0;width:100%}
  .daris2-body{padding:12px 14px 32px}
  .daris2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .daris2-kpi:nth-child(2n){border-right:0}
  .daris2-kpi{border-bottom:1px solid var(--ln)}
  .daris2-search{margin-left:0;width:100%;flex:1 1 100%}
  .daris2-split{display:flex;flex-direction:column;gap:10px}
  .daris2-split-bar{display:none}
  .daris2-arts-left{width:100%!important;flex:0 0 auto;max-height:300px}
  .daris2-arts-right{width:100%;min-height:0}
  .daris2-piewrap{grid-template-columns:110px minmax(0,1fr);gap:12px}
  .daris2-now,.daris2-now-s{max-width:200px}
}
@media (max-width:560px){
  .daris2-kpis{grid-template-columns:minmax(0,1fr)}
  .daris2-kpi{border-right:0}
  .daris2-piewrap{grid-template-columns:minmax(0,1fr)}
  .daris2-piewrap svg{margin:0 auto}
}
/* ===== mock2 parity 2026-11-19：详情两栏 / 折叠卡 / 图表 / 审核筛选 ===== */
.daris2-cols{display:flex;gap:12px;align-items:flex-start}
.daris2-cols>.daris2-colmain{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:10px}
.daris2-cols>.daris2-colside{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:10px;position:sticky;top:0}
.daris2-pane{border:1px solid var(--ln);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);overflow:hidden}
.daris2-pane-h{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;user-select:none;font-size:12.5px;font-weight:600;color:var(--tx);line-height:1.5}
.daris2-pane-h:hover{background:rgba(127,127,127,.05)}
.daris2-pane-h .meta{font-size:11.5px;font-weight:400;color:var(--tx3);font-variant-numeric:tabular-nums;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-pane-h .sp{flex:1}
.daris2-pane-h .daris2-caret{color:var(--tx3);font-size:10px;transition:transform .14s}
.daris2-pane.open .daris2-pane-h{border-bottom:1px solid var(--ln)}
.daris2-pane-b{padding:11px 12px;font-size:12.5px;color:var(--tx2)}
.daris2-pane-b>.daris2-kv{margin-top:2px}
.daris2-pipehead{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--ln);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);margin-bottom:8px;flex-wrap:wrap}
.daris2-pipename{font-size:13.5px;font-weight:600;color:var(--tx)}
.daris2-chip2{font-size:11px;color:var(--tx2);background:rgba(127,127,127,.10);border-radius:6px;padding:1px 6px;line-height:1.6}
.daris2-pipemeta{display:flex;align-items:center;flex-wrap:wrap;gap:12px;font-size:11.5px;color:var(--tx3);padding:0 2px 10px}
.daris2-pipemeta b{color:var(--tx2);font-weight:600;font-variant-numeric:tabular-nums}
.daris2-pipeprog{display:flex;gap:3px;flex:0 1 260px;min-width:120px}
.daris2-pipeprog i{flex:1;height:4px;border-radius:2px;background:rgba(127,127,127,.22)}
.daris2-pipeprog i.done{background:#157f3d}
.daris2-pipeprog i.cur{background:var(--a)}
.daris2-path{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--tx3);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.daris2-plantbl{width:100%;border-collapse:collapse;font-size:12px}
.daris2-plantbl td{padding:6px 4px;border-bottom:1px solid rgba(127,127,127,.14);color:var(--tx2)}
.daris2-plantbl tr:last-child td{border-bottom:0}
.daris2-plantbl .st{width:56px;color:var(--tx3);font-size:11px}
.daris2-plantbl .tx{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0}
.daris2-verdict{font-size:11.5px;font-weight:500}
.daris2-verdict.ok{color:#157f3d}
.daris2-verdict.warn{color:#b45309}
.daris2-verdict.err{color:#b42318}
.daris2-verdict.run{color:var(--a)}
body[data-ds-dark-theme] .daris2-verdict.ok{color:#57c98a}
body[data-ds-dark-theme] .daris2-verdict.warn{color:#e8b566}
body[data-ds-dark-theme] .daris2-verdict.err{color:#ff9b90}
.daris2-backline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-4px 0 12px}
.daris2-link{font:inherit;font-size:12px;color:var(--a);background:none;border:0;padding:0;cursor:pointer}
.daris2-link:hover{text-decoration:underline}
.daris2-chartbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 10px}
.daris2-chartbar .daris2-tag{margin-left:auto}
.daris2-btabs{display:flex;gap:5px;margin:0 0 10px}
.daris2-btabs .daris2-chip{height:22px;padding:0 10px}
.daris2-chartx{display:flex;gap:8px;align-items:stretch}
.daris2-chartx .yax{width:46px;flex:none;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;font-size:9.5px;color:var(--tx3);padding-bottom:14px;font-variant-numeric:tabular-nums}
.daris2-chartx .wrap{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden}
.daris2-chartx .bars{height:186px;position:relative;display:flex;align-items:flex-end;gap:3px;min-width:100%;border-bottom:1px solid var(--ln);background-image:linear-gradient(to top,var(--ln) 1px,transparent 1px);background-size:100% 25%}
.daris2-chartx .bc{flex:1 1 auto;min-width:14px;max-width:56px;height:100%;display:flex;align-items:flex-end;justify-content:center;position:relative;padding-bottom:13px;box-sizing:border-box}
.daris2-chartx .bc i{display:block;width:100%;border-radius:2px 2px 0 0;background:var(--a)}
.daris2-chartx .bc i.ok{background:#157f3d}
.daris2-chartx .bc i.warn{background:var(--dsw-alias-state-warn-primary,#b45309)}
.daris2-chartx .bc i.err{background:var(--dsw-alias-state-error-primary,#b42318)}
.daris2-chartx .bc span{position:absolute;bottom:0;left:50%;transform:translateX(-50%);font-size:9px;line-height:11px;color:var(--tx3);white-space:nowrap;font-variant-numeric:tabular-nums}
.daris2-chartx .avg{position:absolute;left:0;right:0;border-top:1px dashed var(--dsw-alias-state-warn-primary,#b45309);opacity:.75;pointer-events:none}
.daris2-chartx .avg b{position:absolute;right:0;top:-13px;font-size:9px;font-weight:500;color:var(--dsw-alias-state-warn-primary,#b45309);background:var(--dsw-alias-bg-base,#fff);padding:0 3px}
.daris2-chart-sum{display:flex;align-items:center;gap:12px;margin-top:20px;font-size:11px;color:var(--tx3);flex-wrap:wrap;font-variant-numeric:tabular-nums}
.daris2-chart-sum b{color:var(--tx);font-weight:600}
.daris2-detail .daris2-facts{grid-template-columns:1fr 1fr;gap:9px 12px}
.daris2-detail .daris2-fact .v{color:var(--tx)}
.daris2-detail .daris2-note{color:var(--tx2);background:rgba(127,127,127,.06)}
.daris2-detail .daris2-tree{gap:0}
.daris2-detail .daris2-trow{height:23px}
.daris2-detail .daris2-lgtbl{width:100%;border-collapse:separate;border-spacing:0;font-size:11.5px}
.daris2-detail .daris2-lgtbl th{text-align:left;font-weight:500;color:var(--tx3);padding:4px 6px;border-bottom:1px solid var(--ln);white-space:nowrap;font-size:10.5px}
.daris2-detail .daris2-lgtbl td{padding:5px 6px;border-bottom:1px solid rgba(127,127,127,.10);color:var(--tx2);white-space:nowrap}
.daris2-detail .daris2-lgtbl tr:last-child td{border-bottom:0}
.daris2-detail .daris2-lgtbl td.num{text-align:right;font-variant-numeric:tabular-nums}
@media (max-width:1100px){
  .daris2-cols{flex-wrap:wrap}
  .daris2-cols>.daris2-colmain,.daris2-cols>.daris2-colside{flex:1 1 100%}
  .daris2-cols>.daris2-colside{position:static;flex:1 1 100%}
}
@media (max-width:560px){
  .daris2-chartx .yax{width:38px}
  .daris2-detail .daris2-facts{grid-template-columns:1fr}
}
`;

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
.daris-pipe.st-stopping{border-left:3px solid var(--dsw-alias-state-warn-primary,#b45309)}
.st-stopping .daris-sum-state{color:var(--dsw-alias-state-warn-primary,#b45309);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b45309) 14%,transparent)}
.st-stopping .daris-sum-state::before{background:var(--dsw-alias-state-warn-primary,#b45309)}
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

.daris-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;border:1px solid var(--dsw-alias-border-l2,#dcdfe5);background:var(--dsw-alias-bg-base,#fff);color:var(--tx2,#5a6270);font:inherit;font-size:12px;line-height:1;padding:0 10px;border-radius:8px;white-space:nowrap}
.daris-btn:hover{border-color:#c8cdd6;background:var(--dsw-alias-bg-base,#fff);color:var(--tx,#111318)}
.daris-btn:disabled{opacity:.45;cursor:default}
.daris-btn.primary{border-color:var(--dsw-alias-brand-primary,#4d6bfe);background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;font-weight:500}
.daris-btn.primary:hover{border-color:#3f5bea;background:#3f5bea;color:#fff}
.daris-btn.danger{color:var(--dsw-alias-state-error-primary,#c6231b);border-color:#f0c9c6}
.daris-btn.danger:hover{background:#fdeceb;border-color:#e5a9a4;color:var(--dsw-alias-state-error-primary,#c6231b)}
.daris-btn.success{color:var(--dsw-alias-state-success-primary,#18794e);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 12%,transparent);font-weight:600}
.daris-btn.success:hover{border-color:var(--dsw-alias-state-success-primary,#18794e);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#18794e) 18%,transparent)}
.daris-input{box-sizing:border-box;height:28px;border:1px solid var(--dsw-alias-border-l2,#dcdfe5);border-radius:6px;padding:0 9px;font:inherit;font-size:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--tx,#111318)}
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
.daris-fold>summary::before{content:'▸';font-size:10px;opacity:.55;transition:transform .15s}
.daris-fold[open]>summary::before{content:'▾'}
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
.daris-tag.warn{color:var(--dsw-alias-state-warn-primary,#b45309);border-color:currentColor;opacity:.95}
.daris-tag.run{color:var(--dsw-alias-state-warn-primary,#b26a00);border-color:currentColor;opacity:.9;align-self:center}
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
    const hhmm = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    // 缓存类读数（余额、GPT 额度）不是每秒探测的：给出「多久之前」，过期时明确写「可能过期」。
    const fresh = (o) => {
      if (!o) return '';
      const t = o.at ? new Date(o.at).getTime() : NaN;
      const min = Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : (o.ageMinutes != null ? Math.max(0, Math.round(Number(o.ageMinutes) || 0)) : NaN);
      if (!Number.isFinite(min)) return '';
      const age = min < 1 ? '刚刚' : min < 60 ? `${min} 分钟前` : `${Math.round(min / 60)} 小时前`;
      return ` · ${age}${o.stale ? ' · 可能过期' : ''}`;
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
      const [toast, setToast] = React.useState('');

      // 左右分栏宽度：拖动分隔条调整，双击复位；跨刷新记在 localStorage 里。
      // 面板窄于 900px 时 CSS 直接把它折成单列，这里只负责宽屏下的像素宽度。
      const artRef = React.useRef(null);
      const [split, setSplit] = React.useState(() => {
        try {
          const v = parseInt(window.localStorage.getItem('daris2-arts-split') || '', 10);
          return v >= 180 ? v : 340;
        } catch (e) { return 340; }
      });
      const [dragging, setDragging] = React.useState(false);
      React.useEffect(() => { try { window.localStorage.setItem('daris2-arts-split', String(split)); } catch (e) {} }, [split]);
      const onSplitDown = (e) => {
        const box = artRef.current;
        if (!box) return;
        e.preventDefault();
        try { if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
        const boxW = box.clientWidth, x0 = e.clientX, w0 = split;
        setDragging(true);
        const move = (ev) => {
          const max = Math.max(220, boxW - 260);
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

      const fileTicket=React.useRef(0);
      const open = async (f) => {
        const ticket=++fileTicket.current;
        setFileErr(''); setFile({ rel: f.rel, pending: true, name: f.name, size: f.size, mtime: f.mtime });
        try { const d = await getArtifactFile(pick, f.rel); if(ticket!==fileTicket.current)return; setFile({ rel: f.rel, name: f.name, size: f.size, mtime: f.mtime, ...d }); }
        catch (e) { if(ticket!==fileTicket.current)return; setFile({ rel: f.rel, name: f.name, size: f.size, mtime: f.mtime }); setFileErr(String((e && e.message) || e)); }
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

      const absOf = (f) => {
        if (!f) return '';
        if (f.abs) return f.abs;
        const root = data && data.root ? String(data.root).replace(/[\\/]+$/, '') : '';
        return root ? `${root}/${f.rel}` : String(f.rel || '');
      };

      // 预览里的「打开原文件」：能拿到字节就造 blob URL 新标签打开，否则退回复制路径。
      const openRaw = () => {
        if (!file || file.pending) return;
        try {
          if (file.dataUrl) {
            const i = file.dataUrl.indexOf(',');
            const head = file.dataUrl.slice(0, i);
            const body = file.dataUrl.slice(i + 1);
            const bin = /;base64/i.test(head) ? atob(body) : decodeURIComponent(body);
            const arr = new Uint8Array(bin.length);
            for (let k = 0; k < bin.length; k += 1) arr[k] = bin.charCodeAt(k) & 255;
            const url = window.URL.createObjectURL(new window.Blob([arr], { type: file.mime || 'application/octet-stream' }));
            window.open(url, '_blank', 'noopener');
            return;
          }
          copyText(absOf(file));
          setToast('没有可打开的字节，已复制路径');
        } catch (e) { setToast('打开失败：' + String((e && e.message) || e)); }
      };

      const head = h('div', { className: 'daris2-toolbar' },
        props.scope ? h('strong', null, pick) : h('select', { className: 'daris-input', value: pick, onChange: (e) => setPick(e.target.value) },
          pipes.length ? pipes.map((p) => h('option', { key: p.name, value: p.name }, `${p.name}（${p.driver}）`)) : h('option', { value: '' }, '没有流水线')),
        h(Btn, { label: loading ? '扫描中…' : '刷新', disabled: loading || !pick, onClick: () => load(pick) }),
        h(Btn, { label: busy ? '编译中…' : '编译论文', primary: true, disabled: busy || !pick, onClick: compile }),
        h('span', { className: 'daris2-tag' }, data ? `共 ${totals.files} 个文件 · ${kb(totals.bytes)} · 扫描于 ${ft(data.generatedAt)}` : (loading ? '正在扫描…' : '选一条流水线')));

      const hero = h('div', { className: 'daris2-main' + (mainPdf ? '' : ' empty') },
        h('div', { className: 'daris2-main-l' },
          h('div', { className: 'daris2-main-k' }, '主论文'),
          h('div', { className: 'daris2-main-n', title: mainPdf ? mainPdf.rel : '' },
            mainPdf ? `${mainPdf.label ? mainPdf.label + ' · ' : ''}${mainPdf.name || mainPdf.rel}` : (data ? '还没有 main.pdf' : '选一条流水线')),
          h('div', { className: 'daris2-main-m' },
            mainPdf
              ? `${kb(mainPdf.size)} · 生成于 ${ft(mainPdf.mtime)}`
              : (data ? '点右侧「编译论文」生成；EN 稿含中文占位时会失败（U+3010）' : ''))),
        h('div', { className: 'daris2-main-r' },
          mainPdf ? h(Btn, { label: '打开 PDF', primary: true, onClick: () => open(mainPdf) }) : null,
          mainTexRel ? h(Btn, { label: '看源码', onClick: () => open({ rel: mainTexRel, name: mainTexRel.split('/').pop() }) }) : null,
          h(Btn, { label: busy ? '编译中…' : '编译论文', primary: !mainPdf, disabled: busy || !pick, onClick: compile })));

      const chips = data
        ? h('div', { className: 'daris2-chips', style: { margin: '8px 0' } },
          h('button', { className: 'daris2-chip' + (group === '' ? ' on' : ''), onClick: () => setGroup('') }, '全部', h('span', { className: 'n' }, totals.files)),
          groups.map((g) => h('button', { key: g.id, className: 'daris2-chip' + (group === g.id ? ' on' : ''), onClick: () => setGroup(g.id) }, g.label, h('span', { className: 'n' }, g.count))))
        : null;

      const auditBar = audit
        ? h('div', { className: 'daris2-audit' },
          h('span', { className: 'daris2-tag' }, `章节 ${(audit.chapters || []).length}`),
          h('span', { className: 'daris2-tag' + ((audit.emptyChapters || []).length ? ' bad' : '') }, `空章 ${(audit.emptyChapters || []).length}`),
          h('span', { className: 'daris2-tag' }, `图 ${audit.figures || 0}`),
          h('span', { className: 'daris2-tag' + ((audit.missing || []).length ? ' bad' : '') }, `缺图 ${(audit.missing || []).length}`),
          h('span', { className: 'daris2-tag' }, `未被引用 ${(audit.unused || []).length}`))
        : null;

      const buildBox = build
        ? h('div', { className: `daris2-build ${build.ok ? 'ok' : 'bad'}` },
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
        : null;

      // 左侧：按分类分组的文件表（限高内滚，表头吸顶，点行选中）。
      let rowCount = 0;
      const rows = [];
      shown.forEach((g) => {
        if (!g.count) return;
        rows.push(h('tr', { key: 'g-' + g.id, className: 'grp' }, h('td', { colSpan: 3 }, `${g.label} · ${g.count}`)));
        g.files.slice(0, 200).forEach((f) => {
          if (rowCount >= 400) return;
          rowCount += 1;
          rows.push(h('tr', {
            key: f.rel,
            className: 'f' + (file && file.rel === f.rel ? ' on' : ''),
            title: f.rel,
            onClick: () => open(f),
          },
          h('td', { className: 'nm' }, f.name || f.rel),
          h('td', { className: 'sz' }, kb(f.size)),
          h('td', { className: 'tm' }, ft(f.mtime))));
        });
      });
      const left = h('div', { className: 'daris2-arts-left' },
        err ? h('div', { className: 'daris-err', style: { padding: 10 } }, err) : null,
        (!data && !err && !loading) ? h('div', { className: 'daris2-empty' }, '还没有扫描结果。') : null,
        (data && !rows.length) ? h('div', { className: 'daris2-empty' }, '这个分类下没有文件。') : null,
        rows.length
          ? h('table', { className: 'daris2-arts-tbl' },
            h('thead', null, h('tr', null, h('th', null, '文件'), h('th', { style: { textAlign: 'right' } }, '大小'), h('th', { style: { textAlign: 'right' } }, '修改'))),
            h('tbody', null, rows))
          : null,
        data && data.warnings && data.warnings.length
          ? h('div', { className: 'daris2-tag', style: { margin: 8 } }, data.warnings.slice(0, 3).join('；'))
          : null,
        rowCount >= 400 ? h('div', { className: 'daris2-tag', style: { margin: 8 } }, '只显示前 400 个文件') : null);

      // 右侧：预览卡（文件名 / 大小 / 时间 / 路径 + 文本或图片/PDF + 两个动作）。
      let preview = null;
      if (!file) {
        preview = h('div', { className: 'daris2-prev empty' },
          h('div', { className: 'daris2-prev-empty' }, '点左侧文件在此预览。', h('br'), '文本直接读，图片与 PDF 走 /file 的字节流。'));
      } else {
        const fname = file.name || String(file.rel || '').split('/').pop();
        const ext = (String(fname).match(/\.([a-z0-9]+)$/i) || [])[1];
        let inner = null;
        if (file.pending) inner = h('div', { className: 'daris2-prev-page' }, h('div', { className: 'daris2-prev-page-in' }, '读取中…'));
        else if (fileErr) inner = h('div', { className: 'daris2-prev-page' }, h('div', { className: 'daris-err' }, fileErr));
        else if (file.error) inner = h('div', { className: 'daris2-prev-page' }, h('div', { className: 'daris-err' }, file.error));
        else if (file.text != null) {
          inner = file.text
            ? h('pre', { className: 'daris2-prev-text' }, String(file.text).slice(0, 40000))
            : h('div', { className: 'daris2-prev-text' }, [0, 1, 2, 3, 4, 5].map((i) => h('span', { key: i, className: 'ln', style: { width: `${92 - i * 7}%` } })));
        } else if (file.dataUrl && /^image\//.test(file.mime || '')) {
          inner = h('div', { className: 'daris2-prev-page' }, h('img', { className: 'daris2-prev-img', src: file.dataUrl, alt: fname }));
        } else if (file.dataUrl && file.mime === 'application/pdf') {
          inner = h('iframe', { className: 'daris2-prev-pdf', src: file.dataUrl, title: fname });
        } else {
          inner = h('div', { className: 'daris2-prev-page' }, h('div', { className: 'daris2-prev-page-in' },
            h('span', null, ext ? `.${ext} 不支持内嵌预览` : '这个文件不支持预览'),
            h('span', { className: 'daris2-tag' }, '可用「打开原文件」交给系统应用')));
        }
        preview = h('div', { className: 'daris2-prev' },
          h('div', { className: 'daris2-prev-h' },
            h('span', { className: 'nm', title: fname }, fname),
            ext ? h('span', { className: 'daris2-tag pri' }, ext.toUpperCase()) : null,
            h('span', { className: 'sp', style: { flex: 1 } }),
            h(Btn, { label: '打开原文件', primary: true, onClick: openRaw }),
            h(Btn, { label: '复制路径', onClick: () => { copyText(absOf(file)); setToast('已复制文件路径'); } })),
          h('div', { className: 'daris2-prev-meta' },
            h('span', null, kb(file.size || 0)),
            h('span', null, ft(file.mtime)),
            file.truncated ? h('span', { className: 'daris2-tag warn' }, '已截断') : null),
          h('div', { className: 'daris2-prev-path' }, absOf(file)),
          inner);
      }

      return h('div', { className: 'daris2-arts-page' },
        head,
        hero,
        chips,
        auditBar,
        buildBox,
        h('div', { className: 'daris2-hint' }, '窄屏下分栏自动折成上下两段。'),
        h('div', {
          className: 'daris2-split' + (dragging ? ' dragging' : ''),
          ref: artRef,
          style: { '--lw': split + 'px' },
        },
        left,
        h('div', {
          className: 'daris2-split-bar' + (dragging ? ' on' : ''),
          title: '拖动调整宽度 · 双击复位',
          onPointerDown: onSplitDown,
          onDoubleClick: () => setSplit(340),
        }),
        h('div', { className: 'daris2-arts-right' }, preview)),
        toast ? h('div', { className: 'daris-toast' }, toast) : null);
    }
    const previewLayout = `
.daris2 .daris2-review-summary .daris2-charts{margin:0;gap:0}
.daris2 .daris2-review-summary .daris2-charts>.daris2-card{border:0;border-radius:0}
.daris2 .daris2-review-summary .daris2-pie svg{width:70px;height:70px}
.daris2 .daris2-review-summary .daris2-kpis{margin:0;gap:0;border-top:1px solid var(--ln)}
.daris2 .daris2-colside{position:static}
.daris2 .daris2-fieldtbl>summary{padding:10px 14px;cursor:pointer;font-weight:600}
body[data-ds-dark-theme] .daris select{color-scheme:dark}
body[data-ds-dark-theme] .daris.daris2 .daris-btn.primary{
  background:var(--a-bg);color:var(--tx);border-color:var(--a)
}

@media(max-width:520px){.daris2 .daris2-charts{grid-template-columns:minmax(0,1fr)}}
`;
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
    const VERD_LABEL = { accept: '通过', revise: '需修改', reject: '退回', unknown: '未知' };
    // 最新一份审稿的 MUST / SHOULD 条数（两种审稿 md 写法都在后端归一）
    const mustOf = (g) => {
      const m = Number((g && g.mustCount) || 0);
      const sh = Number((g && g.shouldCount) || 0);
      if (!m && !sh) return '';
      return 'MUST ' + m + ' · SHOULD ' + sh;
    };
    const CH_LABEL = { kimi: 'Kimi', gpt: 'GPT', human: '人工', other: '其他' };

    function ReviewResults(props) {
      const rv = props.reviews || {};
      const groups = rv.groups || [];
      const [verd, setVerd] = React.useState('all');
      const [ch, setCh] = React.useState('all');
      const [q, setQ] = React.useState('');
      const [open, setOpen] = React.useState([]);
      const [texts, setTexts] = React.useState({});
      const [loading, setLoading] = React.useState('');

      const norm = (g) => {
        const v = String((g.latest && g.latest.verdict) || '').toLowerCase();
        if (/accept|pass|通过|接收/.test(v)) return 'accept';
        if (/reject|退回|拒/.test(v)) return 'reject';
        if (/revise|修改|大修|小修/.test(v)) return 'revise';
        return 'unknown';
      };
      const chan = (g) => {
        const c = String((g.latest && g.latest.channel) || '').toLowerCase();
        return c || 'other';
      };
      const by = rv.byLatest || {};
      const cnt = { accept: by.accept || 0, revise: by.revise || 0, reject: by.reject || 0, unknown: by.unknown || 0 };
      if (!by.accept && !by.revise && !by.reject && !by.unknown) groups.forEach((g) => { cnt[norm(g)] += 1; });

      const needle = q.trim().toLowerCase();
      const pipe = props.pipe || '';
      const rows = groups.filter((g) => (!pipe || String(g.name) === pipe)
        && (verd === 'all' || norm(g) === verd)
        && (ch === 'all' || chan(g) === ch)
        && (!needle || [g.name, g.scope, g.project, g.latest && g.latest.name, g.latest && g.latest.model, g.latest && g.latest.summary]
          .filter(Boolean).join(' ').toLowerCase().includes(needle)));

      const openText = async (g) => {
        const l = g.latest || {};
        if (!l.mdRel && !l.rel) return;
        const key = g.key || g.name;
        setLoading(key);
        try {
          const d = await getArtifactFile(g.name, l.mdRel || l.rel);
          setTexts((prev) => ({ ...prev, [key]: String((d && d.text) || '（空）') }));
        } catch (e) {
          setTexts((prev) => ({ ...prev, [key]: '读取失败：' + String((e && e.message) || e) }));
        } finally { setLoading(''); }
      };

      const chips = h('div', { className: 'daris2-chips' },
        [['all', '全部', groups.length], ['accept', '通过', cnt.accept], ['revise', '需修改', cnt.revise], ['reject', '退回', cnt.reject], ['unknown', '未知', cnt.unknown]]
          .map(([id, label, n]) => h('button', { key: id, className: 'daris2-chip' + (verd === id ? ' on' : ''), onClick: () => setVerd(id) }, label, h('span', { className: 'n' }, n))),
        h('span', { style: { width: 6 } }),
        [['all', '全部通道'], ['kimi', 'Kimi'], ['gpt', 'GPT']].map(([id, label]) =>
          h('button', { key: 'c-' + id, className: 'daris2-chip' + (ch === id ? ' on' : ''), onClick: () => setCh(id) }, label)));

      const bodyRows = [];
      rows.forEach((g) => {
        const key = g.key || g.name;
        const l = g.latest || {};
        const isOpen = open.includes(key);
        const v = norm(g);
        const rounds = Number(g.rounds || g.historyCount || 0);
        bodyRows.push(h('tr', { key, className: 'row' + (isOpen ? ' open' : ''), onClick: () => setOpen((prev)=>prev.includes(key)?prev.filter(k=>k!==key):prev.concat(key)) },
          h('td', null, h('div', { className: 'daris2-cell2' },
            h('span', { style: { fontWeight: 600 } }, g.name || g.project || '—'),
            h('span', { className: 's' }, g.scope || (g.project && g.project !== g.name ? g.project : '')))),
          h('td', null, h('div', { className: 'daris2-cell2' },
            h('span', null, (l.name && l.name !== g.name) ? l.name : (g.scope || l.name || key)),
            h('span', { className: 's' }, `${rounds ? '第 ' + rounds + ' 轮' : '第 1 轮'}${g.historyCount > 1 ? ' · 历史 ' + (g.historyCount - 1) + ' 轮' : ''}`))),
          h('td', null, h('span', { className: 'daris2-badge ' + (v === 'accept' ? 'run' : v === 'reject' ? 'error' : v === 'revise' ? 'stopping' : 'idle') }, VERD_LABEL[v] || '未知'),
            l.acceptance ? h('div', { className: 'daris2-cell2' }, h('span', { className: 's' }, l.acceptance)) : null,
            mustOf(g) ? h('div', { style: { marginTop: 4 } }, h('span', { className: 'daris2-tag must' }, mustOf(g))) : null),
          h('td', { className: 'num' }, l.score != null ? h('span', null, l.score, h('span', { className: 's', style: { fontSize: 11, color: 'var(--tx3)' } }, '/10')) : '—'),
          h('td', null, h('div', { className: 'daris2-cell2' },
            h('span', null, CH_LABEL[chan(g)] || chan(g)),
            h('span', { className: 's' }, l.model || '—'))),
          h('td', null, ft(l.at)),
          h('td', null, h('span', { className: 'daris2-now-s', title: l.summary || '' }, String(l.summary || '—').replace(/\s+/g, ' ').slice(0, 90)))));
        if (!isOpen) return;
        bodyRows.push(h('tr', { key: key + '-x', className: 'xr' }, h('td', { colSpan: 7 },
          h('div', { style: { padding: '4px 2px 10px' } },
            (g.must && g.must.length)
              ? h('div', null, h('div', { className: 'daris-sub' }, `MUST ${Number(g.mustCount || g.must.length)} 条 · SHOULD ${Number(g.shouldCount || 0)} 条`),
                h('ul', { className: 'daris-err-list', style: { margin: '4px 0 8px 18px' } }, g.must.slice(0, 8).map((m, i) => h('li', { key: i }, String(m)))))
              : null,
            (g.history && g.history.length)
              ? h('div', null, h('div', { className: 'daris-sub' }, `历史 · ${g.history.length} 轮`),
                h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 } }, g.history.slice(0, 12).map((x, i) =>
                  h('span', { key: i, className: 'daris2-tag' }, `第 ${x.round != null ? x.round : i + 1} 轮 · ${VERD_LABEL[String(x.verdict || '').toLowerCase()] || x.verdict || '—'}${x.score != null ? ' ' + x.score : ''}`))))
              : null,
            h('div', { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } },
              h(Btn, { label: loading === key ? '读取中…' : '看全文', disabled: loading === key, onClick: (e) => { e.stopPropagation(); openText(g); } }),
              h(Btn, { label: '复制摘要', onClick: (e) => { e.stopPropagation(); copyText(`${g.name || ''} ${l.name || ''}\n${l.verdict || ''} ${l.score != null ? l.score + '/10' : ''}\n${l.summary || ''}`); } })),
            texts[key] ? h('pre', { className: 'daris-pre', style: { maxHeight: 320, marginTop: 8 } }, texts[key].slice(0, 30000)) : null))));
      });

      return h('div', null,
        h('div', { className: 'daris2-toolbar' }, chips,
          h(Btn,{label:'全部展开',onClick:()=>setOpen(rows.map(g=>g.key||g.name))}),h(Btn,{label:'全部折叠',onClick:()=>setOpen([])}),
          h('input', { className: 'daris-input daris2-search', placeholder: '搜索流水线 / 稿件 / 模型', value: q, onChange: (e) => setQ(e.target.value) })),
        h('div', { className: 'daris2-tblwrap compact' },
          h('table', { className: 'daris2-tbl' },
            h('thead', null, h('tr', null,
              ['流水线', '稿件', '结论', '分数', '通道 · 模型', '时间', '摘要'].map((t, i) =>
                h('th', { key: i, className: i === 3 ? 'num' : '' }, t)))),
            h('tbody', null, bodyRows.length ? bodyRows : h('tr', null, h('td', { colSpan: 7 },
              h('div', { className: 'daris2-empty' }, (needle || verd !== 'all' || ch !== 'all') ? '没有符合筛选的审核记录。' : '还没有审核记录。')))))));
    }
    function RouteCard(props) {
      const { codex, busy, act, pipes, force } = props;
      const runningPipes = (pipes || []).filter((p) => p && p.running).map((p) => p.name);
      const locked = runningPipes.length > 0;
      const route = (codex && codex.route) || { channel: 'auto', options: [] };
      const opts = route.options && route.options.length ? route.options : [
        { value: 'auto', label: '自动（谁先占锁谁跑）', hint: '' },
        { value: 'kimi', label: 'Kimi 邮箱', hint: '' },
        { value: 'gpt', label: 'GPT 外审', hint: '' },
      ];
      const cur = opts.find((o) => o.value === route.channel) || opts[0];
      return h(Fold, {
        title: '审核线路 · 这一轮走哪条通道',
        sub: '选定后另一条通道的派单/投递会被直接拒绝；两条都开放就是「自动」，靠审核单飞锁互斥。',
        badge: cur.label,
        force: force,
        defaultOpen: false,
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
      const { codex, pipes, busy, act, force } = props;
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

      const g1 = h(Sub, {
        force: force,
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

      const g2 = h(Sub, {
        force: force,
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

      const g3 = h(Sub, {
        force: force,
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

      const g4 = h(Sub, {
        force: force,
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

      const g5 = h(Sub, {
        force: force,
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

      const g6 = h(Sub, {
        force: force,
        title: '最近调用 · 每次谁审的',
        sub: '每条都能「复制续聊指令」，粘到终端执行即在 ChatGPT 里打开该会话；明细在 .dsh/codex-runs.jsonl，事件流在 <项目>/.aris-run/codex/*.events.jsonl。',
        badge: `${(codex.recent || []).length} 条`,
      }, h('div', null, recentRows.length ? recentRows : h('div', { className: 'daris-tag', style: { marginTop: 6 } }, '还没有调用记录。')), sessionPanel);

      const g7 = h(Sub, { force: force, title: '说明 · 两条不可信与只读三层' },
        h('div', { className: 'daris-sub' }, '模型清单读自本机 codex 的 models_cache.json，钉死的型号消失时会拒单而不是静默回退。模型自报身份不可信（实测 -m gpt-6-luna 却自报 gpt-6.2-sol），以 CLI 会话里的 turn_context.model 为准。只读靠三层：提示词硬规则（软约束）、送审文件隔离副本（物理隔离）、派单后扫命令与文件变更（事后审计）。'));

      return h('div', null, g1, g2, g3, g4, g5, g6, g7);
    }

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

    /* ---- UI 改版 2026-11：总览表 / 图表 / 折叠 ---- */
    const copyText = (t) => { try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(t)); } catch (e) {} };
    const esc2 = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const tokText = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n || 0));
    function BarChart(props) {
      const all = props.data || [];
      const [metric, setMetric] = React.useState('cny');
      const METRICS = [
        { id: 'cny', label: '成本', get: (d) => Number(d.cny || 0), fmt: (v) => '¥' + (v >= 10 ? Number(v).toFixed(1) : Number(v).toFixed(2)), sum: (v) => '¥' + Number(v).toFixed(2) },
        { id: 'steps', label: '步数', get: (d) => Number(d.steps || 0), fmt: (v) => String(Math.round(v)), sum: (v) => String(Math.round(v)) },
        { id: 'ms', label: '耗时', get: (d) => Number(d.ms || 0), fmt: (v) => (v >= 60000 ? (v / 60000).toFixed(1) + 'm' : Math.round(v / 1000) + 's'), sum: (v) => (Math.round(v / 6000) / 10).toFixed(1) + ' 分钟' },
      ];
      const mt = METRICS.filter((x) => x.id === metric)[0] || METRICS[0];
      const rows = all.slice(-24);
      if (!rows.length) return h('div', { className: 'daris2-empty', style: { padding: '18px 0' } }, '没有可画的轮次');
      const vals = rows.map(mt.get);
      const max = Math.max.apply(null, vals.concat([1e-9]));
      const avg = vals.reduce((a, b) => a + b, 0) / rows.length;
      const total = vals.reduce((a, b) => a + b, 0);
      const hh = props.height || 150;
      const n = rows.length;
      const every = n <= 8 ? 1 : n <= 16 ? 2 : 3;
      return h('div', null,
        h('div', { className: 'daris2-btabs' }, METRICS.map((m) => h('button', {
          key: m.id, className: 'daris2-chip' + (m.id === metric ? ' on' : ''), onClick: () => setMetric(m.id),
        }, m.label))),
        h('div', { className: 'daris2-chartx' },
          h('div', { className: 'yax' }, h('span', null, mt.fmt(max)), h('span', null, mt.fmt(max / 2)), h('span', null, '0')),
          h('div', { className: 'wrap' },
            h('div', { className: 'bars', style: { height: hh + 'px', minWidth: n * 19 + 'px' } },
              h('div', { className: 'avg', style: { bottom: ((avg / max) * 100).toFixed(1) + '%' } }),
              rows.map((d, i) => {
                const v = mt.get(d);
                const kind = (d.verdict === 'accept' || d.verdict === 'pass' || d.verdict === 'done') ? 'ok' : (d.verdict === 'revise' || d.verdict === 'partial') ? 'warn' : (d.verdict === 'blocked' || d.verdict === 'error') ? 'err' : '';
                return h('div', { key: i, className: 'bc', title: '#' + (i + 1) + '：' + mt.fmt(v) + (d.verdict ? ' · ' + d.verdict : '') },
                  h('i', { className: kind, style: { height: Math.max(1.2, (v / max) * 100).toFixed(1) + '%' } }),
                  i % every === 0 ? h('span', null, '#' + (i + 1)) : null);
              })))),
        h('div', { className: 'daris2-chart-sum' },
          h('span', null, '合计 ', h('b', null, mt.sum(total))),
          h('span', null, '均值 ', h('b', null, mt.fmt(avg))),
          h('span', null, '最高 ', h('b', null, mt.fmt(max))),
          h('span', null, '共 ', h('b', null, String(n)), ' 轮')));
    }

    function PieBox(props) {
      const segs = (props.segs || []).filter((x) => (x.value || 0) > 0);
      if (!segs.length) return h('div', { className:'daris2-empty' }, '暂无记录');
      const total = segs.reduce((a, b) => a + b.value, 0) || 1;
      const R = 38; const RW = 16; const C = 2 * Math.PI * R;
      let acc = 0;
      const ring = segs.map((sg, i) => {
        const frac = sg.value / total;
        const dash = (frac * C).toFixed(2) + ' ' + (C - frac * C).toFixed(2);
        const off = (-acc * C).toFixed(2);
        acc += frac;
        return h('circle', { key: i, cx: 50, cy: 50, r: R, fill: 'none', stroke: sg.color || '#888', strokeWidth: RW, strokeDasharray: dash, strokeDashoffset: off, transform: 'rotate(-90 50 50)' });
      });
      return h('div', { className: 'daris2-pie' },
        h('svg', { width: 120, height: 120, viewBox: '0 0 100 100', style: { flex: 'none' } }, ring, h('text',{x:50,y:55,textAnchor:'middle',fill:'var(--tx)',fontSize:18},String(total))),
        h('div', { className: 'daris2-lgbox' }, segs.map((sg, i) => h('div', { key: i, className: 'daris2-lg' },
          h('i', { style: { background: sg.color || '#888' } }),
          h('span', { className: 't' }, sg.label),
          h('b', null, sg.value),
          h('span', { className: 'pc' }, Math.round((sg.value / total) * 100) + '%')))));
    }
    // 一级折叠：卡片化，默认收起；页头的「展开全部 / 收起全部」通过 force={v,n} 统一驱动。
    function Fold(props) {
      const [open, setOpen] = React.useState(Boolean(props.defaultOpen));
      const force = props.force;
      React.useEffect(() => {
        if (force && force.n) setOpen(Boolean(force.v));
      }, [force && force.n]);
      const title = props.title != null ? props.title : props.label;
      const meta = props.meta != null ? props.meta : props.sub;
      const right = props.right != null ? props.right : props.badge;
      return h('div', { className: 'daris2-fold' + (open ? ' open' : '') + (props.className ? ' ' + props.className : '') },
        h('div', { className: 'daris2-fold-h', onClick: () => setOpen(!open) },
          h('span', { className: 'daris2-caret' }, '▾'),
          h('span', null, title),
          meta ? h('span', { className: 'meta', style: { fontSize: 11, fontWeight: 400, color: 'var(--tx3)' } }, meta) : null,
          h('span', { className: 'sp' }),
          right ? h('span', { className: 'daris2-tag' }, right) : null),
        h('div', { className: 'daris2-fold-b' }, props.children));
    }

    // 折叠卡（对齐 mock .m-sec.m-fold）：详情默认展开，审核默认收起。
    function StageTree({ stages, force }) {
      if (!stages.length) return h('div', { className: 'daris2-cell2 s' }, '没有阶段数据');
      const roots = [];
      const families = new Map();
      for (const stage of stages) {
        const match = /^S(\d+)([a-z])?(?=[_\s-]|$)/i.exec(stage.name);
        if (!match) {
          roots.push({ stage });
          continue;
        }
        const id = 'S' + match[1];
        if (!families.has(id)) {
          const family = { id, children: [] };
          roots.push(family);
          families.set(id, family);
        }
        const family = families.get(id);
        if (!match[2] && !family.stage) family.stage = stage;
        else family.children.push({ stage });
      }
      const labels = { done: '已完成', in_progress: '进行中', pending: '待开始', blocked: '受阻' };
      const colors = { done: 'done', in_progress: 'cur', blocked: 'err' };
      function branch(node) {
        const stage = node.stage;
        const name = stage ? stage.name : node.id;
        const children = node.children || [];
        const items = stage ? (stage.items || []) : [];
        const done = items.filter(item => item.done).length;
        let status = stage && stage.status;
        let progress = '';
        if (stage) {
          if (items.length) progress = done + '/' + items.length;
          else if (stage.done != null && stage.total != null) progress = stage.done + '/' + stage.total;
        } else {
          const completed = children.filter(child => child.stage.status === 'done').length;
          const states = children.map(child => child.stage.status);
          if (completed === children.length) status = 'done';
          else if (states.includes('blocked')) status = 'blocked';
          else if (states.includes('in_progress') || completed) status = 'in_progress';
          else if (states.every(value => value === 'pending')) status = 'pending';
          progress = completed + '/' + children.length + ' 个子阶段';
        }
        const doneItems = stage ? (stage.doneItems || []) : [];
        const expandable = Boolean(items.length || children.length || doneItems.length);
        const row = h(expandable ? 'summary' : 'div', { className: 'daris2-trow' },
          h('span', { className: 'daris2-tdot ' + (colors[status] || '') }),
          h('b', { title: name }, name),
          h('span', { className: 'tmeta' }, [labels[status] || status || '状态未知', progress].filter(Boolean).join(' ')));
        return h('li', { key: name }, expandable
          ? h('details', { open: force ? force.open : children.length > 0 || status === 'in_progress' }, row,
            h('ul', null, items.map((item, index) => h('li', { key: index, className: 'daris2-tree-item' },
              h('span', null, item.text), h('small', null, item.done ? '已完成' : '未完成'))),
              doneItems.length ? h('li', { className: 'daris2-tree-done-h' }, '已完成 ' + doneItems.length + ' 项') : null,
              doneItems.map((item, index) => h('li', { key: 'd' + index, className: 'daris2-tree-item done' },
                h('span', { title: [item.text, item.at, item.runId].filter(Boolean).join(' | ') }, item.text),
                h('small', null, item.verdict || '已完成'))),
              children.map(branch)))
          : row);
      }
      return h('ul', { className: 'daris2-tree' }, roots.map(branch));
    }

    function Pane(props) {
      const [open, setOpen] = React.useState(props.defaultOpen !== false);
      React.useEffect(()=>{if(props.force)setOpen(props.force.open)},[props.force]);
      return h('div', { className: 'daris2-pane' + (open ? ' open' : '') },
        h('div', { className: 'daris2-pane-h', onClick: () => setOpen(!open) },
          h('span', { className: 'daris2-caret', style: { transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' } }, '▾'),
          h('span', null, props.title),
          h('span', { className: 'sp' }),
          props.meta ? h('span', { className: 'meta' }, String(props.meta)) : null,
          props.right ? h('span', { className: 'daris2-tag' }, props.right) : null),
        open ? h('div', { className: 'daris2-pane-b' }, props.children) : null);
    }

    // 二级折叠：贴在某个一级折叠里，样式更轻。
    function Sub(props) {
      const [open, setOpen] = React.useState(Boolean(props.defaultOpen));
      const force = props.force;
      React.useEffect(() => {
        if (force && force.n) setOpen(Boolean(force.v));
      }, [force && force.n]);
      return h('div', { className: 'daris2-sub' + (open ? ' open' : '') },
        h('div', { className: 'daris2-sub-h', onClick: () => setOpen(!open) },
          h('span', { className: 'daris2-caret' }, '▾'),
          h('h4', null, props.title),
          props.meta ? h('span', { className: 'meta' }, props.meta) : null,
          h('span', { style: { flex: 1 } }),
          props.right ? h('span', { className: 'daris2-tag' }, props.right) : null),
        h('div', { className: 'daris2-sub-b' }, props.children));
    }

    // 「数据 N 秒前」：自己每秒重绘，不拖累整块面板。
    function Ago(props) {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        const id = setInterval(() => bump((x) => x + 1), 1000);
        return () => clearInterval(id);
      }, []);
      if (!props.at) return h('span', null, '数据 —');
      const s = Math.max(0, Math.round((Date.now() - props.at) / 1000));
      const text = s < 90 ? `${s} 秒前` : s < 5400 ? `${Math.round(s / 60)} 分钟前` : `${Math.round(s / 3600)} 小时前`;
      return h('span', { className: 'bal', title: new Date(props.at).toLocaleString() }, `数据 ${text}`);
    }
    function ArisPanel() {
      const [data, setData] = React.useState(null);
      const [err, setErr] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [toast, setToast] = React.useState('');
      const [tab, setTab] = React.useState('overview');
      const [refreshAt, setRefreshAt] = React.useState(0);
      const [autoSec, setAutoSec] = React.useState(10);
      const [expandAll, setExpandAll] = React.useState(false);
      const [foldForce, setFoldForce] = React.useState({ v: false, n: 0 });

      // 总览
      const [ovOpen, setOvOpen] = React.useState('');
      const [ovView, setOvView] = React.useState('table');
      const [ovFilter, setOvFilter] = React.useState('all');
      const [ovQuery, setOvQuery] = React.useState('');
      // 流水线
      const [pOpen, setPOpen] = React.useState('');
      const [pView, setPView] = React.useState('table');
      const [pFilter, setPFilter] = React.useState('all');
      const [pQuery, setPQuery] = React.useState('');
      const [routeFocus,setRouteFocus] = React.useState(null);
      const [mainFold,setMainFold] = React.useState(null);
      const [sideFold,setSideFold] = React.useState(null);
      const [rvPipe, setRvPipe] = React.useState('');

      const [armed, setArmed] = React.useState('');
      const [newRoot, setNewRoot] = React.useState('');
      const [humanNotes, setHumanNotes] = React.useState({});
      const setHumanNote = (root, text) => setHumanNotes((prev) => ({ ...prev, [root]: text }));
      // 提交答复后，等下一次轮询把 humanActions 刷新掉之前，先乐观收起这一块。
      const [answered, setAnswered] = React.useState({});
      const [drawer, setDrawer] = React.useState(null);
      // 需人工横条上的「看稿件」：直接打开待裁决稿件的只读全文。
      const openHumanDraft = async (a) => {
        if (!a) return;
        if (!a.file) { setTab('review'); return; }
        try {
          const res = await getArtifactFile(a.name, a.file);
          setDrawer({ kind: 'file', title: a.title, root: `${a.name}/${a.file}`, text: String((res && res.text) || '（空）') });
        } catch (e) { setToast('打开失败：' + String((e && e.message) || e)); }
      };
      const [kimiMin, setKimiMin] = React.useState('');
      const [kimiStart, setKimiStart] = React.useState('');
      const [evCap, setEvCap] = React.useState('');
      const evCapDirty = React.useRef(false);
      const [form, setForm] = React.useState(null);
      const [wsPaths, setWsPaths] = React.useState([]);
      const [kimiPrompt, setKimiPrompt] = React.useState('');
      const live = React.useRef(true);

      const load = React.useCallback(async () => {
        try {
          const d = await getState();
          setData(d); setErr(''); setRefreshAt(Date.now());
          if (!(((d && d.reviews && d.reviews.humanActions) || []).length)) setAnswered({});
          const st = (d && d.settings) || {};
          setForm((prev) => prev || {
            mailbox: st.mailbox || '',
            model: st.model || 'deepseek-flash',
            maxConcurrent: String(st.maxConcurrent != null ? st.maxConcurrent : 3),
            maxMinutes: String(st.maxMinutes != null ? st.maxMinutes : 120),
          });
          const k = st.kimi || {};
          setKimiMin((prev) => prev || (k.intervalMinutes != null ? String(k.intervalMinutes) : ''));
          setKimiStart((prev) => prev || (k.startTime || ''));
          if (!evCapDirty.current) setEvCap(String(d && d.eventsPerCard != null ? d.eventsPerCard : 6));
        } catch (e) { setErr(String((e && e.message) || e)); }
      }, []);

      const loadWorkspaces = React.useCallback(async () => {
        try {
          const r = await post('workspace.list', {});
          const list = (r && (r.workspaces || r.paths)) || [];
          setWsPaths(list.map((x) => String(x).toLowerCase()));
        } catch (e) { /* 工作区列表失败不影响主面板 */ }
      }, []);

      React.useEffect(() => {
        live.current = true;
        load(); loadWorkspaces();
        return () => { live.current = false; };
      }, [load, loadWorkspaces]);

      React.useEffect(() => {
        const id = setInterval(() => { if (live.current) load(); }, Math.max(3, Number(autoSec) || 10) * 1000);
        return () => clearInterval(id);
      }, [autoSec, load]);

      const ACT_LABEL = {
        stop: '停用', start: '启用', run: '运行一次', resume: '解除暂停',
        'mailbox.collect': '收件', recover: '检查恢复', 'runtime.reset': '清空运行记录',
        'prompt.reset': '重置提示词', 'human.reply': '提交人工回复', 'workspace.register': '添加工作区',
        remove: '移除', add: '添加', 'handoff.set': '切换执行权', 'settings.save': '保存设置',
      };
      const act = async (name, input) => {
        setBusy(true);
        try {
          const r = await post(name, input || {});
          if (r && r.dashboard) { setData(r.dashboard); setRefreshAt(Date.now()); }
          else if (r && r.ok !== false) { try { await load(); } catch { /* 拉取失败交给下一次轮询 */ } }
          if (name === 'human.reply' && r && r.ok) {
            setAnswered((prev) => ({ ...prev, [String((input && input.root) || '')]: 1 }));
            setTimeout(() => { try { load(); } catch {} }, 1500);
            const rs = r.resumed || null;
            setToast(rs && rs.started ? '已提交并重启：新一轮已开始' : (rs && rs.reason ? '已提交答复：' + rs.reason : '已提交人工答复'));
          }
          if (name === 'stop' && !(input && input.force)) {
            setToast(r && r.stopped ? '已停止' : '已登记停止：本轮跑完即停');
          } else if (r && r.ok === false) {
            setToast(String(r.error || (ACT_LABEL[name] || name) + '失败'));
          } else if (name !== 'human.reply') {
            setToast(String((r && r.message) || ((ACT_LABEL[name] || name) + ' 完成')));
          }
          return r;
        } catch (e) {
          setToast(`失败：${String((e && e.message) || e)}`);
          return null;
        } finally { setBusy(false); }
      };

      const openPrompt = async (root) => {
        setBusy(true);
        try {
          const r = await post('prompt.get', { root });
          setDrawer({ kind: 'prompt', root, text: String((r && r.text) || '') });
        } catch (e) { setToast(`读取提示词失败：${String((e && e.message) || e)}`); }
        finally { setBusy(false); }
      };
      const openLogs = async (root) => {
        setBusy(true);
        try {
          const r = await post('logs', { root });
          setDrawer({ kind: 'logs', root, data: (r && r.logs) || r || {} });
        } catch (e) { setToast(`读取日志失败：${String((e && e.message) || e)}`); }
        finally { setBusy(false); }
      };
      const openSession = async (p) => {
        if (!p.lastSessionId) return;
        setBusy(true);
        try {
          const d = await getSession(p.name, p.lastSessionId, 200);
          setDrawer({ kind: 'session', root: p.root, data: d || null });
        } catch (e) { setToast(`读取会话失败：${String((e && e.message) || e)}`); }
        finally { setBusy(false); }
      };
      const sessionEl = (d) => {
        if (!d) return h('div', { className: 'daris-empty' }, '没有会话数据。');
        const counts = d.counts || {};
        const rows = d.messages || d.rows || [];
        return h('div', null,
          h('div', { className: 'daris-tag' }, `消息 ${rows.length} · 工具 ${counts.tool || 0} · 推理 ${counts.reasoning || 0}`),
          h('div', { className: 'daris-sess' }, rows.slice(0, 240).map((m, i) =>
            h('div', { key: i, className: `daris-sess-row ${m.kind === 'tool' ? '' : m.kind === 'error' ? 'bad' : ''}`.trim() },
              h('span', { className: 'daris-sess-k' }, (m.kind || m.role || '') + (m.at ? ' · ' + ft(m.at) : '')),
              h('span', { className: 'daris-sess-t' }, String(m.text || '').slice(0, 1200))))));
      };

      const loadKimiPrompt = async () => {
        try { const r = await post('kimi.prompt', {}); setKimiPrompt(String((r && r.prompt) || '')); }
        catch (e) { setToast(`生成失败：${String((e && e.message) || e)}`); }
      };
      const copyKimiPrompt = () => { copyText(kimiPrompt); setToast('已复制取件提示词'); };
      const saveKimiPrompt = async () => {
        try { await post('kimi.prompt', { write: true }); setToast('已存到邮箱目录'); }
        catch (e) { setToast(`保存失败：${String((e && e.message) || e)}`); }
      };

      const stateOf = (p) => {
        const blkText = String((p.plan && p.plan.block && p.plan.block.reason) || '');
        const hourlyQuota = /额度|quota|429|限流/i.test(blkText) && !/物理送审|attempts\s*\d+\s*\/\s*\d+/i.test(blkText);
        if (p.stage && p.stage.status === 'blocked_on_user' && hourlyQuota) return { key: 'quota', label: '等额度', cls: 'warn' };
        if (p.lastError) return { key: 'error', label: '出错', cls: 'error' };
        if (p.stage && p.stage.status === 'blocked_on_user') return { key: 'human', label: '等待人工', cls: 'human' };
        if (humanHot.has(p.name)) return { key: 'human', label: '需人工', cls: 'human' };
        if (p.stopping) return { key: 'stopping', label: '停止中', cls: 'stopping' };
        if (p.running) return { key: 'run', label: '正在运行', cls: 'run' };
        if (p.nextAtBasis === 'quota') return { key: 'quota', label: '等额度', cls: 'warn' };
        if (!p.enabled) return { key: 'stop', label: '已停止', cls: 'stop' };
        if (Number(p.pending) > 0) return { key: 'review', label: '待审', cls: 'review' };
        return { key: 'idle', label: '空闲', cls: 'idle' };
      };
      const kindOf = (p) => stateOf(p).key;
      const LABEL = { error: '出错', human: '需人工', quota: '等额度', stopping: '停止中', run: '正在运行', review: '待审', stop: '已停止', idle: '空闲' };
      const ORDER = { error: 0, human: 1, quota: 2, run: 3, review: 4, stopping: 5, idle: 6, stop: 7 };

      if (!data) {
        return h('div', { className: 'daris daris2' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS + CSS2 + previewLayout } }),
          h('div', { className: 'daris2-head' },
            h('div', { className: 'daris2-head-main' },
              h('h1', { className: 'daris2-title' }, 'Aris_Dsh'),
              h('div', { className: 'daris2-subtitle' }, err ? '读取状态失败' : '正在读取流水线状态…'))),
          err ? h('div', { className: 'daris2-band err', style: { marginTop: 12 } },
            h('b', null, '无法连接 Aris'),
            h('span', { style: { flex: '1 1 220px' } }, err),
            h(Btn, { label: '重试', primary: true, onClick: load })) : null);
      }

      const allPipes = data.pipelines || [];
      // 审稿侧点名要人处理的流水线（封顶 / 多轮退回 / 等待人工）：状态列改说「需人工」，
      // 免得流水线还在跑、但面板另一处又说要人处理，两处互相打脸。
      const humanHot = new Set(((data.reviews || {}).humanActions || []).map((a) => a && a.name).filter(Boolean));
      const names=Array.from(new Set(allPipes.map(p=>p.name).concat(tab==='review'?(data.reviews?.groups||[]).map(g=>g.name).filter(Boolean):[])));
      const scopeName=names.includes(rvPipe)?rvPipe:'';
      const pipes = scopeName ? allPipes.filter((p) => p.name === scopeName) : allPipes;
      const artifactName = scopeName || (allPipes[0] && allPipes[0].name) || '';
      const changeScope = (name) => {
        setRvPipe(name); setPOpen(name); setOvOpen(''); setDrawer(null); setArmed('');
      };
      const bal = data.balance || {};
      const s = data.settings || {};
      const mb = data.mailbox || {};
      const ho = data.handoff || {};
      const rv = data.reviews || {};
      const rvGroups = rv.groups || [];
      const reviewCounts = (name) => {
        const counts = new Map();
        for (const g of rvGroups) if (g.name === name) {
          const k = (g.latest && g.latest.verdict) || 'unknown';
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        return Array.from(counts, ([k,v]) => (({accept:'通过',revise:'需修改',reject:'退回',unknown:'未知'})[k] || k)+' '+v).join(' · ') || '暂无稿件记录';
      };
      // 最新一份审稿里的 MUST / SHOULD 条数：审稿 md 两种写法都算（MUST 段 / 主要问题段）
      const mustLine = (name) => {
        const g = rvGroups.find((x) => x.name === name);
        if (!g) return '';
        const m = Number(g.mustCount || 0);
        const sh = Number(g.shouldCount || 0);
        if (!m && !sh) return '';
        return 'MUST ' + m + ' · SHOULD ' + sh;
      };
      const seriesGroups = rvGroups.filter((g) => !rvPipe || (g.latest && String(g.latest.name) === rvPipe));
      const mustSum = seriesGroups.reduce((n, g) => n + Number(g.mustCount || 0), 0);
      const shouldSum = seriesGroups.reduce((n, g) => n + Number(g.shouldCount || 0), 0);
      const rvTotal = rv.total != null ? rv.total : rvGroups.length;
      const humanAll = (rv.humanActions || []).filter((a) => !scopeName || a.name === scopeName);
      const cx = data.codex || {};
      const cf = cx.config || {};
      const quota = cx.quota || {};
      const lock = cx.lock || {};

      const sum = (fn) => pipes.reduce((n, p) => n + (Number(fn(p)) || 0), 0);
      const cap = (txt, n) => String(txt || '').replace(/\s+/g, ' ').slice(0, n || 80);

      // 行详情：总览和流水线两个页签共用同一块，避免两处逻辑漂移。
      const foldTools=(title,set)=>h('div',{className:'daris2-toolbar'},h('b',null,title),h(Btn,{label:'全部展开',onClick:()=>set({open:true})}),h(Btn,{label:'全部折叠',onClick:()=>set({open:false})}));
      const pipeDetail = (p) => {
        const k = kindOf(p);
        const plan = p.plan || {};
        const stages = plan.stages || [];
        const stageName = (p.stage && p.stage.stage) || plan.current || '—';
        const hasCurrentItems = (plan.items || []).length > 0;
        const stageList = hasCurrentItems && !stages.some(stage => stage.name === stageName)
          ? [...stages, { name: stageName, status: plan.currentStatus, items: plan.items }]
          : stages;
        const treeStages = stageList.map(stage => {
          const source = stage.items && stage.items.length ? stage.items : stage.name === stageName ? plan.items : [];
          const items = (source || []).map(item => {
            const text = typeof item === 'string' ? item : String(item.text || '');
            return { text: text.replace(/^✅\s*/, ''), done: stage.status === 'done' || !!item.done || /^✅/.test(text) };
          });
          const doneSource = Array.isArray(stage.doneItems) ? stage.doneItems : [];
          const doneItems = doneSource.map((item) => {
            if (item && typeof item === 'object') return { text: String(item.text || ''), at: item.at || '', runId: item.runId || '', verdict: item.verdict || '' };
            return { text: String(item).replace(/^✅\s*/, ''), at: '', runId: '', verdict: '' };
          }).filter((item) => item.text);
          return { ...stage, items, doneItems };
        });
        const planItemCount = treeStages.reduce((count, stage) => count + stage.items.length + (stage.doneItems || []).length, 0);
        const planDoneCount = treeStages.reduce((count, stage) => count + (stage.doneItems || []).length, 0);
        const activity = p.activity || null;
        const last = p.lastRun || null;
        const hist = (p.history || []).slice().reverse();
        const gates = p.gates || { done: 0, total: 0 };
        const today = p.today || { runs: 0, cny: 0 };
        const vt = (v) => ({ accept: '通过', pass: '通过', done: '完成', revise: '需修改', partial: '部分完成', blocked: '阻塞', error: '出错', running: '运行中' }[v] || (v ? String(v) : '—'));
        const sv = (v) => (v === 'accept' || v === 'pass' || v === 'done' ? 'ok' : v === 'revise' || v === 'partial' ? 'warn' : v === 'running' ? 'run' : v === 'blocked' || v === 'error' ? 'err' : '');
        const pieSegs = (() => {
          const c = {};
          (p.history || []).slice(0, 6).forEach((x) => { const key = x.verdict || '未知'; c[key] = (c[key] || 0) + 1; });
          const color = { done: '#18794e', partial: '#b45309', blocked: '#b42318', error: '#b42318', running: '#2563eb' };
          return Object.keys(c).map((key) => ({ label: vt(key), value: c[key], color: color[key] || '#8a8a8a' }));
        })();
        const interval = p.intervalMinutes ? '每 ' + p.intervalMinutes + ' 分钟' : '';
        return h('div', { className: 'daris2-detail' },
          h('div', { className: 'daris2-pipehead' },
            h('span', { className: 'daris2-badge ' + k }, h('i'), LABEL[k] || k),
            h('strong', { className: 'daris2-pipename' }, p.name),
            h('span', { className: 'daris2-chip2' }, p.driver),
            p.model ? h('span', { className: 'daris2-chip2' }, p.model) : null,
            interval ? h('span', { style: { fontSize: 11.5, color: 'var(--tx3)' } }, interval) : null,
            h('span', { style: { flex: 1 } }),
            h(Btn, { label: '看日志', onClick: () => openLogs(p.root) }),
            h(Btn, { label: '看会话', disabled: busy || !p.lastSessionId, onClick: () => openSession(p) }),
            h(Btn, { label: '提示词', onClick: () => openPrompt(p.root) })),
          h('div', { className: 'daris2-pipemeta' },
            h('span', null, '阶段 ', h('b', null, stageName)),
            h('span', { className: 'daris2-pipeprog' }, stages.slice(0, 14).map((sg, i) => h('i', { key: i, className: sg.status === 'done' || sg.name !== stageName && stages.findIndex((x) => x.name === stageName) > i ? 'done' : sg.name === stageName ? 'cur' : '', title: sg.name }))),
            h('span', null, '门禁 ', h('b', null, (gates.done || 0) + '/' + (gates.total || 0))),
            h('span', null, '下轮 ', h('b', null, p.nextAt ? ft(p.nextAt) : '未排期')),
            h('span', null, '今日 ', h('b', null, (today.runs || 0) + ' 轮 · ' + yu(today.cny))),
            h('span', { className: 'daris2-path', title: p.root }, p.root)),
          h('div', { className: 'daris2-detail-b' },
            h('div', { className: 'daris2-cols' },
              h('div', { className: 'daris2-colmain' },
                foldTools('轮次与进度',setMainFold),
                h(Pane, { force:mainFold, title: '每轮指标', meta: '最近 ' + Math.min(hist.length, 24) + ' 轮 · 成本 / 步数 / 耗时 · 超宽横滚', defaultOpen: true },
                  h(BarChart, {
                    height: 150,
                    data: hist.slice(-24).map((x) => ({ label: '', cny: x.cny, steps: x.steps, ms: x.ms, verdict: x.verdict })),
                  })),
                h(Pane, { force:mainFold, title: '现在', meta: activity && activity.step ? '第 ' + activity.step + ' 步' : (p.running ? '运行中' : ''), defaultOpen: true },
                  h('div', { className: 'daris2-note', style: { marginTop: 0, maxHeight: 140 } },
                    (activity && activity.text) || (p.blocked ? '等待裁决 · ' + p.blocked : p.running ? '已启动，等模型的第一个动作…' : '上一轮已收尾，等节拍起下一轮。')),
                  h('dl', { className: 'daris2-kv' },
                    h('dt', null, '模型'), h('dd', null, (activity && activity.model) || p.model || '—'),
                    h('dt', null, '步骤'), h('dd', null, activity && activity.steps != null ? String(activity.steps) : (last && last.steps != null ? String(last.steps) : '—')),
                    h('dt', null, '开始'), h('dd', null, activity && activity.startedAt ? ft(activity.startedAt) : '—'),
                    h('dt', null, '累计'), h('dd', null, activity && activity.elapsedMs ? Math.max(1, Math.round(activity.elapsedMs / 60000)) + ' 分钟' : '—'),
                    h('dt', null, '上下文'), h('dd', null, p.budget && p.budget.ctxPct != null ? p.budget.ctxPct + '%' : '—'),
                    h('dt', null, '会话'), h('dd', { style: { fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11 } }, p.lastSessionId || '—')),
                  (p.blockers || []).length
                    ? h('div', { className: 'daris2-note' }, (p.blockers || []).map((b, i) => h('div', { key: i }, '· [' + b.severity + '] ' + b.text)))
                    : null),
                h(Pane, { force:mainFold, title: '计划项', meta: treeStages.length + ' 个阶段 · 共 ' + planItemCount + ' 项 · 已完成 ' + planDoneCount + ' 项', defaultOpen: true },
                  treeStages.length
                    ? h('div', null, treeStages.map((grp, gi) => {
                      const gDoneN = grp.items.filter((x) => x.done).length;
                      const gDoneList = grp.doneItems || [];
                      return h('div', { key: gi, className: 'daris2-plan-grp' },
                        h('div', { className: 'daris2-sub-h' },
                          h('span', { className: 'daris2-tdot ' + (grp.status === 'done' ? 'done' : grp.status === 'in_progress' ? 'cur' : '') }),
                          h('h4', null, grp.name),
                          h('span', { className: 'meta' }, (grp.items.length ? grp.items.length + ' 项 · 完成 ' + gDoneN + '/' + grp.items.length : [({ done: '已完成', in_progress: '进行中', pending: '待开始', blocked: '受阻' })[grp.status] || grp.status, '无计划项'].filter(Boolean).join(' · ')) + (gDoneList.length ? ' · 已完成 ' + gDoneList.length + ' 项' : '')),
                          h('span', { className: 'sp' })),
                        grp.items.length > 0 && h('table', { className: 'daris2-plantbl' }, h('tbody', null, grp.items.map((it, i) => h('tr', { key: i },
                          h('td', { className: 'st' }, h('span', { className: 'daris2-tdot ' + (it.done ? 'done' : '') }), it.done ? '已完成' : '待办'),
                          h('td', { className: 'tx', title: it.text }, (i + 1) + '. ' + cap(it.text, 90)))))),
                          gDoneList.length ? h('div', { className: 'daris2-done-grp' },
                            h('div', { className: 'daris2-done-h' }, '已完成 ' + gDoneList.length + ' 项'),
                            h('table', { className: 'daris2-plantbl daris2-donetbl' }, h('tbody', null, gDoneList.map((it, i) => h('tr', { key: 'd' + i },
                              h('td', { className: 'st' }, h('span', { className: 'daris2-tdot done' }), it.verdict || '已完成'),
                              h('td', { className: 'tx', title: (it.text || '') + (it.at ? String.fromCharCode(10) + it.at : '') + (it.runId ? String.fromCharCode(10) + it.runId : '') }, (i + 1) + '. ' + cap(it.text, 90))))))) : null);
                    }))
                    : h('div', { className: 'daris2-empty' }, '这一阶段没有计划项')),
                h(Pane, { force:mainFold, title: '轮次历史', meta: hist.length + ' 轮记录', defaultOpen: true },
                  h('div', { style: { maxHeight: 268, overflow: 'auto' } },
                    h('table', { className: 'daris2-lgtbl' },
                      h('thead', null, h('tr', null,
                        h('th', null, '轮次'),
                        h('th', null, '开始'),
                        h('th', { className: 'num' }, '步数'),
                        h('th', { className: 'num' }, '成本'),
                        h('th', null, '结论'),
                        h('th', { className: 'num' }, '退出码'))),
                      h('tbody', null, hist.slice(0, 20).map((x, i) => h('tr', { key: i },
                        h('td', null, '#' + (hist.length - i)),
                        h('td', null, x.at ? ft(x.at) : '—'),
                        h('td', { className: 'num' }, x.steps != null ? String(x.steps) : '—'),
                        h('td', { className: 'num' }, x.cny != null ? yu(x.cny) : '—'),
                        h('td', null, h('span', { className: 'daris2-verdict ' + sv(x.verdict) }, vt(x.verdict))),
                        h('td', { className: 'num' }, x.exit != null ? String(x.exit) : '—')))))))),
              h('div', { className: 'daris2-colside' },
                foldTools('阶段与结论',setSideFold),
                h(Pane, { force:sideFold, title: '结论分布', meta: ['最近 6 轮', mustLine(p.name)].filter(Boolean).join(' · '), defaultOpen: true },
                  h(PieBox, { segs: pieSegs })),
                h(Pane, { force:sideFold, title: '阶段树', meta: treeStages.length + ' 个阶段 · 展开查看子项', defaultOpen: true },
                  h(StageTree, { key: p.root || p.name, stages: treeStages, force: sideFold }),
                ),
                h(Pane, { force:sideFold, title: '总计划', meta: (plan.percent != null ? plan.percent + '%' : '—') + ' · 完成 ' + (plan.done || 0) + '/' + (plan.total || 0) + (stageName ? ' · 当前 ' + stageName : ''), defaultOpen: true },
                  h('div', { className: 'daris2-prog' }, h('i', { style: { width: (plan.percent || 0) + '%' } })),
                  h('div', { className: 'daris2-cell2 s', style: { margin: '6px 0 8px' } }, plan.currentStatus ? '已开始 ' + (plan.done || 0) + '/' + (plan.total || 0) + ' 步' : '还没有计划数据'),
                  plan.block && plan.block.reason
                    ? h('div', { className: 'daris2-note' }, '门禁 · ' + plan.block.reason + (plan.block.hint ? '：' + plan.block.hint : ''))
                    : null),
                (p.events || []).length
                  ? h(Pane, { force:sideFold, title: '最近事件', meta: (p.events || []).length + ' 条', defaultOpen: true },
                    h('table', { className: 'daris2-lgtbl' }, h('tbody', null, (p.events || []).slice(-8).reverse().map((ev, i) => h('tr', { key: i },
                      h('td', { style: { whiteSpace: 'nowrap' } }, ev.at ? ft(ev.at) : '—'),
                      h('td', null, ev.kind || ev.type || '—'),
                      h('td', null, cap(String(ev.text || ev.name || ''), 80)))))))
                  : null))),
            h(Fold,{title:'操作 · 按影响分级',meta:'L0 只读 / L1 可逆 / L2 阻断 / L3 破坏',defaultOpen:false},
              actionTier(p)));

      };

      const inWsOf = (p) => wsPaths.indexOf(String(p.root || '').toLowerCase()) >= 0;
      const startKey = (p) => p.root + ':start';
      const killKey = (p) => p.root + ':kill';
      const resetKey = (p) => p.root + ':reset';
      const promptKey = (p) => p.root + ':prompt';
      const rmKey = (p) => p.root + ':rm';

      const actionTier = (p) => {
        const inWs = inWsOf(p);
        const grp = (lv, kids) => h('div', { key: lv, className: 'grp' },
          h('span', { className: 'daris2-lv' + (lv === 'L3' ? ' l3' : '') }, lv), kids);
        return h('div', { className: 'daris2-tier' },
          grp('L0 只读', [
            h(Btn, { key: 'logs', label: '看日志', onClick: () => openLogs(p.root) }),
            h(Btn, { key: 'sess', label: p.running ? '看会话 · 运行中' : '看会话', disabled: busy || !p.lastSessionId, onClick: () => openSession(p) }),
            h(Btn, { key: 'copy', label: '复制路径', onClick: () => { copyText(p.root); setToast('已复制根路径'); } }),
          ]),
          grp('L1 可逆', [
            p.stage && p.stage.status === 'paused'
              ? h(Btn, { key: 'resume', label: '解除暂停', primary: true, disabled: busy, onClick: () => act('resume', { root: p.root }) })
              : null,
            h(Btn, { key: 'run', label: p.running ? '运行中…' : '运行一次', primary: true, disabled: busy || p.running, onClick: () => act('run', { root: p.root }) }),
            p.stopping
              ? h(Btn, { key: 'unstop', label: '取消停止', title: '撤回停止意图：本轮继续跑完，之后照常起下一轮', disabled: busy, onClick: () => act('start', { root: p.root }) })
              : null,
            h(Btn, { key: 'mb', label: '检查回复', disabled: busy, onClick: () => act('mailbox.collect', {}) }),
            h(Btn, { key: 'rec', label: '检查恢复', title: '把「运行中但进程已消失」的回合标成中断', disabled: busy, onClick: () => act('recover', {}) }),
            h(Btn, { key: 'prompt', label: '提示词', onClick: () => openPrompt(p.root) }),
          ]),
          grp('L2 阻断', [
            !p.stopping && p.enabled
              ? h(Btn, { key: 'stop', label: '停用', disabled: busy, onClick: () => act('stop', { root: p.root }) })
              : null,
            !p.stopping && !p.enabled
              ? h(Btn, {
                key: 'start',
                label: armed === startKey(p) ? '确认启用' : '启用',
                title: '启用后立即参与节拍：会起一轮、花额度、写产物；点两次确认',
                primary: armed !== startKey(p),
                success: armed === startKey(p),
                disabled: busy,
                onClick: () => (armed === startKey(p) ? (setArmed(''), act('start', { root: p.root })) : setArmed(startKey(p))),
              })
              : null,
            p.running ? null : h(Btn, {
              key: 'reset',
              label: armed === resetKey(p) ? '确认清空运行记录' : '清空运行记录',
              danger: armed === resetKey(p),
              onClick: () => (armed === resetKey(p) ? (setArmed(''), act('runtime.reset', { root: p.root })) : setArmed(resetKey(p))),
            }),
            p.running ? null : h(Btn, {
              key: 'preset',
              label: armed === promptKey(p) ? '确认重置提示词' : '重置提示词',
              danger: armed === promptKey(p),
              onClick: () => (armed === promptKey(p) ? (setArmed(''), act('prompt.reset', { root: p.root })) : setArmed(promptKey(p))),
            }),
          ]),
          grp('L3 破坏', [
            p.running ? h('span', { key: 'hint', className: 'daris2-tag', title: '执行者是独立的 headless DSH 进程；桌面端打开这条会话会按「孤儿轮次」提示「任务已停止」，那是误报' }, '运行中 · headless 持有') : null,
            p.stopping && armed !== killKey(p)
              ? h(Btn, { key: 'kill', label: '强制停止', danger: true, title: '立刻杀掉本轮进程（可能留下未提交的改动）；点两次确认', disabled: busy, onClick: () => setArmed(killKey(p)) })
              : null,
            p.stopping && armed === killKey(p)
              ? h(Btn, { key: 'kill2', label: '确认强制停止', danger: true, disabled: busy, onClick: () => { setArmed(''); act('stop', { root: p.root, force: true }); } })
              : null,
            h(Btn, {
              key: 'ws',
              label: inWs ? '会话已挂到工作区' : '添加到工作区',
              title: inWs ? '该根目录已在工作区列表里；点一下把新会话补挂进 second 分组' : '把当前流水线的根目录登记为 DSH 工作区，并把该目录下的会话挂进分组',
              primary: !inWs, disabled: busy,
              onClick: async () => { const r = await act('workspace.register', { root: p.root, title: p.name }); if (r) { loadWorkspaces(); setToast(r.created ? '已添加工作区' : '已在工作区，已补挂新会话'); } },
            }),
            h(Btn, {
              key: 'rm',
              label: armed === rmKey(p) ? '确认移除（只注销，不删目录）' : '移除',
              danger: true, disabled: busy,
              onClick: () => (armed === rmKey(p) ? (setArmed(''), act('remove', { root: p.root })) : setArmed(rmKey(p))),
            }),
          ]));
      };

      // 卡片视图：沿用原来的 <details> 卡片（信息只增不减），操作区换成同一套分级。
      const card = (p) => {
        const st = stateOf(p);
        const last = p.lastRun || null;
        const inWs = inWsOf(p);
        const plan = p.plan || null;
        const items = (plan && plan.items) || [];
        const capN = Number(data.eventsPerCard) || 6;
        const events = (p.events || []).slice().reverse().slice(0, capN);
        const needsHuman = st.key === 'human' && !answered[p.root];
        const waiting = Number(p.pending) > 0;
        const review = p.lastReview || null;
        const activity = p.activity || null;
        const latest = String((activity && activity.text) || (events[0] && events[0].text) || (last && last.verdict) || '').replace(/\s+/g, ' ').slice(0, 80);
        const row = (k, v) => h('div', { className: 'daris-rowline' }, h('span', { className: 'daris-k' }, k), h('span', { className: 'daris-v' }, v));
        const planFold = plan && plan.stages && plan.stages.length
          ? h(Fold, { key: 'plan', title: `计划明细 · ${plan.stages.length} 个阶段` },
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
          ? h(Fold, { key: 'events', title: `最近事件 · ${events.length} 条` },
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
          h(Block, { title: '操作 · 按影响分级（L0 只读 / L1 可逆 / L2 阻断 / L3 破坏）' }, actionTier(p)),
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

      // 总览 / 流水线共用的表格
      const pipeTable = (rows, open, setOpen) => h('div', { className: 'daris2-tblwrap' },
        h('table', { className: 'daris2-tbl' },
          h('thead', null, h('tr', null,
            ['状态', '流水线', '阶段', '现在', '门禁', '阻碍', '审核', '成本', '下轮', '操作'].map((t, i) =>
              h('th', { key: i, className: i === 4 || i === 5 || i === 7 ? 'num' : '' }, t)))),
          h('tbody', null, rows.length ? rows.map((p) => {
            const k = kindOf(p);
            const plan = p.plan || {};
            const gates = p.gates || { done: 0, total: 0 };
            const stg = plan.stages || [];
            const isOpen = open === p.name;
            return h('tr', { key: p.root, className: 'row' + (isOpen ? ' open' : ''), onClick: () => setOpen(isOpen ? '' : p.name) },
              h('td', null, h('span', { className: 'daris2-badge ' + k }, h('i'), LABEL[k] || k)),
              h('td', null, h('div', { className: 'daris2-name' }, p.name, h('span', { className: 'drv' }, p.driver))),
              h('td', null, h('div', null, (p.stage && p.stage.stage) || '—'),
                h('div', { className: 'daris2-rail' }, stg.slice(0, 12).map((x, i) => h('i', { key: i, className: x.status === 'done' ? 'done' : x.status === 'in_progress' ? 'cur' : '' }))),
                h('div', { className: 'daris2-cell2 s' }, stg.length ? `${stg.filter((x) => x.status === 'done').length}/${stg.length}` : '')),
              h('td', null, h('div', { className: 'daris2-now' },
                (p.running ? '运行中 · ' : '') + ((p.activity && p.activity.text) || (p.blocked ? '等待裁决 · ' + (plan.block && plan.block.reason || p.blocked) : p.lastRun ? '上轮 ' + (p.lastRun.verdict || '完成') : (!p.enabled ? '已停用 · 不参与节拍' : '空闲')))),
              h('div', { className: 'daris2-now-s' }, p.history && p.history[0] ? `${p.history[0].steps} 步 · ${Math.max(1, Math.round((p.history[0].ms || 0) / 60000))} 分钟 · 上下文 ${p.budget && p.budget.ctxPct != null ? p.budget.ctxPct + '%' : '—'}` : '—')),
              h('td', { className: 'num' }, gates.total ? `${gates.done}/${gates.total}` : '—'),
              h('td', { className: 'num' }, (p.blockers && p.blockers.length) ? h('span', { className: 'daris2-badge human' }, p.blockers.length) : '—'),
              h('td', null, p.pending ? h('span', { className: 'daris2-badge review' }, `${p.pending} 轮未送审`) : h('span', { className: 'daris2-cell2 s' }, '无待送审'),
                h('div', { className:'daris2-cell2 s' }, reviewCounts(p.name)),
                h('div', { className: 'daris2-cell2 s' }, p.lastReview ? `${p.lastReview.verdict || ''}${p.lastReview.score != null ? ' ' + p.lastReview.score : ''}` : '未审'),
                mustLine(p.name) ? h('div', { style: { marginTop: 3 } }, h('span', { className: 'daris2-tag must' }, mustLine(p.name))) : null),
              h('td', { className: 'num' }, h('div', null, '¥' + (((p.today && p.today.cny) || 0)).toFixed(2)),
                h('div', { className: 'daris2-cell2 s' }, `${(p.totals && p.totals.runs) || 0} 轮 · ¥${((p.totals && p.totals.cny) || 0).toFixed(2)}`)),
              h('td', null, h('div', null, p.nextAt && !p.running ? ft(p.nextAt) : h('span', { className: 'daris2-cell2 s' }, p.running ? '本轮结束后' : (p.enabled ? '未排期' : '已停用'))),
                h('div', { className: 'daris2-cell2 s' }, p.running ? '跑完按间隔' : (!p.enabled ? '' : ({ quota: '等 GPT 额度', 'quota-stuck': '等额度恢复', mailbox: '等 Kimi 回件', interval: '按间隔' }[p.nextAtBasis] || '')))),
              h('td', { onClick: (e) => e.stopPropagation() }, h('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                p.running
                  ? h(Btn, { label: '停止', disabled: busy, onClick: () => act('stop', { root: p.root }) })
                  : p.enabled
                    ? h(Btn, { label: '运行一次', primary: true, disabled: busy, onClick: () => act('run', { root: p.root }) })
                    : h(Btn, {
                      label: armed === startKey(p) ? '确认启用' : '启用',
                      title: '启用后立即参与节拍：会起一轮、花额度、写产物；点两次确认',
                      primary: armed !== startKey(p),
                      success: armed === startKey(p),
                      disabled: busy,
                      onClick: () => (armed === startKey(p) ? (setArmed(''), act('start', { root: p.root })) : setArmed(startKey(p))),
                    }),
                h('span', { className: 'daris2-caret', style: { transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)' } }, '▾'))));
          }) : h('tr', null, h('td', { colSpan: 10 }, h('div', { className: 'daris2-empty' }, '没有符合条件的流水线。'))))));

      const tabsDef = [['overview', '总览', pipes.length], ['pipes', '流水线', pipes.length], ['artifacts', '产物', null], ['review', '审核', rvTotal], ['settings', '设置', null]];
      const tabs = h('div', { className: 'daris2-tabs' },
        tabsDef.map(([id, label, n]) => h('button', {
          key: id, className: 'daris2-tab' + (tab === id ? ' on' : ''), onClick: () => setTab(id),
        }, label, n != null ? h('span', { className: 'daris2-cnt' }, n) : null)));

      let body = null;

      if (tab === 'overview') {
        const q = ovQuery.trim().toLowerCase();
        const rows = pipes
          .filter((p) => (ovFilter === 'all' ? true : ovFilter === 'run' ? kindOf(p) === 'run' : ovFilter === 'human' ? ['human', 'error'].includes(kindOf(p)) : kindOf(p) === 'stop'))
          .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || (p.driver || '').toLowerCase().includes(q))
          .sort((a, b) => (ORDER[kindOf(a)] - ORDER[kindOf(b)]) || String(a.name).localeCompare(String(b.name)));
        const todayCny = sum((p) => (p.today && p.today.cny) || 0);
        const capCny = s.dailyCny != null ? s.dailyCny : 40;
        const capPct = capCny > 0 ? Math.round((todayCny / capCny) * 100) : 0;
        const kpi = [
          ['在跑', pipes.filter((p) => p.running).length, '/ ' + pipes.length + ' 条', 'run'],
          ['需人工', humanAll.length, humanAll.length ? '条待裁决' : '无待裁决', 'human'],
          ['等审核', sum((p) => p.pending), '轮未送审', 'review'],
          ['等回件', mb.pending || 0, '封 Kimi 邮箱', 'review'],
          ['今日轮数', sum((p) => (p.today && p.today.runs) || 0), `上限 ¥${capCny} · 已用 ${capPct}%`, 'idle'],
          ['今日成本', '¥' + sum((p) => (p.today && p.today.cny) || 0).toFixed(2), '今日累计', 'idle'],
          ['累计', sum((p) => (p.totals && p.totals.runs) || 0), '¥' + sum((p) => (p.totals && p.totals.cny) || 0).toFixed(2) + ' 累计花费', 'idle'],
          ['余额', bal.total == null ? '—' : '¥' + Number(bal.total).toFixed(2), bal.level === 'halt' ? '低于阈值，跑完即停' : `告警 ¥${bal.warnAt != null ? bal.warnAt : 10}`, bal.level === 'halt' ? 'err' : bal.level === 'warn' ? 'warn' : 'ok'],
        ];
        const detail = ovOpen ? pipes.find((p) => p.name === ovOpen) : null;
        body = h('div', null,
          h('div', { className: 'daris2-charts' }, [['runs','今日轮次'],['cny','今日成本（元）']].map(([field,title]) => {
            const max = pipes.reduce((m,p) => Math.max(m, Number(p.today && p.today[field]) || 0), 0);
            return h('section', { className: 'daris2-card', key: field },
              h('div', { className: 'daris2-card-h' }, title, h('small', null, scopeName || '全部流水线')),
              h('div', { className: 'daris2-card-b' }, pipes.map((p) => {
                const v = p.today && p.today[field];
                return h('div', { key: p.name, className: 'daris2-daily' }, h('button', { className:'daris2-link', onClick:()=>{changeScope(p.name);setTab('pipes');} },p.name),
                  h('span',null,h('i',{style:{width:(max && v != null ? 100*v/max : 0)+'%'}})),h('b',null,v == null ? '—' : field === 'cny' ? yu(v) : v));
              })));
          })),
          h('section', { className:'daris2-card' },
            h('div',{className:'daris2-card-h'},'流水线'),
            h('div',{className:'daris2-tblwrap'},h('table',{className:'daris2-tbl'},
              h('thead',null,h('tr',null,['名称','状态','当前阶段','今日轮次','今日成本','审核结论 · 各稿最近一轮','下轮时间'].map(title=>h('th',{key:title},title)))),
              h('tbody',null,pipes.map(p=>h('tr',{key:p.root},
                h('td',null,h('button',{className:'daris2-link',onClick:()=>{changeScope(p.name);setTab('pipes')}},p.name)),
                h('td',null,h('span',{className:'daris2-badge '+kindOf(p)},LABEL[kindOf(p)])),
                h('td',null,p.stage?.stage||'—'),h('td',null,p.today?.runs??'—'),
                h('td',null,p.today?.cny==null?'—':yu(p.today.cny)),h('td',null,reviewCounts(p.name)),
                h('td',null,p.nextAt?ft(p.nextAt):'—'))))))),
          h('div', { className: 'daris2-kpis' }, kpi.map(([k, v, x, kind], i) => h('div', { key: i, className: 'daris2-kpi is-' + kind },
            h('div', { className: 'daris2-kpi-k' }, k),
            h('div', { className: 'daris2-kpi-v' }, String(v)),
            h('div', { className: 'daris2-kpi-x', title: String(x) }, x)))),
          humanAll.length ? h('div', { className: 'daris2-band warn' },
            h('b', null, `需人工 ${humanAll.length} 项`),
            h('span', { style: { flex: '1 1 220px' } }, (humanAll[0].name || '') + ' · ' + (humanAll[0].title || '')),
            humanAll[0].file ? h(Btn, { label: '看稿件', onClick: () => openHumanDraft(humanAll[0]) }) : null,
            h(Btn, { label: '去处理', primary: true, onClick: () => setTab('review') })) : null,
          h('div', { className: 'daris2-toolbar' },
            h('div', { className: 'daris2-chips' },
              [['all', '全部'], ['run', '在跑'], ['human', '需人工'], ['stop', '已停止']].map(([id, label]) => {
                const n = id === 'all' ? pipes.length : pipes.filter((p) => (id === 'run' ? kindOf(p) === 'run' : id === 'human' ? ['human', 'error'].includes(kindOf(p)) : kindOf(p) === 'stop')).length;
                return h('button', { key: id, className: 'daris2-chip' + (ovFilter === id ? ' on' : ''), onClick: () => setOvFilter(id) }, label, h('span', { className: 'n' }, String(n)));
              })),
            h('span', { className: 'daris2-tag' }, `共 ${pipes.length} 条`),
            h('input', { className: 'daris-input daris2-search', placeholder: '搜索流水线 / 阶段', value: ovQuery, onChange: (e) => setOvQuery(e.target.value) }),
            h('div', { className: 'daris2-seg' },
              h('button', { className: ovView === 'table' ? 'on' : '', onClick: () => setOvView('table') }, '表格'),
              h('button', { className: ovView === 'card' ? 'on' : '', onClick: () => setOvView('card') }, '卡片'))),
          ovView === 'card'
            ? h('div', { className: 'daris-blocks' }, rows.map(card))
            : h('div', null, pipeTable(rows, ovOpen, setOvOpen),
              detail ? pipeDetail(detail) : h('div', { className: 'daris2-detail-empty' }, '点一行展开详情：正在做什么 / 计划与阶段树 / 运行数据 / 每轮指标 / 结论分布 / 操作分级。')));
      } else if (tab === 'pipes') {
        const humanList = humanAll;
        const q = pQuery.trim().toLowerCase();
        const rows = pipes
          .filter((p) => (pFilter === 'all' ? true : pFilter === 'run' ? kindOf(p) === 'run' : pFilter === 'human' ? ['human', 'error'].includes(kindOf(p)) : kindOf(p) === 'stop'))
          .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || (p.driver || '').toLowerCase().includes(q) || (p.root || '').toLowerCase().includes(q))
          .sort((a, b) => (ORDER[kindOf(a)] - ORDER[kindOf(b)]) || String(a.name).localeCompare(String(b.name)));
        const detail = pOpen ? pipes.find((p) => p.name === pOpen) : null;
        body = h('div', null,
          humanList.length
            ? h('div', { className: 'daris2-band warn' },
              h('b', null, `需要人处理 · ${humanList.length}`),
              h('span', { style: { flex: '1 1 260px' } }, `${humanList[0].name || ''} · ${humanList[0].title || ''}`),
              humanList[0].file ? h(Btn, { label: '看稿件', onClick: () => openHumanDraft(humanList[0]) }) : null,
              h(Btn, { label: '去审核页', primary: true, onClick: () => setTab('review') }))
            : null,
          h('div', { className: 'daris2-toolbar' },
            h('div', { className: 'daris2-chips' },
              [['all', '全部'], ['run', '在跑'], ['human', '需人工'], ['stop', '已停止']].map(([id, label]) => {
                const n = id === 'all' ? pipes.length : pipes.filter((p) => (id === 'run' ? kindOf(p) === 'run' : id === 'human' ? ['human', 'error'].includes(kindOf(p)) : kindOf(p) === 'stop')).length;
                return h('button', { key: id, className: 'daris2-chip' + (pFilter === id ? ' on' : ''), onClick: () => setPFilter(id) }, label, h('span', { className: 'n' }, String(n)));
              })),
            h('input', { className: 'daris-input daris2-search', placeholder: '搜索名称 / 驱动 / 路径', value: pQuery, onChange: (e) => setPQuery(e.target.value) }),
            h('div', { className: 'daris2-seg' },
              h('button', { className: pView === 'table' ? 'on' : '', onClick: () => setPView('table') }, '表格'),
              h('button', { className: pView === 'card' ? 'on' : '', onClick: () => setPView('card') }, '卡片'))),
          pView === 'card'
            ? (pipes.length ? h('div', { className: 'daris-blocks' }, rows.map(card)) : h('div', { className: 'daris2-empty' }, '还没有流水线。'))
            : (detail
              ? h('div', null,
                h('div', { className: 'daris2-backline' },
                  h('button', { className: 'daris2-link', onClick: () => changeScope('') }, '← 全部流水线'),
                  h('b', null, detail.name)),
                pipeDetail(detail))
              : h('div', null, pipeTable(rows, pOpen, changeScope),
                h('div', { className: 'daris2-detail-empty' }, '点一行展开详情；详情里带完整的分级操作。'))),
          h(Fold, { title: '添加流水线', meta: '自动识别 FRRS / ARIS 目录', defaultOpen: false },
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              h('input', { className: 'daris-input', style: { flex: '1 1 220px' }, placeholder: '流水线根目录，例如 C:/Users/me/Frrs/second', value: newRoot, onChange: (e) => setNewRoot(e.target.value) }),
              h(Btn, { label: '添加', primary: true, disabled: busy || !newRoot.trim(), onClick: async () => { const r = await act('add', { root: newRoot.trim() }); if (r) setNewRoot(''); } }))));
      } else if (tab === 'artifacts') {
        body = h(ArtifactsTab, { key: artifactName, pipes, scope: artifactName });
      } else if (tab === 'review') {
        const by = rv.byLatest || {};
        const chanCount = {};
        rvGroups.forEach((g) => { const c = String((g.latest && g.latest.channel) || 'other').toLowerCase(); chanCount[c] = (chanCount[c] || 0) + 1; });
        const chList = Object.keys(chanCount);
        const gptWindows = (quota.windows || []).map((w) => `${w.key} 已用 ${Math.round(w.usedPercent || 0)}%`).join(' · ');
        const lockTag = lock.locked && !lock.expired ? `运行中：${lock.channel} · ${lock.task || '-'}` : '当前空闲';
        const scopeGroups = scopeName ? rvGroups.filter((g) => String(g.name) === scopeName) : rvGroups;
        const scopeBy = { accept: 0, revise: 0, reject: 0, unknown: 0 };
        const scopeChan = {};
        scopeGroups.forEach((g) => {
          const vv = String((g.latest && g.latest.verdict) || 'unknown').toLowerCase();
          if (scopeBy[vv] != null) scopeBy[vv] += 1; else scopeBy.unknown += 1;
          const cc = String((g.latest && g.latest.channel) || 'other').toLowerCase();
          scopeChan[cc] = (scopeChan[cc] || 0) + 1;
        });
        const scopeTotal = scopeGroups.length;
        const kpi = [
          ['全局审核总数', rvTotal, `${rvGroups.length} 组稿件`, 'run'],
          ['全局通过', by.accept || 0, 'accept', 'ok'],
          ['全局需修改', by.revise || 0, 'revise', 'warn'],
          ['待人工', humanAll.length, '条待裁决', humanAll.length ? 'err' : 'idle'],
          ['全局通道', chList.length || '—', chList.map((c) => CH_LABEL[c] || c).join(' / ') || '没有记录', 'idle'],
          ['全局 GPT 额度', quota.ok ? '正常' : '未连接', (gptWindows || (quota.error || (quota.plan ? String(quota.plan) : '没有额度数据'))) + fresh(quota), quota.ok ? 'run' : 'dim'],
        ];
        const pie = (obj, colors, names) => {
          const segs = Object.keys(obj).filter((k) => obj[k]).map((k) => ({ label: (names && names[k]) || k, value: obj[k], color: (colors && colors[k]) || '#8a8a8a' }));
          return segs;
        };
        const quotaNote = rv.quotaNote;
        body = h('div', null,
          quotaNote ? h('div', { className: 'daris2-band warn daris2-quota-band' },
            h('b', null, 'GPT 外审 · 本小时额度用完'),
            h('span', { className: 'daris2-quota-note' }, `已用 ${quotaNote.used}/${quotaNote.limit}，${quotaNote.freeAtLocal || hhmm(quotaNote.freeAt)} 之后自动恢复；期间不送审、不占用送审次数`)) : null,
          h('section', { className:'daris2-card daris2-review-summary' },
            h('div',{className:'daris2-card-h'},'审核概览',h('small',null,'当前范围 · '+(scopeName||'全部流水线')),
              h(Btn,{label:'全局审核线路 · '+((cx.route && cx.route.channel)||'auto')+'　查看设置',onClick:()=>{setRouteFocus({v:true,n:Date.now()});setTab('settings')}})),
          h('div', { className: 'daris2-charts' },
            h('div', { className: 'daris2-card' },
              h('div', { className: 'daris2-card-h' },
                '结论分布',
                h('span', { className: 'daris2-tag', style: { marginLeft: 'auto' } },
                  `${scopeTotal} 份` + (mustSum || shouldSum ? ` · MUST ${mustSum} · SHOULD ${shouldSum}` : ''))),
              h('div', { className: 'daris2-card-b' },
                h(PieBox, { segs: pie(scopeBy, { accept: '#18794e', revise: '#b45309', reject: '#b42318', unknown: '#8a8a8a' }, { accept: '通过', revise: '需修改', reject: '退回', unknown: '未知' }) }))),
            h('div', { className: 'daris2-card' },
              h('div', { className: 'daris2-card-h' },
                '通道分布',
                h('span', { className: 'daris2-tag', style: { marginLeft: 'auto' } }, scopeName || '全部流水线')),
              h('div', { className: 'daris2-card-b' },
                h(PieBox, { segs: pie(scopeChan, { kimi: '#2563eb', gpt: '#7c3aed', human: '#b45309', other: '#8a8a8a' }, CH_LABEL) })))),
          h('div', { className: 'daris2-kpis' }, kpi.map(([k, v, x, kind], i) => h('div', { key: i, className: 'daris2-kpi is-' + kind },
            h('div', { className: 'daris2-kpi-k' }, k),
            h('div', { className: 'daris2-kpi-v' }, String(v)),
            h('div', { className: 'daris2-kpi-x', title: String(x) }, x))))),
          humanAll.length
            ? h('div', null, humanAll.slice(0, 3).map((a, i) => {
              const pp = pipes.filter((x) => x.name === a.name)[0];
              const root = pp ? pp.root : a.name;
              const note = humanNotes[root] || '';
              const summary = `${a.name || ''} · ${a.title || ''}\n${a.detail || ''}`.trim();
              return h('div', { key: i, className: 'daris2-gate' },
                h('div', { className: 'daris2-gate-h' },
                  h('b', null, '待人工裁决'),
                  h('span', { className: 'daris2-tag bad' }, a.level === 'bad' ? '阻断' : '注意'),
                  h('span', { className: 'daris2-tag' }, a.name || '—'),
                  a.at ? h('span', { className: 'daris2-tag' }, ft(a.at)) : null,
                  h('span', { style: { flex: 1 } }),
                  a.file ? h(Btn, { label: '打开清单', onClick: async () => { try { const res = await getArtifactFile(a.name, a.file); setDrawer({ kind: 'file', title: a.title, root: `${a.name}/${a.file}`, text: String((res && res.text) || '（空）') }); } catch (e) { setToast(`打开失败：${String((e && e.message) || e)}`); } } }) : null),
                h('div', { className: 'daris2-gate-b' },
                  h('div', { className: 'daris2-gate-reason' }, a.title || '需要人工确认'),
                  a.detail ? h('div', { className: 'daris2-gate-advice' }, a.detail) : null,
                  h('textarea', {
                    className: 'daris2-ta', placeholder: '给流水线的回复（会作为 human.reply 的正文）',
                    value: note, onChange: (e) => setHumanNote(root, e.target.value),
                  }),
                  h('div', { className: 'daris2-gate-acts' },
                    h(Btn, { label: '提交并批准重启', primary: true, disabled: busy || !note.trim(), onClick: async () => { if (note.trim()) { await act('human.reply', { root, text: note.trim(), restart: true }); setHumanNote(root, ''); } } }),
                    h(Btn, { label: '只留备注', disabled: busy || !note.trim(), onClick: async () => { if (note.trim()) { await act('human.reply', { root, text: note.trim(), restart: false }); setHumanNote(root, ''); } } }),
                    h(Btn, { label: '复制摘要另开对话', onClick: () => { copyText(summary); setToast('已复制摘要，可粘贴到新会话'); } }))));
            }))
            : null,
          h(Fold, { title: '稿件审核记录', meta: `共 ${scopeTotal} 份`, force: foldForce, defaultOpen: true },
            h(ReviewResults, { key:scopeName,reviews:{...rv,groups:scopeGroups,byLatest:scopeBy},pipe:scopeName })),
          h(Fold, { title: '审核锁 · 同一时刻只跑一条', meta: lockTag, right: lockTag, force: foldForce, defaultOpen: false },
            h('div', null,
              h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 } },
                h('span', { className: 'daris2-tag' }, lockTag),
                lock.locked && !lock.expired && lock.ageMs ? h('span', { className: 'daris2-tag' }, `${Math.round(lock.ageMs / 60000)} 分钟前开始`) : null),
              h('div', { className: 'daris2-flow', style: { marginTop: 8 } }, 'Kimi 投递占锁、收件解锁；GPT 派单占锁、跑完解锁。锁没放掉之前，另一个通道的派单会被直接拒绝。'),
              lock.file ? h('div', { className: 'daris2-prev-path', style: { padding: '6px 0 0' } }, lock.file) : null)),
          h(Fold, { title: 'Kimi 邮箱 · 投递与取件', meta: `待处理 ${mb.pending || 0}`, force: foldForce, defaultOpen: false },
            h('div', null,
              h(Sub, { title: '执行权', meta: ho.mode === 'kimi' ? 'Kimi Work' : 'DSH' },
                h('div', { className: 'daris2-flow' }, '同一时刻只能有一方执行。交回 Kimi 时会先停掉本机所有流水线，DSH 只保留收件。'),
                h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 } },
                  h(Btn, { label: 'DSH 接管', primary: ho.mode === 'dsh', disabled: busy, onClick: () => act('handoff.set', { mode: 'dsh' }) }),
                  h(Btn, { label: '交回 Kimi Work', primary: ho.mode === 'kimi', disabled: busy, onClick: () => act('handoff.set', { mode: 'kimi' }) }),
                  h('span', { className: 'daris2-tag' }, ho.at ? `最近切换 ${ft(ho.at)}` : '尚未切换过'))),
              h(Sub, { title: '邮箱与收件', meta: `${mb.pending || 0} 封待处理` },
                h('div', { className: 'daris2-prev-path', style: { padding: 0 } }, mb.path || '未配置'),
                mb.items && mb.items.length
                  ? h('ul', { style: { margin: '8px 0 0 18px', padding: 0, fontSize: 12 } }, mb.items.map((it, i) => h('li', { key: i }, it.text)))
                  : h('div', { className: 'daris2-tag', style: { marginTop: 6 } }, mb.exists ? '没有待处理请求' : '邮箱目录不存在'),
                h('div', { style: { marginTop: 8 } }, h(Btn, { label: '立即收件', disabled: busy, onClick: () => act('mailbox.collect') }))),
              h(Sub, { title: '取件节奏', meta: kimiMin ? `每 ${kimiMin} 分钟` : '' },
                h('div', { className: 'daris2-flow' }, '填 Kimi automation 里实际配置的周期与开始时刻：DSH 按 2 倍周期起跑（保证取件快于生成），并把起跑相位错开半个周期，避免和 Kimi 撞在同一分钟。'),
                h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' } },
                  h('input', { className: 'daris-input', style: { width: 72 }, type: 'number', value: kimiMin, onChange: (e) => setKimiMin(e.target.value) }),
                  h('span', { className: 'daris2-tag' }, '分钟'),
                  h('input', { className: 'daris-input', style: { width: 120 }, type: 'time', step: 60, value: kimiStart, onChange: (e) => setKimiStart(e.target.value) }),
                  h('span', { className: 'daris2-tag' }, '首次取件时刻'),
                  h(Btn, { label: '保存', primary: true, disabled: busy, onClick: () => act('settings.save', { settings: { kimi: { intervalMinutes: Number(kimiMin) || 0, startTime: kimiStart.trim() } } }) })),
                h('div', { className: 'daris2-tag', style: { marginTop: 8 } }, `两次取件之间最多 ${(Number(kimiMin) || 30) * 2} 分钟`)),
              h(Sub, { title: '取件提示词', meta: kimiPrompt ? `${kimiPrompt.length} 字` : '未生成' },
                h('div', { className: 'daris2-flow' }, '生成后整段贴进 Kimi Work 的定时任务；邮箱地址与唤醒间隔已按当前设置填好。规则是一轮只取一条，剩下的留到下次唤醒。'),
                h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 } },
                  h(Btn, { label: kimiPrompt ? '重新生成' : '生成提示词', primary: true, disabled: busy, onClick: loadKimiPrompt }),
                  kimiPrompt ? h(Btn, { label: '复制', disabled: busy, onClick: copyKimiPrompt }) : null,
                  kimiPrompt ? h(Btn, { label: '存到文件', disabled: busy, onClick: saveKimiPrompt }) : null),
                kimiPrompt ? h('textarea', { className: 'daris2-ta mono', style: { minHeight: 240 }, value: kimiPrompt, readOnly: true }) : null))),
          h(Fold, { title: 'ChatGPT 后台 · 七组设置', meta: cf.enabled ? '已启用' : '未启用', right: cf.enabled ? '已启用' : '未启用', force: foldForce, defaultOpen: false },
            h(GptReviewCards, { codex: cx, pipes:allPipes, busy, act })),
          h(Fold, { title: '说明 · 通道分工与不可信边界', force: foldForce, defaultOpen: false },
            h('div', { className: 'daris2-flow' },
              h('div', null, '两条外审通道：Kimi 走邮箱文件（in/ 投递、out/ 回件），GPT 走 codex CLI。任何一条都不改稿件，只产出评审意见；真正落笔的仍是流水线自己的写作阶段。'),
              h('div', null, '评审意见一律视为「不可信输入」：只提取结论、分数与 MUST 条目，不让其中的指令进入执行上下文。'),
              h('div', null, '只读三层：面板只读状态、产物只读浏览、动作按 L0–L3 分级；破坏性动作需要二次点击确认。'))));
      } else {
        const f = form || { mailbox: '', model: 'deepseek-flash', maxConcurrent: '3', maxMinutes: '120' };
        const field = (label, ctl) => h('div', { className: 'daris2-field' }, h('label', null, label), h('div', { className: 'ctl' }, ctl));
        body = h('div', null,
          h(RouteCard, { codex: cx, busy, act, pipes: allPipes, force: routeFocus }),
          h(Fold,{title:'GPT 后台启停 · 全局',defaultOpen:false},h(Btn,{label:cf.enabled?'停用':'启用',disabled:busy,onClick:()=>act('codex.save',{codex:{enabled:!cf.enabled}})})),
          h(Fold,{title:'流水线运行配置 · 只读',defaultOpen:false},pipes.map((p)=>h('p',{key:p.name},p.name+' · '+(p.model||'—')+' · 间隔 '+(p.intervalMinutes??'—')+' 分钟 · '+(p.enabled?'已启用':'已停用')+' · 每日轮数 '+(p.limits?.dailyRuns===0?'不限':p.limits?.dailyRuns??'—')+' · 每日金额 '+(p.limits?.dailyCny===0?'不限':p.limits?.dailyCny??'—')))),
          h('details', { className: 'daris2-fieldtbl' },
            h('summary', null, '邮箱与运行参数 · 全局'),
            field('邮箱目录', h('input', { className: 'daris-input', style: { flex: '1 1 220px' }, value: f.mailbox, onChange: (e) => setForm({ ...f, mailbox: e.target.value }) })),
            field('默认模型', h('select', { className: 'daris-input', value: f.model, onChange: (e) => setForm({ ...f, model: e.target.value }) },
              h('option', { value: 'deepseek-flash' }, 'deepseek-flash'),
              h('option', { value: 'deepseek-v4-pro' }, 'deepseek-v4-pro'))),
            field('同时运行', h('input', { className: 'daris-input', style: { width: 90 }, type: 'number', min: 1, value: f.maxConcurrent, onChange: (e) => setForm({ ...f, maxConcurrent: e.target.value }) })),
            field('单轮超时', h('input', { className: 'daris-input', style: { width: 90 }, type: 'number', min: 5, value: f.maxMinutes, onChange: (e) => setForm({ ...f, maxMinutes: e.target.value }) }), h('span', { className: 'daris2-tag' }, '分钟')),
            field('卡片事件条数', h('input', { className: 'daris-input', style: { width: 90 }, type: 'number', min: 0, max: 30, value: evCap, onChange: (e) => { evCapDirty.current = true; setEvCap(e.target.value); } })),
          h('div', { className: 'daris2-toolbar' },
            h(Btn, { label: '保存设置', primary: true, disabled: busy, onClick: () => act('settings.save', { settings: { mailbox: f.mailbox, model: f.model, maxConcurrent: Number(f.maxConcurrent), maxMinutes: Number(f.maxMinutes), eventsPerCard: Number(evCap) || 0 } }) }),
            h('span', { className: 'daris2-tag' }, '保存后立即生效；邮箱目录变更会让下一次收件改道。'))),
          h('div', { className: 'daris2-grid2' },
            h('div', { className: 'daris2-card' },
              h('div', { className: 'daris2-card-h' }, '运行环境'),
              h('div', { className: 'daris2-card-b' },
                h('dl', { className: 'daris2-kv' },
                  h('dt', null, 'DSH 驱动'), h('dd', null, `${data.dsh && data.dsh.kind} · ${(data.dsh && data.dsh.file) || ''}`),
                  h('dt', null, '工作区'), h('dd', { style: { wordBreak: 'break-all' } }, data.workspace),
                  h('dt', null, '注册表'), h('dd', { style: { wordBreak: 'break-all' } }, data.registryFile),
                  h('dt', null, '更新于'), h('dd', null, ft(data.at))),
                h('div', { className: 'daris2-tag', style: { marginTop: 8 } }, '后台节拍跑在 DSH 进程里：关掉面板仍在，退出 DSH 才停。'))),
            h('div', { className: 'daris2-card' },
              h('div', { className: 'daris2-card-h' }, '工作区'),
              h('div', { className: 'daris2-card-b' },
                h('div', { className: 'daris2-flow' }, '登记入口在流水线表格的「添加到工作区」：把该流水线当前根目录挂成 DSH 工作区分组；已登记时按钮变成「会话已挂到工作区」，点一下只补挂新会话。'),
                wsPaths.length
                  ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 } }, wsPaths.map((w, i) =>
                    h('span', { key: i, className: 'daris2-tag', title: w }, w.split(/[\\/]/).filter(Boolean).pop() || w)))
                  : h('div', { className: 'daris2-empty' }, '还没有登记工作区。')))));
      }

      const drawerEl = drawer
        ? h('div', { className: 'daris2-fold open', style: { marginTop: 16 } },
          h('div', { className: 'daris2-fold-h', style: { cursor: 'default' } },
            h('span', null, drawer.kind === 'prompt' ? '提示词' : drawer.kind === 'session' ? `会话 · ${(drawer.data && drawer.data.title) || (drawer.data && drawer.data.id) || ''}` : drawer.kind === 'file' ? `文件 · ${drawer.title || ''}` : `日志 · ${(drawer.data && drawer.data.runId) || ''}`),
            h('span', { className: 'sp' }),
            drawer.kind === 'prompt'
              ? h(Btn, { label: '保存提示词', primary: true, disabled: busy, onClick: async () => { await act('prompt.set', { root: drawer.root, text: drawer.text }); setDrawer(null); } })
              : null,
            h(Btn, { label: '关闭', onClick: () => setDrawer(null) })),
          h('div', { className: 'daris2-fold-b' },
            h('div', { className: 'daris2-prev-path', style: { padding: '0 0 8px' } }, drawer.root),
            drawer.kind === 'prompt'
              ? h('textarea', { className: 'daris2-ta mono', style: { minHeight: 260 }, value: drawer.text, onChange: (e) => setDrawer({ ...drawer, text: e.target.value }) })
              : drawer.kind === 'file'
                ? h('pre', { className: 'daris-pre', style: { maxHeight: 420 } }, String(drawer.text || '（空）').slice(0, 20000))
                : drawer.kind === 'session'
                  ? sessionEl(drawer.data)
                  : h('div', null,
                    h('div', { className: 'daris2-kpi-k' }, '最终输出'),
                    h('pre', { className: 'daris-pre' }, (drawer.data && drawer.data.final) || '（空）'),
                    h('div', { className: 'daris2-kpi-k', style: { marginTop: 8 } }, 'stderr'),
                    h('pre', { className: 'daris-pre' }, (drawer.data && drawer.data.stderr) || '（空）'),
                    h('div', { className: 'daris2-kpi-k', style: { marginTop: 8 } }, '事件尾部'),
                    h('pre', { className: 'daris-pre' }, (drawer.data && drawer.data.events) || '（空）'))))
        : null;

      const balCls = bal.total == null ? '' : bal.level === 'halt' ? ' halt' : bal.level === 'warn' ? ' warn' : '';
      const subParts = [
        h('span', { key: 'n' }, `${pipes.length} 条流水线`),
        h('span', { key: 's1', className: 'sep' }, '·'),
        h('span', { key: 'r' }, `${data.running || 0} 条在跑`),
        h('span', { key: 's2', className: 'sep' }, '·'),
        h('span', { key: 't' }, '每 60 秒自动节拍'),
        h('span', { key: 's3', className: 'sep' }, '·'),
        h(Ago, { key: 'ago', at: refreshAt }),
        h('span', { key: 's4', className: 'sep' }, '·'),
        h('span', { key: 'bal', className: 'bal' + balCls, title: bal.error || '' },
          `余额 ${bal.total == null ? '未知' : '¥' + Number(bal.total).toFixed(2)}`),
        fresh(bal) ? h('span', { key: 'balage', className: 'daris2-fresh' }, fresh(bal).replace(/^ · /, '')) : null,
        h('button', { key: 'balupd', className: 'daris2-fresh dari2-linkish', title: '立即重新查询余额（会访问计费接口）', disabled: busy, onClick: () => act('balance.check', { force: true }) }, busy ? '查询中…' : '立即更新'),
      ];

      const head = h('div', { className: 'daris2-head' },
        h('div', { className: 'daris2-head-main' },
          h('h1', { className: 'daris2-title' }, 'Aris_Dsh'),
          h('div', { className: 'daris2-subtitle' }, subParts)),
        h('div', { className: 'daris2-head-actions' },
          h(Btn, { label: '刷新', disabled: busy, onClick: load }),
          h(Btn, {
            label: `自动节拍 ${autoSec}s`,
            title: '本面板的轮询间隔（不影响后台 60 秒节拍）：点击切换 10 / 30 / 60 / 5 秒',
            onClick: () => setAutoSec((x) => (x === 10 ? 30 : x === 30 ? 60 : x === 60 ? 5 : 10)),
          }),
          tab === 'review'
            ? h(Btn, {
              label: expandAll ? '收起全部' : '展开全部',
              onClick: () => { const next = !expandAll; setExpandAll(next); setFoldForce((f) => ({ v: next, n: f.n + 1 })); },
            })
            : null,
          h(Btn, { label: '立即节拍', disabled: busy, onClick: () => act('tick', { force: true }) }),
          h(Btn, { label: `收件 ${mb.pending || 0}`, disabled: busy, onClick: () => act('mailbox.collect') })));

      return h('div', { className: 'daris daris2' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS + CSS2 + previewLayout } }),
        head,
        toast ? h('div', { className: `daris-toast ${/失败|无法|错误/.test(toast) ? 'bad' : ''}` }, toast) : null,
        tabs,
        h('label', { className: 'daris2-scope' }, '流水线范围　',
          h('select', { className: 'daris-input', value: tab === 'artifacts' ? artifactName : scopeName, onChange: (e) => changeScope(e.target.value) },
            tab !== 'artifacts' ? h('option', { value: '' }, '全部流水线') : null,
            names.map((name) => h('option', { key:name,value:name },name)))),
        h('div', { className: 'daris2-body' + (tab === 'artifacts' ? ' arts' : '') }, body ? h(TabBoundary, { k: tab }, body) : null),
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
