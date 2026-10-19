import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { useUserSession } from '@/contexts/UserSessionContext';
import { DEFAULT_GESTURE_COMMANDS, DEFAULT_GESTURE_CONFIG, type GestureConfig, type GestureFrame, type GesturePrediction } from '@/lib/gesture-contract';
import { createGestureArchive, type ArchiveEntry, type ArchiveMeta } from '@/lib/gesture-archive';
import { isGestureModel, recognizeGesture, trainGestureModel, type GestureModel } from '@/lib/gesture-engine';
import { RawGestureCapture, splitAvailableGestureWindows, summarizeGestureTrials } from '@/lib/gesture-session';
import { pendingEmergencyCaptures, retainEmergencyCapture, subscribeEmergencyCaptures } from '@/lib/gesture-emergency';

const labels = [{ id: 'rest', name: '真正静息（不做任何指令）' }, ...DEFAULT_GESTURE_COMMANDS];
const buttonStyle = 'rounded-lg border border-slate-600 px-4 py-2 text-sm hover:border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed';
const inputStyle = 'rounded border border-slate-600 bg-slate-900 px-3 py-2 text-white';
const sameConfig = (a: GestureConfig, b: GestureConfig) => a.sampleRate === b.sampleRate && a.channel === b.channel && a.windowSeconds === b.windowSeconds && a.mainsHz === b.mainsHz;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function GestureRecognition({ mode }: { mode: 'single' | 'sequence' }) {
  const { currentUser } = useUserSession();
  const serial = useSerialConnectionContext();
  const owner = String(currentUser?.userId ?? 'unavailable');
  return <GestureWorkspace key={`${owner}-${mode}`} owner={owner} mode={mode} serial={serial} />;
}

/** Injectable device boundary also allows local browser testing without real hardware. */
export function GestureWorkspace({ mode, owner, serial }: {
  mode: 'single' | 'sequence'; owner: string; serial: ReturnType<typeof useSerialConnectionContext>;
}) {
  const [, navigate] = useLocation();
  const archive = useMemo(() => createGestureArchive(owner), [owner]);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [restoreToCurrentOwner, setRestoreToCurrentOwner] = useState(false);
  const [config, setConfig] = useState<GestureConfig>({ ...DEFAULT_GESTURE_CONFIG });
  const [calibrationId, setCalibrationId] = useState('');
  const [model, setModel] = useState<GestureModel | null>(null);
  const [label, setLabel] = useState('rest');
  const [windowCount, setWindowCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'capturing' | 'saving'>('idle');
  const [visibleCount, setVisibleCount] = useState(30);
  const [message, setMessage] = useState('正在读取本机归档…');
  const [issues, setIssues] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(0);
  const [salvage, setSalvage] = useState(() => pendingEmergencyCaptures(owner));
  const [lastEntryId, setLastEntryId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string[]>([]);
  const active = useRef<RawGestureCapture | null>(null);
  const mounted = useRef(true);
  const cancelled = useRef(false);
  const recent = useRef<GestureFrame[]>([]);
  const busyRef = useRef(false);
  const connectedRef = useRef(serial.isConnected);
  connectedRef.current = serial.isConnected;
  useEffect(() => subscribeEmergencyCaptures(owner, setSalvage), [owner]);

  async function refresh() {
    const rows = (await archive.list()).sort((a, b) => a.meta.createdAt - b.meta.createdAt);
    if (mounted.current) setEntries(rows);
    return rows;
  }

  useEffect(() => {
    mounted.current = true;
    void refresh().then(rows => {
      if (!mounted.current) return;
      const lastModel = [...rows].reverse().find(r => r.meta.mode === 'model' && r.status === 'complete' && isGestureModel(r.meta.modelSnapshot));
      const lastTraining = [...rows].reverse().find(r => r.meta.mode === 'training');
      const newerCalibration = lastTraining && lastModel && lastTraining.meta.createdAt > lastModel.meta.createdAt && lastTraining.meta.calibrationId !== lastModel.meta.calibrationId;
      if (lastModel && !newerCalibration && isGestureModel(lastModel.meta.modelSnapshot)) {
        setModel(lastModel.meta.modelSnapshot);
        setConfig(lastModel.meta.modelSnapshot.config);
        setCalibrationId(lastModel.meta.calibrationId ?? crypto.randomUUID());
      } else {
        setCalibrationId(lastTraining?.meta.calibrationId ?? crypto.randomUUID());
        if (lastTraining) setConfig(lastTraining.meta.config);
      }
      setReady(true);
      setMessage('先连接设备，再采集独立静息与四类指令。所有新记录保存在本机独立归档。');
    }).catch(error => { if (mounted.current) setMessage(`归档不可用：${errorText(error)}`); });
    return () => { mounted.current = false; cancelled.current = true; active.current?.stop(); };
  }, [archive]);

  useEffect(() => serial.onDataReceived(data => {
    const frame: GestureFrame = { receivedAtMs: data.timestamp, channels: [data.channel1, data.channel2, data.channel3] };
    recent.current.push(frame);
    if (recent.current.length > 2500) recent.current.splice(0, 500);
    active.current?.push(frame);
  }), [serial.onDataReceived]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(active.current?.count ?? 0);
      const frames = recent.current;
      const span = frames.length > 1 ? frames.at(-1)!.receivedAtMs - frames[0].receivedAtMs : 0;
      setRate(span > 500 && Date.now() - frames.at(-1)!.receivedAtMs < 1500 ? Math.round((frames.length - 1) * 1000 / span) : 0);
    }, 150);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (busyRef.current || pendingEmergencyCaptures(owner).length) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', beforeUnload); };
  }, [owner]);

  useEffect(() => { if (!serial.isConnected) { cancelled.current = true; active.current?.stop(); } }, [serial.isConnected]);

  const compatibleModel = model && sameConfig(model.config, config) ? model : null;
  const training = entries.filter(e => e.status === 'complete' && e.meta.mode === 'training' && e.meta.calibrationId === calibrationId && e.trainingSelections?.at(-1)?.included !== false && sameConfig(e.meta.config, config));
  const models = entries.filter(e => e.meta.mode === 'model' && e.status === 'complete' && isGestureModel(e.meta.modelSnapshot));
  const currentResult = entries.find(e => e.meta.id === lastEntryId);
  const trials = entries.filter(e => e.meta.mode === mode && e.status !== 'capturing' && e.meta.modelSnapshot && (e.meta.modelSnapshot as GestureModel).id === model?.id).flatMap(e =>
    (e.result?.predictions ?? []).map((prediction, i) => ({ prediction, expected: e.annotations?.at(-1)?.expectedLabels[i] ?? '' })),
  );
  const stats = summarizeGestureTrials(trials);

  async function capture(trainingRun: boolean) {
    if (busyRef.current || !ready || !serial.isConnected) return;
    const frozenModel = trainingRun ? null : compatibleModel;
    if (!trainingRun && !frozenModel) { setMessage('请先建立或选择与当前采样配置一致的模型。'); return; }
    const count = trainingRun || mode === 'single' ? 1 : windowCount;
    const frozenConfig = { ...config };
    const meta: ArchiveMeta = {
      id: crypto.randomUUID(), createdAt: Date.now(), mode: trainingRun ? 'training' : mode,
      label: trainingRun ? label : undefined, calibrationId, config: frozenConfig,
      modelSnapshot: frozenModel ?? undefined, windowCount: count,
    };
    busyRef.current = true; setBusy(true); setPhase('countdown'); cancelled.current = false; setIssues([]); setLastEntryId(null); setFeedback([]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      for (let n = 3; n > 0; n--) {
        if (mounted.current) setMessage(`${n} 秒后开始。每窗开头静息约 0.7 秒，然后完成一次完整指令。`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (cancelled.current) return;
      }
      await archive.begin(meta);
      if (cancelled.current || !mounted.current || !connectedRef.current) {
        await archive.finish(meta.id, { predictions: [], frameCount: 0, status: 'interrupted' });
        return;
      }
      const collector = new RawGestureCapture(frozenConfig.sampleRate * frozenConfig.windowSeconds * count, 500,
        (index, frames) => archive.append(meta.id, index, frames));
      active.current = collector;
      if (mounted.current) setPhase('capturing');
      if (mounted.current) setMessage(trainingRun ? `采集中：${labels.find(l => l.id === label)?.name}` : `正在${mode === 'single' ? '独立' : '连续分窗'}识别；请按窗口完成动作。`);
      timeout = setTimeout(() => collector.stop(), (frozenConfig.windowSeconds * count * 1.8 + 5) * 1000);
      const outcome = await collector.done;
      clearTimeout(timeout);
      active.current = null;
      if (mounted.current) setPhase('saving');
      if (outcome.saveError) {
        retainEmergencyCapture(owner, meta.id, JSON.stringify({ format: 'darklo-unsaved-capture', meta, rawFrames: outcome.frames, error: outcome.saveError }));
        if (mounted.current) setSalvage(pendingEmergencyCaptures(owner));
        throw new Error(`原始数据保存失败：${outcome.saveError}。本次不进行识别，请下载应急原始记录。`);
      }
      const predictions = frozenModel
        ? splitAvailableGestureWindows(outcome.frames, frozenConfig).map(window => {
          try { return recognizeGesture(frozenModel, window.frames); }
          catch (error) { return { status: 'invalid' as const, reason: `处理失败：${errorText(error)}`, scores: [], diagnostics: {} }; }
        })
        : [];
      try {
        await archive.finish(meta.id, { predictions, frameCount: outcome.frames.length, status: outcome.complete ? 'complete' : 'interrupted' });
      } catch (error) {
        retainEmergencyCapture(owner, meta.id, JSON.stringify({ format: 'darklo-unsaved-capture', meta, rawFrames: outcome.frames, predictions, error: errorText(error) }));
        if (mounted.current) setSalvage(pendingEmergencyCaptures(owner));
        throw error;
      }
      await refresh();
      if (mounted.current) {
        setMessage(outcome.complete ? (trainingRun ? '本条原始训练记录已保存。请重复采集独立样本。' : '原始信号、冻结模型和全部结果已保存。可在结果后填写真实指令。') : `录制中断，已保存原始数据及 ${predictions.length} 个完整窗口的结果；剩余尾窗未作为完整指令识别。`);
        setLastEntryId(meta.id); setFeedback(predictions.map(() => ''));
      }
    } catch (error) { if (mounted.current) setMessage(errorText(error)); }
    finally {
      if (timeout) clearTimeout(timeout);
      busyRef.current = false;
      if (mounted.current) { setBusy(false); setPhase('idle'); setProgress(0); }
    }
  }

  async function train() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setIssues([]);
    try {
      const result = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, training.map(e => ({ id: e.meta.id, label: e.meta.label!, frames: e.rawFrames })));
      setIssues(result.issues);
      if (!result.model) { setMessage('本轮模型未建立。原记录和已有模型仍保留，请查看检查结果。'); return; }
      const id = crypto.randomUUID();
      await archive.begin({ id, createdAt: Date.now(), mode: 'model', calibrationId, config, modelSnapshot: result.model, windowCount: 0 });
      await archive.finish(id, { predictions: [], frameCount: 0, status: 'complete' });
      setModel(result.model); await refresh();
      setMessage('新模型已冻结并保存。请用重新采集的独立试次测试；训练通过不代表现场准确率。');
    } catch (error) { setMessage(errorText(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function runAction(action: () => Promise<void>) {
    try { await action(); } catch (error) { setMessage(errorText(error)); }
  }

  const windowIndex = Math.floor(progress / (config.sampleRate * config.windowSeconds)) + 1;
  const windowSecond = (progress / config.sampleRate) % config.windowSeconds;
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-5 md:p-10">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-amber-300 text-xs tracking-widest mb-2">DARKLO · 可恢复识别工作区</p>
          <h1 className="text-3xl font-semibold">{mode === 'single' ? '独立指令识别' : '连续分窗识别 · 实验'}</h1>
          <p className="text-slate-400 mt-2">{mode === 'single' ? '每次采集一个完整指令，作为演示默认模式。' : '一次录制多条，每 4 秒一个窗口；按顺序显示全部结果。此模式不自动寻找自由动作的边界。'}</p>
        </div>
        <nav className="flex gap-2 flex-wrap">
          <button className={buttonStyle} disabled={busy} onClick={() => navigate('/')}>首页</button>
          <button className={buttonStyle} disabled={busy} onClick={() => navigate('/recognition')}>原版识别</button>
          <button className={buttonStyle} disabled={busy} onClick={() => navigate(mode === 'single' ? '/gesture-sequence' : '/gesture-single')}>{mode === 'single' ? '进入连续识别' : '返回独立识别'}</button>
        </nav>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <strong>{serial.isConnected ? '设备已连接' : '设备未连接'}</strong>
          <button className={buttonStyle} disabled={busy} onClick={() => runAction(async () => {
            if (serial.isConnected) await serial.disconnect();
            else { const port = await serial.requestPort(); if (port) await serial.connect(port); }
          })}>{serial.isConnected ? '断开' : '连接串口设备'}</button>
          <span className="text-slate-400">实收约 {rate || '—'} 帧/秒</span>
          <label>采样率 <select aria-label="采样率" className={inputStyle} value={config.sampleRate} disabled={busy} onChange={e => setConfig({ ...config, sampleRate: Number(e.target.value) as 500 | 1000 })}>
            <option value={500}>500 Hz</option><option value={1000}>1000 Hz</option>
          </select></label>
          <label>工频 <select aria-label="工频" className={inputStyle} value={config.mainsHz} disabled={busy} onChange={e => setConfig({ ...config, mainsHz: Number(e.target.value) as 0 | 50 | 60 })}>
            <option value={50}>50 Hz</option><option value={60}>60 Hz</option><option value={0}>关闭陷波</option>
          </select></label>
        </div>
        <p className="text-sm text-slate-400">使用 CH{config.channel + 1} {['原始信号', '主肌电', '包络辅助信号'][config.channel]}；三个串口字段不等于三个独立电极通道。采样率应与硬件一致；配置改变后须选择兼容模型。</p>
        {config.channel !== 1 && <button className={buttonStyle} disabled={busy} onClick={() => setConfig({ ...config, channel: 1 })}>切回默认 CH2 主肌电重新校准</button>}
        {serial.error && <p className="text-red-300">{serial.error}</p>}
        {rate > 0 && Math.abs(rate / config.sampleRate - 1) > 0.2 && <p className="text-amber-300">实收速率与所选采样率差异较大，请先核对配置和串口状态。</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-700 p-5 space-y-4">
          <h2 className="text-xl font-semibold">1. 个体校准与训练</h2>
          <p className="text-sm text-slate-400">真实静息单独采集。默念「喝水」是主动指令，即使波形很小也应按该指令标注。每类及静息至少 3 条，建议 8–12 条独立样本。</p>
          <label className="block text-sm">校准组 <select aria-label="校准组" className={`${inputStyle} w-full mt-2`} value={calibrationId} disabled={busy} onChange={e => { setCalibrationId(e.target.value); setModel(null); const latest = [...entries].reverse().find(row => row.meta.calibrationId === e.target.value); if (latest) setConfig(latest.meta.config); }}>{Array.from(new Set([calibrationId, ...entries.map(e => e.meta.calibrationId).filter((id): id is string => !!id)])).map(id => <option key={id} value={id}>{id.slice(0, 8)}{id === calibrationId ? ' · 当前' : ''}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">{labels.map(item => <div key={item.id} className="rounded bg-slate-900 p-2 text-sm">{item.name}<span className="float-right text-amber-300">{training.filter(e => e.meta.label === item.id).length}</span></div>)}</div>
          <label className="block">本条采集标签 <select aria-label="采集标签" className={`${inputStyle} w-full mt-2`} value={label} disabled={busy} onChange={e => setLabel(e.target.value)}>{labels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <p className="text-sm text-slate-400">每窗共 4 秒：开头静息约 0.7 秒，再完成整条动作，末尾自然放松。双短、三短在同一窗口内完成；静息样本全程不执行指令。</p>
          <div className="flex gap-2 flex-wrap">
            <button className={buttonStyle} disabled={!ready || busy || !serial.isConnected} onClick={() => void capture(true)}>采集一条训练记录</button>
            <button className={`${buttonStyle} border-amber-400 text-amber-200`} disabled={!ready || busy} onClick={() => void train()}>训练并冻结模型</button>
            <button className={buttonStyle} disabled={!ready || busy} onClick={() => { setCalibrationId(crypto.randomUUID()); setModel(null); setMessage('已开启新校准组；所有旧记录和模型仍在归档中。'); }}>新建校准组</button>
          </div>
          <p className="text-xs text-slate-500">当前校准组 {calibrationId.slice(0, 8)}。重戴后建议新建校准组。</p>
        </section>

        <section className="rounded-xl border border-slate-700 p-5 space-y-4">
          <h2 className="text-xl font-semibold">2. {mode === 'single' ? '独立识别' : '连续分窗识别'}</h2>
          <label className="block">已保存模型 <select aria-label="已保存模型" className={`${inputStyle} w-full mt-2`} value={model?.id ?? ''} disabled={busy} onChange={e => {
            const entry = models.find(m => (m.meta.modelSnapshot as GestureModel).id === e.target.value);
            if (entry && isGestureModel(entry.meta.modelSnapshot)) { setModel(entry.meta.modelSnapshot); setConfig(entry.meta.config); setCalibrationId(entry.meta.calibrationId ?? calibrationId); }
          }}><option value="">尚未选择</option>{models.map(entry => { const saved = entry.meta.modelSnapshot as GestureModel; return <option key={entry.meta.id} value={saved.id}>{new Date(entry.meta.createdAt).toLocaleString()} · {saved.id.slice(-8)}</option>; })}</select></label>
          <p className="text-sm text-slate-400">{compatibleModel ? `冻结模型 ${compatibleModel.id.slice(-8)}。测试记录不会自动加入训练。` : '需要先采集训练并保存模型。旧版模板保持原状，不自动转换成新模型。'}</p>
          {mode === 'sequence' && <label className="block">连续窗口数 <select aria-label="连续窗口数" className={inputStyle} value={windowCount} disabled={busy} onChange={e => setWindowCount(Number(e.target.value))}>{[2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n} 条 / {n * 4} 秒</option>)}</select></label>}
          <div className="flex gap-2 flex-wrap">
            <button className={`${buttonStyle} border-amber-400 text-amber-200`} disabled={!ready || busy || !serial.isConnected || !compatibleModel} onClick={() => void capture(false)}>{mode === 'single' ? '开始独立识别' : '开始连续录制'}</button>
            {busy && <button className={buttonStyle} onClick={() => { cancelled.current = true; active.current?.stop(); }}>停止并保留记录</button>}
          </div>
          {phase === 'capturing' && <div className="rounded-lg bg-slate-900 p-5"><p className="text-3xl tabular-nums">第 {windowIndex} 窗 · {windowSecond.toFixed(1)} / 4.0 秒</p><p className="mt-2 text-amber-300">{windowSecond < 0.7 ? '先静息' : '完成一次指令，随后自然放松'}</p></div>}
          <p className="text-sm text-slate-400">当前模型、本模式的独立标注测试：{stats.correct}/{stats.labelled} 正确；错分 {stats.wrong}，拒识 {stats.rejected}，未标注 {stats.unlabelled}。拒识计入总试次，训练样本不计入准确率。</p>
        </section>
      </div>

      <section aria-live="polite" className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-5">
        <p>{message}</p>
        {issues.length > 0 && <ul className="mt-3 list-disc pl-5 text-amber-200">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
        {salvage.length > 0 && <div className="mt-3 text-amber-200"><p>有 {salvage.length} 份保存失败的原始记录，请先下载。应急缓存无法保证在存储已满或关闭浏览器后保留。</p>{salvage.map(record => <button key={record.id} className={`${buttonStyle} mt-2 mr-2`} onClick={() => download(`darklo-emergency-${record.id}.json`, record.payload)}>下载应急记录 {record.id.slice(0, 8)}</button>)}</div>}
      </section>

      {!!currentResult?.result?.predictions.length && <section className="rounded-xl border border-slate-700 p-5 space-y-4">
        <h2 className="text-xl">本次结果（全部窗口）</h2>
        {currentResult.result.predictions.map((prediction: GesturePrediction, i: number) => <div key={i} className="rounded-lg bg-slate-900 p-4">
          <div className="flex flex-wrap justify-between gap-3"><strong>{i + 1}. {prediction.status === 'recognized' ? prediction.labelName : ({ rest: '静息 / 未执行指令', unknown: '未能可靠识别', invalid: '信号无效' })[prediction.status]}</strong><span className="text-slate-400">{i * 4}–{(i + 1) * 4} 秒</span></div>
          <p className="text-sm text-slate-400 mt-2">{prediction.reason}</p>
          <label className="block mt-3 text-sm">实际做了什么（预测后标注） <select aria-label={`第${i + 1}条实际指令`} className={inputStyle} value={feedback[i] ?? ''} onChange={e => setFeedback(previous => { const next = [...previous]; next[i] = e.target.value; return next; })}><option value="">未标注</option>{labels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="unknown">其他非目标动作</option></select></label>
          <details className="mt-3 text-xs text-slate-400"><summary>查看距离分数与信号诊断（不是概率）</summary><pre className="whitespace-pre-wrap mt-2">{JSON.stringify({ scores: prediction.scores, diagnostics: prediction.diagnostics }, null, 2)}</pre></details>
        </div>)}
        <button className={buttonStyle} onClick={() => runAction(async () => { await archive.annotate(currentResult.meta.id, feedback); await refresh(); setMessage('真实标签已独立保存，预测和冻结模型保持原样。'); })}>保存真实标签</button>
      </section>}

      <section className="rounded-xl border border-slate-700 p-5 space-y-4">
        <h2 className="text-xl">记录与恢复</h2>
        <p className="text-sm text-slate-400">本账号共 {entries.length} 份归档。每次录制分块自动保存；浏览器关闭时最后尚未写入的分块可能丢失，未完成记录会明确标记。本机自动保存不能代替外部备份，请下载归档文件。</p>
        <label className="flex gap-2 items-center text-sm text-slate-300"><input type="checkbox" checked={restoreToCurrentOwner} disabled={busy} onChange={e => setRestoreToCurrentOwner(e.target.checked)} />将旧账号或另一台电脑的归档恢复到当前账号（保留来源，冲突时停止）</label>
        <div className="flex gap-3 flex-wrap">
          <button className={buttonStyle} disabled={!ready || busy} onClick={() => runAction(async () => download(`darklo-archive-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, await archive.exportBundle()))}>导出全部原始记录与模型</button>
          <label className={`${buttonStyle} ${busy ? 'opacity-40' : 'cursor-pointer'}`}>导入归档（追加，保留已有记录）<input type="file" accept="application/json,.json" className="hidden" disabled={!ready || busy} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (file) void runAction(async () => { const result = await archive.importBundle(await file.text(), { rebindOwner: restoreToCurrentOwner }); await refresh(); setMessage(`导入完成：新增 ${result.imported}，相同记录 ${result.skipped}。请从已保存模型中选择。`); });
          }} /></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-slate-400"><tr><th className="py-2">时间</th><th>用途</th><th>状态</th><th>原始帧数</th><th>操作</th></tr></thead><tbody>{[...entries].reverse().slice(0, visibleCount).map(entry => <tr className="border-t border-slate-800" key={entry.meta.id}>
          <td className="py-2" title={entry.meta.id}>{new Date(entry.meta.createdAt).toLocaleString()}<span className="block text-xs text-slate-500">{entry.meta.id.slice(0, 8)}</span></td><td>{({ training: '训练', single: '独立识别', sequence: '连续识别', model: '冻结模型' })[entry.meta.mode]} {labels.find(l => l.id === entry.meta.label)?.name}</td><td>{entry.status === 'complete' ? '已完成' : '未完成 / 可恢复原始数据'}</td><td>{entry.rawFrames.length}</td><td>{entry.result?.predictions.length ? <button className="text-amber-300" disabled={busy} onClick={() => { setLastEntryId(entry.meta.id); setFeedback(entry.annotations?.at(-1)?.expectedLabels ?? entry.result!.predictions.map(() => '')); }}>查看结果</button> : entry.meta.mode === 'training' ? <button className="text-amber-300" disabled={busy} onClick={() => runAction(async () => { await archive.setTrainingIncluded(entry.meta.id, entry.trainingSelections?.at(-1)?.included === false); await refresh(); setMessage('已更新训练样本选择；原始数据仍保留，已有冻结模型不改变。重新训练才应用此选择。'); })}>{entry.trainingSelections?.at(-1)?.included === false ? '恢复参与训练' : '暂不用于训练'}</button> : '—'}</td>
        </tr>)}</tbody></table></div>
        {entries.length > visibleCount && <button className={buttonStyle} onClick={() => setVisibleCount(previous => previous + 30)}>显示更早的 30 条记录</button>}
      </section>
    </div>
  </main>;
}
