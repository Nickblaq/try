export const STUDIO_STYLES = `
:root{
  --bg:#f7f6f2;--surface:#fff;--surface-2:#fbfaf7;
  --border:#e7e5de;--border-strong:#d6d3c9;
  --ink:#14171a;--ink-soft:#5b6065;--ink-mute:#8a8f95;
  --accent:#4f46e5;--accent-soft:#eef2ff;
  --render:#2e9c7a;--render-soft:#e8f8f1;
  --warn:#d97706;--warn-soft:#fef4e6;
  --danger:#dc2626;--danger-soft:#fdeaea;
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --font-mono:"SF Mono",ui-monospace,Menlo,Consolas,monospace;
  --radius:14px;--radius-lg:20px;
}
*{box-sizing:border-box}
.app{min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--font-sans);display:flex;flex-direction:column;padding-bottom:76px}
.topbar{display:flex;align-items:center;gap:10px;padding:14px 16px 8px;position:sticky;top:0;background:var(--bg);z-index:5}
.iconbtn{width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--ink);flex-shrink:0;cursor:pointer}
.iconbtn:hover{background:var(--surface-2)}
.title{flex:1;display:flex;flex-direction:column;min-width:0}
.titleMain{font-size:15px;font-weight:600;line-height:1.2}
.titleSub{font-size:12px;color:var(--ink-soft);font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.main{flex:1;overflow-y:auto}
.pad{padding:6px 16px 24px;display:flex;flex-direction:column;gap:18px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px}
.rowHead{display:flex;justify-content:space-between;align-items:baseline;padding:0 4px 8px}
.sectionTitle{font-size:13px;font-weight:600;color:var(--ink);margin:0}
.rowAction{background:transparent;border:none;color:var(--accent);font-size:12.5px;font-weight:500;cursor:pointer;padding:0}
.empty{text-align:center;padding:40px 12px;color:var(--ink-mute);display:flex;flex-direction:column;gap:6px}
.empty p{font-size:13.5px;font-weight:600;color:var(--ink-soft);margin:0}
.empty span{font-size:12px}
.errorBox{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--danger-soft);color:var(--danger);font-size:12.5px;font-weight:500}

.dropCard{display:flex;flex-direction:column;align-items:center;gap:10px;padding:32px 20px;border:1.5px dashed var(--border-strong);background:var(--surface-2);cursor:pointer;text-align:center;transition:background .15s,border-color .15s;outline:none}
.dropCard:hover,.dropCard:focus-visible{background:var(--accent-soft);border-color:var(--accent)}
.dropCardBusy{cursor:default}
.dropCardBusy:hover{background:var(--surface-2);border-color:var(--border-strong)}
.dropIcon{width:52px;height:52px;border-radius:14px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center}
.dropTitle{font-size:15px;font-weight:600}
.dropHint{font-size:12.5px;color:var(--ink-soft);line-height:1.5;max-width:280px}
.dropProgress{width:220px;height:6px;border-radius:3px;background:var(--border);overflow:hidden;margin-top:4px}
.dropProgressBar{height:100%;background:var(--accent);transition:width .15s ease}

.urlCard{display:flex;flex-direction:column;gap:10px}
.urlHead{display:flex;align-items:center;gap:8px;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.urlInput{width:100%;padding:11px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg);font-size:14px;font-family:var(--font-mono);color:var(--ink);-webkit-appearance:none}

.assetCard{display:flex;align-items:center;gap:12px;cursor:pointer;outline:none}
.assetCard:focus-visible{border-color:var(--accent)}
.assetIcon{width:46px;height:46px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.assetMeta{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.assetLabel{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600}
.assetName{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.assetInfo{font-size:11.5px;color:var(--ink-soft);font-family:var(--font-mono)}
.assetActions{display:flex;gap:6px}
.assetRow{cursor:default;padding:10px 12px}
.assetMetaBtn{background:transparent;border:none;padding:0;cursor:pointer;text-align:left;font-family:inherit;color:inherit}
.assetMetaBtn:hover .assetName{color:var(--accent)}
.iconAction{width:34px;height:34px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--ink-soft);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0}
.iconAction:hover:not(:disabled){background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.iconAction:disabled{opacity:.4;cursor:default}
.iconActionDanger:hover:not(:disabled){background:var(--danger-soft);border-color:var(--danger);color:var(--danger)}

.mediaCard{display:flex;flex-direction:column;gap:12px;padding:12px}
.mediaThumb{position:relative;height:150px;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;color:#fff}
.mediaDuration{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.7);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;font-family:var(--font-mono)}
.mediaMeta{display:flex;flex-direction:column;gap:3px}
.mediaTitle{font-size:14px;font-weight:600;line-height:1.3}
.mediaSub{font-size:12.5px;color:var(--ink-soft)}
.mediaStats{font-size:11.5px;color:var(--ink-mute);font-family:var(--font-mono)}
.mediaActions{display:flex;gap:6px;flex-wrap:wrap}

.quickGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px}
.quickCard{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:11.5px;font-weight:500;color:var(--ink);font-family:inherit}
.quickCard>svg{color:var(--accent)}

.favScroll{display:flex;gap:10px;overflow-x:auto;padding-bottom:2px}
.favCard{min-width:132px;display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;text-align:left;font-family:inherit}
.favIcon{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center}
.favName{font-size:12.5px;font-weight:600;line-height:1.3;color:var(--ink)}
.favTier{font-size:11px;color:var(--ink-mute);font-family:var(--font-mono)}

.pipelinePreview{display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left;font-family:inherit;width:100%}
.pipelinePreview>svg:first-child{color:var(--accent);flex-shrink:0}
.pipelinePreviewText{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.pipelinePreviewTitle{font-size:14px;font-weight:600;color:var(--ink)}
.pipelinePreviewSub{font-size:12px;color:var(--ink-soft)}

.searchWrap{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--ink-soft)}
.searchInput{flex:1;border:none;outline:none;background:transparent;font-size:14px;color:var(--ink);font-family:var(--font-sans);min-width:0}
.filterScroll{display:flex;gap:6px;overflow-x:auto;padding:2px 0}
.filterChip{padding:6px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--border);font-size:12.5px;color:var(--ink-soft);cursor:pointer;white-space:nowrap;font-family:inherit}
.filterActive{background:var(--ink);color:#fff;border-color:var(--ink)}

.catalog{display:flex;flex-direction:column;gap:18px}
.tierSection{display:flex;flex-direction:column;gap:8px}
.tierHead{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600;margin:0;padding-left:4px}
.opList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.opCard{width:100%;display:flex;gap:12px;align-items:center;padding:12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);text-align:left;cursor:pointer;font-family:inherit;color:var(--ink)}
.opCard:hover:not(:disabled){border-color:var(--accent)}
.opCard:disabled{opacity:.45;cursor:not-allowed}
.opIcon{width:36px;height:36px;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.opBody{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.opName{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px;color:var(--ink)}
.opDesc{font-size:12px;color:var(--ink-soft);line-height:1.4}
.opMeta{font-size:11px;font-family:var(--font-mono);color:var(--ink-mute);margin-top:2px}
.chainBadge{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;background:var(--render-soft);color:var(--render);padding:2px 6px;border-radius:4px}

.flowWrap{display:flex;flex-direction:column}
.flowRow{display:flex;flex-direction:column;align-items:stretch}
.flowLine{width:2px;height:20px;background:var(--border-strong);margin:0 auto;border-radius:1px}
.flowNode{display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);text-align:left;width:100%}
.flowNodeIcon{width:36px;height:36px;border-radius:10px;background:var(--bg);color:var(--ink-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.flowNodeIconOp{background:var(--accent-soft);color:var(--accent)}
.flowNodeBody{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;text-align:left}
.flowNodeBodyBtn{background:transparent;border:none;padding:0;cursor:pointer;font-family:inherit;color:var(--ink)}
.flowNodeLabel{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600}
.flowNodeValue{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.flowReorder{display:flex;flex-direction:column;gap:2px}
.flowReorder button{border:none;background:transparent;color:var(--ink-mute);padding:2px;cursor:pointer;border-radius:4px;line-height:0}
.flowReorder button:disabled{opacity:.3;cursor:default}
.flowDelete{border:none;background:transparent;color:var(--ink-mute);padding:6px;cursor:pointer;border-radius:6px;line-height:0}
.flowDelete:hover{background:var(--danger-soft);color:var(--danger)}
.flowAdd{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:var(--radius);background:var(--surface-2);border:1px dashed var(--border-strong);color:var(--ink-soft);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}
.flowAdd:hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.flowEmpty{text-align:center;padding:24px;color:var(--ink-mute);display:flex;flex-direction:column;align-items:center;gap:6px}
.flowEmpty p{font-size:13px;font-weight:600;color:var(--ink-soft);margin:4px 0 0}
.flowEmpty span{font-size:12px}

.statsCard{display:flex;justify-content:space-around;gap:8px;padding:14px 8px}
.stat{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}
.statValue{font-size:16px;font-weight:700;font-family:var(--font-mono)}
.statLabel{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600}

.primaryBtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px 18px;background:var(--ink);color:#fff;border:none;border-radius:999px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font-sans)}
.primaryBtn:disabled{opacity:.4;cursor:default}
.ghostBtnWide{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 18px;background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:999px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}
.miniBtn{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--border);font-size:11.5px;color:var(--ink-soft);cursor:pointer;font-family:var(--font-mono)}
.miniBtn:hover{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}
.miniBtnDanger:hover{background:var(--danger-soft);color:var(--danger);border-color:var(--danger)}

.runHeader{display:flex;align-items:center;gap:20px;padding:20px}
.runRingWrap{position:relative;width:110px;height:110px;flex-shrink:0}
.runRing{width:100%;height:100%}
.runRingText{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.runPct{font-size:22px;font-weight:700;font-family:var(--font-mono)}
.runState{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600}
.runMeta{display:flex;flex-direction:column;gap:4px;min-width:0}
.runSource{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.runStep{font-size:12px;color:var(--ink-soft);line-height:1.4}

.logCard{padding:0;overflow:hidden}
.logHead{display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600}
.logBody{margin:0;padding:12px 14px;font-family:var(--font-mono);font-size:11.5px;color:#d1d5db;line-height:1.55;background:#0e0f11;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow-y:auto}

.stepList{display:flex;flex-direction:column;gap:6px}
.stepRow{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);font-size:13px}
.stepDone{opacity:.55}
.stepActive{border-color:var(--accent);background:var(--accent-soft)}
.stepDot{width:22px;height:22px;border-radius:50%;background:var(--bg);color:var(--ink-soft);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.stepDone .stepDot{background:var(--render-soft);color:var(--render)}
.stepActive .stepDot{background:var(--accent);color:#fff}
.stepName{flex:1;font-weight:500}
.stepPct{font-family:var(--font-mono);font-size:12px;color:var(--accent);font-weight:700}

.resultHero{display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px 16px;text-align:center}
.resultIcon{width:56px;height:56px;border-radius:50%;background:var(--render-soft);color:var(--render);display:flex;align-items:center;justify-content:center}
.resultIconFail{background:var(--danger-soft);color:var(--danger)}
.resultTitle{font-size:17px;font-weight:700;margin:8px 0 0}
.resultSub{font-size:12.5px;color:var(--ink-soft);margin:0;line-height:1.5}
.videoPreview{display:flex;gap:12px;align-items:center}
.videoThumb{width:96px;height:64px;border-radius:10px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.videoMeta{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
.videoName{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.videoInfo{font-size:12px;color:var(--ink-soft);font-family:var(--font-mono)}
.outputList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.outputRow{display:flex;align-items:center;gap:10px;padding:12px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);text-decoration:none;color:var(--ink);font-family:inherit}
.outputRow:hover{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.outputName{flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.outputNameBtn{flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;background:transparent;border:none;padding:0;cursor:pointer;font-family:inherit;color:inherit}
.outputNameBtn:hover{color:var(--accent)}
.outputSize{font-size:11.5px;color:var(--ink-mute);font-family:var(--font-mono)}
.resultActions{display:flex;flex-direction:column;gap:8px}

.sheetOverlay{position:fixed;inset:0;background:rgba(20,23,26,.32);display:flex;align-items:flex-end;justify-content:center;z-index:40;animation:fadeIn .15s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.sheet{width:100%;max-width:560px;max-height:88vh;overflow-y:auto;background:var(--surface);border-radius:20px 20px 0 0;padding:10px 18px 24px;border:1px solid var(--border);border-bottom:none;animation:slideUp .2s ease}
@keyframes slideUp{from{transform:translateY(20px)}to{transform:translateY(0)}}
.sheetHandle{width:36px;height:4px;border-radius:2px;background:var(--border);margin:4px auto 12px}
.sheetHead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.sheetHeadLeft{display:flex;flex-direction:column;gap:2px;min-width:0}
.sheetTitle{font-size:16px;font-weight:700}
.sheetBadge{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600;font-family:var(--font-mono)}
.closebtn{border:none;background:transparent;color:var(--ink-soft);padding:6px;cursor:pointer;border-radius:8px;line-height:0}
.closebtn:hover{background:var(--bg)}
.sheetNote{font-size:12.5px;color:var(--ink-soft);line-height:1.55;margin:0 0 14px}
.sheetBody{display:flex;flex-direction:column;gap:16px}
.chainNote{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;background:var(--render-soft);color:var(--render);font-size:12px;font-weight:500}
.fieldGroup{display:flex;flex-direction:column;gap:12px}
.groupLabel{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-mute);font-weight:600;padding-bottom:4px}

.field{display:flex;flex-direction:column;gap:6px}
.fieldHead{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;gap:8px}
.fieldLabel{color:var(--ink-soft)}
.fieldValue{font-family:var(--font-mono);font-size:12px;color:var(--ink)}
.fieldHelp{font-size:11.5px;color:var(--ink-mute);margin:0;line-height:1.4}
input[type="text"],input[type="number"],textarea,select{width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--ink);font-size:14px;font-family:var(--font-sans);-webkit-appearance:none;appearance:none}
select{padding-right:34px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235b6065' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 12px center}
textarea{resize:vertical;font-family:var(--font-mono);font-size:12.5px}
.checkboxRow{display:flex;align-items:center;gap:10px;font-size:13.5px}
.checkboxRow input{width:18px;height:18px;accent-color:var(--accent)}
.multiGrid{display:flex;flex-wrap:wrap;gap:6px}
.multiChip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--border);font-size:12px;color:var(--ink-soft);cursor:pointer}
.multiChip input{display:none}
.multiOn{background:var(--accent);color:#fff;border-color:var(--accent)}

.infoList{display:flex;flex-direction:column;gap:8px}
.infoRow{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)}
.infoRow:last-child{border-bottom:none}
.infoKey{font-size:12px;color:var(--ink-mute);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.infoVal{font-size:13px;text-align:right;font-family:var(--font-mono);word-break:break-word}
.formatList{display:flex;flex-direction:column;gap:6px}
.formatRow{display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;background:var(--bg);border:1px solid var(--border)}
.formatId{min-width:44px;text-align:center;font-family:var(--font-mono);font-size:12px;font-weight:700;padding:4px 8px;background:var(--accent-soft);color:var(--accent);border-radius:6px}
.formatBody{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.formatLabel{font-size:13px;font-weight:600}
.formatMeta{font-size:11.5px;color:var(--ink-mute);font-family:var(--font-mono)}

.bottomNav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;align-items:center;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--border);z-index:30}
.navBtn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 12px;background:transparent;border:none;cursor:pointer;color:var(--ink-mute);font-family:inherit}
.navActive{color:var(--accent)}
.navIcon{position:relative;display:flex}
.navBadge{position:absolute;top:-4px;right:-8px;min-width:16px;height:16px;padding:0 4px;background:var(--accent);color:#fff;border-radius:8px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono)}
.navLabel{font-size:10.5px;font-weight:500}

.historyRow{display:flex;gap:8px;justify-content:flex-end}
.recentList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.recentRow{width:100%;text-align:left;font-family:inherit;border-radius:var(--radius-lg)}

/* Link preview + media detail ---------------------------------------------- */
.mediaThumbImg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.profileCard{display:flex;flex-direction:column;gap:10px}
.profileDesc{font-size:12px;color:var(--ink-soft);line-height:1.5;margin:0;max-height:74px;overflow:hidden}
.profileStrip{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:var(--radius);background:var(--accent-soft);color:var(--accent);font-size:12.5px;overflow:hidden}
.profileStrip>svg{flex-shrink:0}
.profileStripName{flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.profileStripMeta{font-family:var(--font-mono);font-size:11px;white-space:nowrap;flex-shrink:0}

.detailMedia{display:flex;flex-direction:column;gap:10px}
.player{width:100%;max-height:320px;border-radius:12px;background:#0e0f11;object-fit:contain;display:block}
.playerWrap{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:18px 14px;display:flex;justify-content:center}
.playerWrapAudio .player{background:transparent;max-height:none}
.subPreview{margin:0;padding:12px;font-family:var(--font-mono);font-size:11.5px;line-height:1.55;color:var(--ink-soft);background:var(--surface-2);border:1px solid var(--border);border-radius:12px;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word}
.detailActions{display:flex;flex-direction:column;gap:8px}
.ghostBtnDanger{color:var(--danger)}
.ghostBtnDanger:hover{background:var(--danger-soft);border-color:var(--danger)}
.objectEmpty{font-size:12px;color:var(--ink-soft);line-height:1.5;margin:0;padding:10px 12px;border-radius:10px;background:var(--warn-soft)}

@media (min-width:720px){
  .app{max-width:720px;margin:0 auto;border-left:1px solid var(--border);border-right:1px solid var(--border)}
}
`;
