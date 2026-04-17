import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeGB7, encodeGB7, hasTransparency } from './gb7';

const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gb7'];

const initialStatus = {
  width: '—',
  height: '—',
  colorDepth: '—',
  format: 'Файл не загружен',
};

function App() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('Загрузите PNG, JPG/JPEG или GB7.');
  const [fileName, setFileName] = useState('');
  const [canvasReady, setCanvasReady] = useState(false);

  const canSave = canvasReady;
  const allowedLabel = useMemo(() => ACCEPTED_EXTENSIONS.join(', '), []);

  useEffect(() => {
    drawPlaceholder();
  }, []);

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
    setCanvasReady(false);
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
      renderToCanvas(decoded.imageData, decoded.width, decoded.height);
      setStatus({
        width: decoded.width,
        height: decoded.height,
        colorDepth: decoded.meta.colorDepth,
        format: 'GB7',
      });
      return;
    }

    const imageBitmap = await createImageBitmap(file);
    renderBitmap(imageBitmap);
    setStatus({
      width: imageBitmap.width,
      height: imageBitmap.height,
      colorDepth: inferBrowserColorDepth(file.type),
      format: file.type || 'Изображение браузера',
    });
  }

  function renderBitmap(bitmap) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    setCanvasReady(true);
  }

  function renderToCanvas(imageData, width, height) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(imageData, 0, 0);
    setCanvasReady(true);
  }

  async function saveAs(type) {
    if (!canvasReady) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const canvas = canvasRef.current;
    const baseName = normalizeBaseName(fileName || 'image');

    if (type === 'gb7') {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bytes = encodeGB7(imageData, { useMask: hasTransparency(imageData.data) });
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), `${baseName}.gb7`);
      setMessage('GB7-файл сохранён.');
      return;
    }

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
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Лабораторная работа</p>
          <h1>Цифровое представление изображения</h1>
          <p className="subtitle">React-приложение для загрузки, просмотра и сохранения PNG, JPG и GB7.</p>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar card">
          <section>
            <h2>Файл</h2>
            <button className="primary-btn" onClick={() => fileInputRef.current?.click()}>
              Загрузить изображение
            </button>
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept=".png,.jpg,.jpeg,.gb7"
              onChange={handleFileChange}
            />
            <p className="hint">Поддерживаемые форматы: {allowedLabel}</p>
          </section>

          <section>
            <h2>Скачать</h2>
            <div className="button-grid">
              <button onClick={() => saveAs('png')} disabled={!canSave}>PNG</button>
              <button onClick={() => saveAs('jpg')} disabled={!canSave}>JPG</button>
              <button onClick={() => saveAs('gb7')} disabled={!canSave}>GB7</button>
            </div>
          </section>

          <section>
            <h2>Тестовые GB7</h2>
            <div className="demo-list">
              <button onClick={() => loadDemo('gradient-half-mask.gb7')}>gradient-half-mask.gb7</button>
              <button onClick={() => loadDemo('kapibara-mask.gb7')}>kapibara-mask.gb7</button>
              <button onClick={() => loadDemo('vertical-kapibara.gb7')}>vertical-kapibara.gb7</button>
            </div>
          </section>

          <section>
            <h2>Подсказки</h2>
            <ul className="tips">
              <li>GB7 декодируется и кодируется без сторонних библиотек.</li>
              <li>После загрузки картинка рисуется прямо в HTML5 canvas.</li>
              <li>Большие изображения масштабируются стилями и не ломают верстку.</li>
            </ul>
          </section>
        </aside>

        <section className="viewer card">
          <div className="viewer-toolbar">
            <span className="file-chip">{fileName || 'Нет файла'}</span>
            <span className="message">{message}</span>
          </div>
          <div className="canvas-wrap">
            <canvas ref={canvasRef} />
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span><strong>Ширина:</strong> {status.width}</span>
        <span><strong>Высота:</strong> {status.height}</span>
        <span><strong>Глубина цвета:</strong> {status.colorDepth}</span>
        <span><strong>Формат:</strong> {status.format}</span>
      </footer>
    </div>
  );
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
