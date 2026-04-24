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

function App() {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const fileInputRef = useRef(null);
  const originalImageDataRef = useRef(null);
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

  const canSave = canvasReady;
  const allowedLabel = useMemo(() => ACCEPTED_EXTENSIONS.join(', '), []);
  const canvasStyle = canvasFitSize
    ? { width: `${canvasFitSize.width}px`, height: `${canvasFitSize.height}px` }
    : undefined;

  useEffect(() => {
    drawPlaceholder();
  }, []);

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
    setAvailableChannels([]);
    setActiveChannels({});
    setPickedColor(null);
    setCanvasReady(false);
    setCanvasVersion((version) => version + 1);
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
    const channels = hasTransparency(imageData.data) ? ['r', 'g', 'b', 'a'] : ['r', 'g', 'b'];
    setOriginalImage(imageData, channels);
    setStatus({
      width: imageBitmap.width,
      height: imageBitmap.height,
      colorDepth: inferBrowserColorDepth(file.type),
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
      renderDisplayFromChannels(next);
      return next;
    });
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

  async function loadDemo(name) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}test-images/${name}`);
      if (!response.ok) {
        throw new Error(`Не удалось загрузить тестовый файл ${name}.`);
      }
      const blob = await response.blob();
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      await openFile(file);
      setFileName(name);
      setMessage(`Открыт тестовый файл ${name}.`);
    } catch (error) {
      setMessage(error.message || 'Ошибка загрузки тестового файла.');
    }
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
          {['▢', '✎', '◩', 'T', '■'].map((tool, index) => (
            <span className="tool-button muted" key={`${tool}-${index}`} aria-hidden="true">{tool}</span>
          ))}
          <div className="color-swatches" aria-label="Цвета">
            <span className="swatch foreground"></span>
            <span className="swatch background"></span>
          </div>
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
            <div className="layer-item active">
              <span className="eye">◉</span>
              <span className="layer-thumb"></span>
              <span>Background</span>
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

          <section className="panel file-panel">
            <h2>Файлы GB7</h2>
            <button type="button" onClick={() => loadDemo('gradient-half-mask.gb7')}>gradient-half-mask.gb7</button>
            <button type="button" onClick={() => loadDemo('kapibara-mask.gb7')}>kapibara-mask.gb7</button>
            <button type="button" onClick={() => loadDemo('vertical-kapibara.gb7')}>vertical-kapibara.gb7</button>
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

function inferBrowserColorDepth(mimeType) {
  if (mimeType === 'image/jpeg') return '24-bit RGB';
  if (mimeType === 'image/png') return '32-bit RGBA / 24-bit RGB';
  return 'Декодировано браузером';
}

export default App;
