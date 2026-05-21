import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeGB7, encodeGB7, hasTransparency } from './gb7';

const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gb7'];

const initialStatus = {
  width: '—',
  height: '—',
  colorDepth: '—',
  format: 'Файл не загружен',
};

const CHANNEL_DEFS = {
  gray: { label: 'Gray', sampleIndex: 0 },
  r: { label: 'Red', sampleIndex: 0 },
  g: { label: 'Green', sampleIndex: 1 },
  b: { label: 'Blue', sampleIndex: 2 },
  a: { label: 'Alpha', sampleIndex: 3 },
};

const LEVEL_CHANNELS = [
  { value: 'master', label: 'Master' },
  { value: 'r', label: 'Red' },
  { value: 'g', label: 'Green' },
  { value: 'b', label: 'Blue' },
  { value: 'a', label: 'Alpha' },
];

const DEFAULT_LEVEL = { black: 0, mid: 128, white: 255, gamma: 1 };

function App() {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const fileInputRef = useRef(null);
  const levelsDialogRef = useRef(null);
  const originalImageDataRef = useRef(null);
  const levelsBaseImageDataRef = useRef(null);
  const levelsLastAppliedBaseImageDataRef = useRef(null);
  const levelsHadImageBeforeOpenRef = useRef(false);
  const levelsDisplayChannelsRef = useRef([]);
  const levelsDisplayActiveChannelsRef = useRef({});
  const levelsPreviewFrameRef = useRef(null);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('Загрузите PNG, JPG/JPEG или GB7.');
  const [fileName, setFileName] = useState('');
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [canvasFitSize, setCanvasFitSize] = useState(null);
  const [availableChannels, setAvailableChannels] = useState([]);
  const [activeChannels, setActiveChannels] = useState({});
  const [activeTool, setActiveTool] = useState('move');
  const [pickedColor, setPickedColor] = useState(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levelsChannel, setLevelsChannel] = useState('master');
  const [histogramMode, setHistogramMode] = useState('linear');
  const [levelsPreview, setLevelsPreview] = useState(true);
  const [levelsSettings, setLevelsSettings] = useState(createDefaultLevelSettings);

  const canSave = canvasReady;
  const allowedLabel = useMemo(() => ACCEPTED_EXTENSIONS.join(', '), []);
  const canvasStyle = canvasFitSize
    ? { width: `${canvasFitSize.width}px`, height: `${canvasFitSize.height}px` }
    : undefined;
  const histogram = useMemo(() => {
    if (!levelsOpen || !levelsBaseImageDataRef.current) return null;
    return computeHistogram(levelsBaseImageDataRef.current, levelsChannel);
  }, [levelsOpen, levelsChannel]);

  useEffect(() => {
    drawPlaceholder();
  }, []);

  useEffect(() => {
    const dialog = levelsDialogRef.current;
    if (!dialog) return;

    if (levelsOpen && !dialog.open) {
      dialog.showModal();
    } else if (!levelsOpen && dialog.open) {
      dialog.close();
    }
  }, [levelsOpen]);

  useEffect(() => (
    () => {
      if (levelsPreviewFrameRef.current) {
        cancelAnimationFrame(levelsPreviewFrameRef.current);
      }
    }
  ), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;

    function fitCanvasToWrap() {
      const styles = getComputedStyle(wrap);
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(1, wrap.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, wrap.clientHeight - verticalPadding);
      const scale = Math.min(1, availableWidth / canvas.width, availableHeight / canvas.height);

      setCanvasFitSize({
        width: Math.max(1, Math.floor(canvas.width * scale)),
        height: Math.max(1, Math.floor(canvas.height * scale)),
      });
    }

    fitCanvasToWrap();
    const resizeObserver = new ResizeObserver(fitCanvasToWrap);
    resizeObserver.observe(wrap);
    window.addEventListener('resize', fitCanvasToWrap);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', fitCanvasToWrap);
    };
  }, [canvasVersion]);

  function drawPlaceholder() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = 960;
    canvas.height = 540;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#151a22');
    gradient.addColorStop(1, '#0c1017');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x <= canvas.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#dde7f7';
    ctx.font = '600 28px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('GrayBit-7 Image Viewer', canvas.width / 2, canvas.height / 2 - 18);
    ctx.font = '400 18px system-ui';
    ctx.fillStyle = '#9cb0cf';
    ctx.fillText('После загрузки изображение будет показано здесь', canvas.width / 2, canvas.height / 2 + 18);
    originalImageDataRef.current = null;
    levelsBaseImageDataRef.current = null;
    levelsLastAppliedBaseImageDataRef.current = null;
    setAvailableChannels([]);
    setActiveChannels({});
    setPickedColor(null);
    setFileName('');
    setStatus(initialStatus);
    setCanvasReady(false);
    setCanvasVersion((version) => version + 1);
  }

  function createLevelsDemoSource() {
    const imageData = createDemoImageData(960, 540);
    const demoChannels = ['r', 'g', 'b', 'a'];
    const demoActiveChannels = { r: true, g: true, b: true, a: true };

    return { imageData, channels: demoChannels, activeChannels: demoActiveChannels };
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await openFile(file);
      setFileName(file.name);
      setMessage(`Файл ${file.name} успешно загружен.`);
    } catch (error) {
      setMessage(error.message || 'Не удалось загрузить файл.');
    } finally {
      event.target.value = '';
    }
  }

  async function openFile(file) {
    const ext = getExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      throw new Error(`Поддерживаются только файлы: ${allowedLabel}`);
    }

    if (ext === '.gb7') {
      const buffer = await file.arrayBuffer();
      const decoded = decodeGB7(buffer);
      setOriginalImage(decoded.imageData, decoded.hasMask ? ['gray', 'a'] : ['gray']);
      setStatus({
        width: decoded.width,
        height: decoded.height,
        colorDepth: decoded.meta.colorDepth,
        format: 'GB7',
      });
      return;
    }

    const imageBitmap = await createImageBitmap(file);
    const imageData = bitmapToImageData(imageBitmap);
    const hasAlphaChannel = ext === '.png' || file.type === 'image/png';
    const channels = hasAlphaChannel ? ['r', 'g', 'b', 'a'] : ['r', 'g', 'b'];
    setOriginalImage(imageData, channels);
    setStatus({
      width: imageBitmap.width,
      height: imageBitmap.height,
      colorDepth: inferBrowserColorDepth(file.type, hasAlphaChannel),
      format: file.type || 'Изображение браузера',
    });
  }

  function bitmapToImageData(bitmap) {
    const scratch = document.createElement('canvas');
    const ctx = scratch.getContext('2d');
    scratch.width = bitmap.width;
    scratch.height = bitmap.height;
    ctx.clearRect(0, 0, scratch.width, scratch.height);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, scratch.width, scratch.height);
  }

  function setOriginalImage(imageData, channels) {
    originalImageDataRef.current = cloneImageData(imageData);
    levelsBaseImageDataRef.current = null;
    levelsLastAppliedBaseImageDataRef.current = null;
    setAvailableChannels(channels);
    setActiveChannels(Object.fromEntries(channels.map((channel) => [channel, true])));
    setPickedColor(null);
    renderImageData(imageData);
  }

  function renderDisplayFromChannels(nextActiveChannels = activeChannels) {
    const original = originalImageDataRef.current;
    if (!original) return;
    renderImageData(createChannelFilteredImageData(original, availableChannels, nextActiveChannels));
  }

  function renderImageData(imageData) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, 0);
    setCanvasReady(true);
    setCanvasVersion((version) => version + 1);
  }

  function toggleChannel(channel) {
    setActiveChannels((current) => {
      const next = { ...current, [channel]: !current[channel] };
      if (levelsOpen && levelsBaseImageDataRef.current) {
        levelsDisplayActiveChannelsRef.current = next;
        renderLevelsViews(levelsSettings, levelsPreview, next, levelsDisplayChannelsRef.current);
      } else {
        renderDisplayFromChannels(next);
      }
      return next;
    });
  }

  function openLevelsDialog() {
    levelsHadImageBeforeOpenRef.current = Boolean(originalImageDataRef.current);
    let source = originalImageDataRef.current;
    let displayChannels = availableChannels;
    let displayActiveChannels = activeChannels;

    if (!source) {
      const demo = createLevelsDemoSource();
      source = demo.imageData;
      displayChannels = demo.channels;
      displayActiveChannels = demo.activeChannels;
    }

    const base = cloneImageData(source);
    const defaults = createDefaultLevelSettings();
    levelsBaseImageDataRef.current = base;
    levelsDisplayChannelsRef.current = displayChannels;
    levelsDisplayActiveChannelsRef.current = displayActiveChannels;
    setLevelsSettings(defaults);
    setLevelsChannel('master');
    setHistogramMode('linear');
    setLevelsPreview(true);
    setLevelsOpen(true);
    renderLevelsViews(defaults, true, displayActiveChannels, displayChannels);
    setMessage('Открыт инструмент Levels.');
  }

  function renderLevelsViews(
    nextSettings = levelsSettings,
    nextPreview = levelsPreview,
    nextActiveChannels = levelsDisplayActiveChannelsRef.current,
    nextDisplayChannels = levelsDisplayChannelsRef.current
  ) {
    const base = levelsBaseImageDataRef.current;
    if (!base) return;

    if (levelsHadImageBeforeOpenRef.current) {
      renderImageData(nextPreview
        ? createLevelPreviewImageData(base, nextSettings, true, nextActiveChannels, nextDisplayChannels)
        : createLevelPreviewImageData(base, nextSettings, false, nextActiveChannels, nextDisplayChannels));
    }
  }

  function scheduleLevelsPreview(nextSettings = levelsSettings, nextPreview = levelsPreview) {
    const base = levelsBaseImageDataRef.current;
    if (!base) return;

    if (levelsPreviewFrameRef.current) {
      cancelAnimationFrame(levelsPreviewFrameRef.current);
    }

    levelsPreviewFrameRef.current = requestAnimationFrame(() => {
      levelsPreviewFrameRef.current = null;
      renderLevelsViews(nextSettings, nextPreview);
    });
  }

  function updateLevelMarker(key, value) {
    setLevelsSettings((current) => {
      const next = updateLevelSettings(current, levelsChannel, key, value);
      scheduleLevelsPreview(next, levelsPreview);
      return next;
    });
  }

  function updateLevelGamma(value) {
    setLevelsSettings((current) => {
      const next = updateLevelGammaSetting(current, levelsChannel, value);
      scheduleLevelsPreview(next, levelsPreview);
      return next;
    });
  }

  function handleLevelsPreviewChange(event) {
    const checked = event.target.checked;
    setLevelsPreview(checked);
    scheduleLevelsPreview(levelsSettings, checked);
  }

  function resetLevels() {
    const defaults = createDefaultLevelSettings();
    const appliedBase = levelsLastAppliedBaseImageDataRef.current;
    const base = appliedBase || levelsBaseImageDataRef.current;

    if (levelsPreviewFrameRef.current) {
      cancelAnimationFrame(levelsPreviewFrameRef.current);
      levelsPreviewFrameRef.current = null;
    }

    setLevelsSettings(defaults);
    if (base) {
      levelsBaseImageDataRef.current = cloneImageData(base);
      if (appliedBase) {
        originalImageDataRef.current = cloneImageData(base);
        levelsLastAppliedBaseImageDataRef.current = null;
      }
      renderLevelsViews(defaults, levelsPreview);
    }
    setMessage('Levels: значения сброшены.');
  }

  function cancelLevels() {
    const base = levelsBaseImageDataRef.current;
    if (base) {
      if (levelsHadImageBeforeOpenRef.current) {
        originalImageDataRef.current = cloneImageData(base);
        renderImageData(createChannelFilteredImageData(
          base,
          levelsDisplayChannelsRef.current,
          levelsDisplayActiveChannelsRef.current
        ));
      } else {
        drawPlaceholder();
      }
    }
    levelsBaseImageDataRef.current = null;
    levelsDisplayChannelsRef.current = [];
    levelsDisplayActiveChannelsRef.current = {};
    setLevelsOpen(false);
    setMessage('Levels: изменения отменены.');
  }

  function applyLevelsDialog() {
    const base = levelsBaseImageDataRef.current;
    if (!base) return;

    const corrected = applyLevelsToImageData(base, levelsSettings);
    levelsLastAppliedBaseImageDataRef.current = cloneImageData(base);
    originalImageDataRef.current = cloneImageData(corrected);
    levelsBaseImageDataRef.current = null;

    if (!levelsHadImageBeforeOpenRef.current) {
      setAvailableChannels(levelsDisplayChannelsRef.current);
      setActiveChannels(levelsDisplayActiveChannelsRef.current);
      setFileName('levels-demo');
      setStatus({
        width: corrected.width,
        height: corrected.height,
        colorDepth: '32-bit RGBA',
        format: 'Демо-изображение',
      });
    }

    renderImageData(createChannelFilteredImageData(
      corrected,
      levelsDisplayChannelsRef.current,
      levelsDisplayActiveChannelsRef.current
    ));
    levelsDisplayChannelsRef.current = [];
    levelsDisplayActiveChannelsRef.current = {};
    setLevelsOpen(false);
    setMessage('Levels: коррекция применена.');
  }

  function handleCanvasClick(event) {
    if (activeTool !== 'eyedropper' || !canvasReady || !originalImageDataRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * (canvas.width / rect.width))));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * (canvas.height / rect.height))));
    const offset = (y * canvas.width + x) * 4;
    const { data } = originalImageDataRef.current;
    const rgb = {
      r: data[offset],
      g: data[offset + 1],
      b: data[offset + 2],
    };
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);

    setPickedColor({ x, y, ...rgb, lab });
    setMessage(`Пипетка: X ${x}, Y ${y}, RGB(${rgb.r}, ${rgb.g}, ${rgb.b}), Lab(${lab.l}, ${lab.a}, ${lab.b}).`);
  }

  async function saveAs(type) {
    if (!canvasReady) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const baseName = normalizeBaseName(fileName || 'image');
    const original = originalImageDataRef.current;

    if (type === 'gb7') {
      const bytes = encodeGB7(original, { useMask: hasTransparency(original.data) });
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), `${baseName}.gb7`);
      setMessage('GB7-файл сохранён.');
      return;
    }

    const canvas = canvasRef.current;

    const mimeType = type === 'png' ? 'image/png' : 'image/jpeg';
    const quality = type === 'jpg' ? 0.95 : undefined;

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage('Не удалось сформировать файл для скачивания.');
          return;
        }
        downloadBlob(blob, `${baseName}.${type}`);
        setMessage(`${type.toUpperCase()}-файл сохранён.`);
      },
      mimeType,
      quality
    );
  }

  return (
    <div className="photoshop-shell">
      <header className="menu-bar">
        <nav className="app-menu" aria-label="Главное меню">
          <button type="button" onClick={() => fileInputRef.current?.click()}>Файл</button>
        </nav>
        <div className="window-tools" aria-hidden="true">
          <span className="search-icon"></span>
          <span className="screen-icon"></span>
        </div>
      </header>

      <div className="options-bar">
        <button className="tool-action" type="button" onClick={() => fileInputRef.current?.click()}>
          <span className="tool-action-icon">+</span>
          <span>Открыть</span>
        </button>
        <span className="format-note">PNG, JPG/JPEG, GB7</span>
        <button type="button" onClick={() => saveAs('png')} disabled={!canSave}>PNG</button>
        <button type="button" onClick={() => saveAs('jpg')} disabled={!canSave}>JPG</button>
        <button type="button" onClick={() => saveAs('gb7')} disabled={!canSave}>GB7</button>
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept=".png,.jpg,.jpeg,.gb7"
          onChange={handleFileChange}
        />
      </div>

      <main className="editor-workspace">
        <aside className="tools-panel" aria-label="Панель инструментов">
          <button
            className={activeTool === 'move' ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={() => setActiveTool('move')}
            aria-label="Перемещение"
          >
            ↖
          </button>
          <button
            className={activeTool === 'eyedropper' ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={() => setActiveTool('eyedropper')}
            aria-label="Пипетка"
            title="Пипетка"
          >
            ◉
          </button>
          <button
            className={levelsOpen ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={openLevelsDialog}
            aria-label="Уровни"
            title="Уровни"
          >
            ▥
          </button>
        </aside>

        <section className="document-stage">
          <div className="document-tab">
            <span>{fileName || 'Без имени'}</span>
          </div>
          <div className="canvas-wrap" ref={canvasWrapRef}>
            <canvas
              ref={canvasRef}
              style={canvasStyle}
              onClick={handleCanvasClick}
              className={activeTool === 'eyedropper' ? 'eyedropper-canvas' : undefined}
            />
          </div>
        </section>

        <aside className="right-panels">
          <section className="panel info-panel">
            <div className="panel-title">
              <span>Информация</span>
            </div>
            <div className="info-list">
              <span>Ширина: {status.width}</span>
              <span>Высота: {status.height}</span>
              <span>Глубина: {status.colorDepth}</span>
              <span>Формат: {status.format}</span>
            </div>
          </section>

          <section className="panel pick-panel">
            <div className="panel-title">
              <span>Пипетка</span>
            </div>
            <div className="pick-info">
              {pickedColor ? (
                <>
                  <span>X: {pickedColor.x}, Y: {pickedColor.y}</span>
                  <span>RGB: {pickedColor.r}, {pickedColor.g}, {pickedColor.b}</span>
                  <span>CIELAB: L {pickedColor.lab.l}, a {pickedColor.lab.a}, b {pickedColor.lab.b}</span>
                  <span
                    className="color-sample"
                    style={{ backgroundColor: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})` }}
                    aria-label="Выбранный цвет"
                  ></span>
                </>
              ) : (
                <span>Выберите пипетку и кликните по изображению.</span>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <span>Изображение</span>
            </div>
            <div className="layers-controls">
              <div className="mini-row">
                <span>Имя файла:</span>
                <strong>{fileName || 'не загружен'}</strong>
              </div>
              <div className="mini-row">
                <span>Canvas:</span>
                <strong>{canvasReady ? 'готов' : 'пустой'}</strong>
              </div>
            </div>
          </section>

          <section className="panel channels-panel">
            <div className="panel-title">
              <span>Каналы</span>
            </div>
            <div className="channels-list">
              {availableChannels.length > 0 ? (
                availableChannels.map((channel) => (
                  <button
                    className={activeChannels[channel] ? 'channel-row active' : 'channel-row'}
                    type="button"
                    key={channel}
                    onClick={() => toggleChannel(channel)}
                  >
                    <span className="channel-state">{activeChannels[channel] ? '◉' : '○'}</span>
                    <ChannelPreview imageData={originalImageDataRef.current} channel={channel} />
                    <span>{CHANNEL_DEFS[channel].label}</span>
                  </button>
                ))
              ) : (
                <span className="empty-panel-note">Загрузите изображение.</span>
              )}
            </div>
          </section>
        </aside>
      </main>

      <footer className="statusbar">
        <span>{message}</span>
        <span>Форматы: {allowedLabel}</span>
        <span>Ширина: {status.width}</span>
        <span>Высота: {status.height}</span>
        <span>Глубина: {status.colorDepth}</span>
        <span>{status.format}</span>
      </footer>

      <dialog
        className="levels-dialog"
        ref={levelsDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          cancelLevels();
        }}
      >
        <div className="levels-title">Уровни</div>
        <div className="levels-body">
          <label className="levels-field">
            <span>Канал</span>
            <select value={levelsChannel} onChange={(event) => setLevelsChannel(event.target.value)}>
              {LEVEL_CHANNELS.map((channel) => (
                <option value={channel.value} key={channel.value}>{channel.label}</option>
              ))}
            </select>
          </label>

          <div className="levels-mode" role="group" aria-label="Режим гистограммы">
            <button
              type="button"
              className={histogramMode === 'linear' ? 'active' : undefined}
              onClick={() => setHistogramMode('linear')}
            >
              Линейная
            </button>
            <button
              type="button"
              className={histogramMode === 'log' ? 'active' : undefined}
              onClick={() => setHistogramMode('log')}
            >
              Логарифм
            </button>
          </div>

          <HistogramCanvas histogram={histogram} mode={histogramMode} />

          <LevelsControls
            level={levelsSettings[levelsChannel]}
            onMarkerChange={updateLevelMarker}
            onGammaChange={updateLevelGamma}
          />

          <label className="preview-check">
            <input type="checkbox" checked={levelsPreview} onChange={handleLevelsPreviewChange} />
            <span>Предпросмотр</span>
          </label>
        </div>
        <form className="levels-actions" method="dialog">
          <button type="button" onClick={resetLevels}>Сброс</button>
          <button type="button" onClick={cancelLevels}>Отмена</button>
          <button type="button" onClick={applyLevelsDialog}>Применить</button>
        </form>
      </dialog>
    </div>
  );
}

function HistogramCanvas({ histogram, mode }) {
  const histogramRef = useRef(null);

  useEffect(() => {
    const canvas = histogramRef.current;
    if (!canvas || !histogram) return;

    const width = 512;
    const height = 170;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#191919';
    ctx.fillRect(0, 0, width, height);

    const values = histogram.map((count) => (mode === 'log' ? Math.log1p(count) : count));
    const max = Math.max(1, ...values);
    const barWidth = width / histogram.length;

    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }

    ctx.fillStyle = '#d8d8d8';
    values.forEach((value, index) => {
      const barHeight = Math.max(1, (value / max) * (height - 14));
      ctx.fillRect(index * barWidth, height - barHeight, Math.ceil(barWidth), barHeight);
    });

    ctx.fillStyle = '#9f9f9f';
    ctx.font = '11px Arial, Helvetica, sans-serif';
    ctx.fillText('0', 4, height - 5);
    ctx.fillText('127', width / 2 - 9, height - 5);
    ctx.fillText('255', width - 24, height - 5);
  }, [histogram, mode]);

  return <canvas className="histogram-canvas" ref={histogramRef} aria-label="Гистограмма уровней" />;
}

function LevelsControls({ level, onMarkerChange, onGammaChange }) {
  const gamma = clamp(Number(level.gamma), 0.1, 9.9).toFixed(2);

  return (
    <div className="levels-controls">
      <div className="levels-track" aria-label="Input Levels">
        <input
          className="level-range black"
          type="range"
          min="0"
          max="254"
          value={level.black}
          onChange={(event) => onMarkerChange('black', event.target.value)}
          aria-label="Точка черного"
        />
        <input
          className="level-range mid"
          type="range"
          min="0"
          max="255"
          value={level.mid}
          onChange={(event) => onMarkerChange('mid', event.target.value)}
          aria-label="Полутона"
        />
        <input
          className="level-range white"
          type="range"
          min="1"
          max="255"
          value={level.white}
          onChange={(event) => onMarkerChange('white', event.target.value)}
          aria-label="Точка белого"
        />
      </div>

      <div className="level-number-grid">
        <label>
          <span>Black</span>
          <input
            type="number"
            min="0"
            max="254"
            value={level.black}
            onChange={(event) => onMarkerChange('black', event.target.value)}
          />
        </label>
        <label>
          <span>Gamma</span>
          <input
            type="number"
            min="0.1"
            max="9.9"
            step="0.01"
            value={gamma}
            onChange={(event) => onGammaChange(event.target.value)}
          />
        </label>
        <label>
          <span>White</span>
          <input
            type="number"
            min="1"
            max="255"
            value={level.white}
            onChange={(event) => onMarkerChange('white', event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

function ChannelPreview({ imageData, channel }) {
  const previewRef = useRef(null);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !imageData) return;

    const ctx = canvas.getContext('2d');
    const previewData = createChannelPreviewImageData(imageData, channel);
    canvas.width = previewData.width;
    canvas.height = previewData.height;
    ctx.putImageData(previewData, 0, 0);
  }, [imageData, channel]);

  return <canvas className="channel-thumb" ref={previewRef} aria-hidden="true" />;
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function createChannelFilteredImageData(imageData, channels, activeChannels) {
  const output = new Uint8ClampedArray(imageData.data.length);
  const source = imageData.data;
  const hasGray = channels.includes('gray');
  const hasAlpha = channels.includes('a');
  const alphaOnly = hasAlpha && activeChannels.a && !channels.some((channel) => channel !== 'a' && activeChannels[channel]);

  for (let i = 0; i < source.length; i += 4) {
    if (alphaOnly) {
      output[i] = source[i + 3];
      output[i + 1] = source[i + 3];
      output[i + 2] = source[i + 3];
      output[i + 3] = 255;
      continue;
    }

    if (hasGray) {
      const gray = activeChannels.gray ? source[i] : 0;
      output[i] = gray;
      output[i + 1] = gray;
      output[i + 2] = gray;
    } else {
      output[i] = activeChannels.r ? source[i] : 0;
      output[i + 1] = activeChannels.g ? source[i + 1] : 0;
      output[i + 2] = activeChannels.b ? source[i + 2] : 0;
    }

    output[i + 3] = hasAlpha && activeChannels.a ? source[i + 3] : 255;
  }

  return new ImageData(output, imageData.width, imageData.height);
}

function createChannelPreviewImageData(imageData, channel) {
  const output = new Uint8ClampedArray(imageData.data.length);
  const source = imageData.data;
  const sampleIndex = CHANNEL_DEFS[channel].sampleIndex;

  for (let i = 0; i < source.length; i += 4) {
    const value = source[i + sampleIndex];
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    output[i + 3] = 255;
  }

  return new ImageData(output, imageData.width, imageData.height);
}

function createDemoImageData(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const centerX = width * 0.62;
  const centerY = height * 0.46;
  const radius = Math.min(width, height) * 0.24;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const nx = x / (width - 1);
      const ny = y / (height - 1);
      const stripes = Math.sin((nx * 14 + ny * 9) * Math.PI) * 18;
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.hypot(dx, dy);
      const circle = distance < radius ? 58 : 0;
      const shadow = clamp(Math.round(54 * (1 - Math.min(1, distance / (radius * 1.8)))), 0, 54);

      data[offset] = clamp(Math.round((nx * 210) + (ny * 34) + circle + stripes), 0, 255);
      data[offset + 1] = clamp(Math.round((ny * 190) + ((1 - nx) * 54) + shadow), 0, 255);
      data[offset + 2] = clamp(Math.round(((1 - nx) * 150) + ((1 - ny) * 80) + circle * 0.35), 0, 255);
      data[offset + 3] = 255;
    }
  }

  return new ImageData(data, width, height);
}

function createDefaultLevelSettings() {
  return Object.fromEntries(LEVEL_CHANNELS.map((channel) => [channel.value, { ...DEFAULT_LEVEL }]));
}

function createLevelPreviewImageData(imageData, settings, previewEnabled, activeChannels, displayChannels) {
  const source = previewEnabled ? applyLevelsToImageData(imageData, settings) : cloneImageData(imageData);
  return createChannelFilteredImageData(source, displayChannels, activeChannels);
}

function computeHistogram(imageData, channel) {
  const histogram = new Array(256).fill(0);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    let value;
    if (channel === 'master') {
      value = Math.round((0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]));
    } else {
      value = data[i + CHANNEL_DEFS[channel].sampleIndex];
    }
    histogram[value] += 1;
  }

  return histogram;
}

function updateLevelSettings(settings, channel, key, rawValue) {
  const current = settings[channel];
  const nextLevel = normalizeLevel({ ...current, [key]: Number(rawValue) }, key);
  return { ...settings, [channel]: nextLevel };
}

function updateLevelGammaSetting(settings, channel, rawValue) {
  const gamma = clamp(Number(rawValue), 0.1, 9.9);
  const current = settings[channel];
  const range = current.white - current.black;
  const mid = Math.round(current.black + (range * (0.5 ** (1 / gamma))));
  const nextLevel = normalizeLevel({ ...current, mid, gamma }, 'gamma');
  return { ...settings, [channel]: nextLevel };
}

function normalizeLevel(level, changedKey) {
  const next = {
    black: clamp(Math.round(level.black), 0, 254),
    mid: clamp(Math.round(level.mid), 0, 255),
    white: clamp(Math.round(level.white), 1, 255),
    gamma: clamp(Number(level.gamma), 0.1, 9.9),
  };

  if (next.black >= next.white) {
    if (changedKey === 'white') {
      next.black = next.white - 1;
    } else {
      next.white = next.black + 1;
    }
  }

  next.mid = clamp(next.mid, next.black + 1, next.white - 1);
  if (changedKey !== 'gamma') {
    next.gamma = midpointToGammaValue(next);
  }
  return next;
}

function midpointToGamma(level) {
  return midpointToGammaValue(level).toFixed(2);
}

function midpointToGammaValue(level) {
  const normalized = clamp((level.mid - level.black) / (level.white - level.black), 0.001, 0.999);
  return clamp(Math.log(0.5) / Math.log(normalized), 0.1, 9.9);
}

function applyLevelsToImageData(imageData, settings) {
  const output = new Uint8ClampedArray(imageData.data);
  const masterLut = createLevelsLut(settings.master);
  const channelLuts = {
    r: createLevelsLut(settings.r),
    g: createLevelsLut(settings.g),
    b: createLevelsLut(settings.b),
    a: createLevelsLut(settings.a),
  };

  for (let i = 0; i < output.length; i += 4) {
    output[i] = channelLuts.r[masterLut[output[i]]];
    output[i + 1] = channelLuts.g[masterLut[output[i + 1]]];
    output[i + 2] = channelLuts.b[masterLut[output[i + 2]]];
    output[i + 3] = channelLuts.a[output[i + 3]];
  }

  return new ImageData(output, imageData.width, imageData.height);
}

function createLevelsLut(level) {
  const lut = new Uint8ClampedArray(256);
  const gamma = level.gamma;
  const range = level.white - level.black;

  for (let value = 0; value < 256; value += 1) {
    const normalized = clamp((value - level.black) / range, 0, 1);
    lut[value] = Math.round(255 * (normalized ** gamma));
  }

  return lut;
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function rgbToLab(r, g, b) {
  const [linearR, linearG, linearB] = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized > 0.04045
      ? ((normalized + 0.055) / 1.055) ** 2.4
      : normalized / 12.92;
  });

  const x = (linearR * 0.4124 + linearG * 0.3576 + linearB * 0.1805) / 0.95047;
  const y = (linearR * 0.2126 + linearG * 0.7152 + linearB * 0.0722) / 1.00000;
  const z = (linearR * 0.0193 + linearG * 0.1192 + linearB * 0.9505) / 1.08883;
  const [fx, fy, fz] = [x, y, z].map((value) => (
    value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + (16 / 116)
  ));

  return {
    l: roundLab((116 * fy) - 16),
    a: roundLab(500 * (fx - fy)),
    b: roundLab(200 * (fy - fz)),
  };
}

function roundLab(value) {
  return Math.round(value * 100) / 100;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExtension(name) {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex === -1 ? '' : name.slice(dotIndex).toLowerCase();
}

function normalizeBaseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

function inferBrowserColorDepth(mimeType, hasAlpha) {
  if (hasAlpha === true) return '32-bit RGBA';
  if (hasAlpha === false) return '24-bit RGB';
  if (mimeType === 'image/jpeg') return '24-bit RGB';
  if (mimeType === 'image/png') return '32-bit RGBA / 24-bit RGB';
  return 'Декодировано браузером';
}

export default App;
