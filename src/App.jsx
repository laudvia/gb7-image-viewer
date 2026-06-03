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
const SCALE_MIN = 1;
const SCALE_MAX = 1000;

const INTERPOLATION_METHODS = {
  nearest: {
    label: 'Nearest neighbor',
  },
  bilinear: {
    label: 'Bilinear',
  },
};

const KERNEL_PRESETS = {
  identity: {
    label: 'Тождественное отображение',
    values: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  sharpen: {
    label: 'Повышение резкости',
    values: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  },
  gaussian: {
    label: 'Фильтр Гаусса (3 на 3)',
    values: [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625],
  },
  boxBlur: {
    label: 'Прямоугольное размытие',
    values: [0.111, 0.111, 0.111, 0.111, 0.111, 0.111, 0.111, 0.111, 0.111],
  },
  prewittX: {
    label: 'Прюитт X',
    values: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
  },
  prewittY: {
    label: 'Прюитт Y',
    values: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
  },
};

const EDGE_HANDLING_OPTIONS = {
  black: 'Черный',
  white: 'Белый',
  copy: 'Копирование',
};

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
  const resizeDialogRef = useRef(null);
  const kernelDialogRef = useRef(null);
  const kernelBaseImageDataRef = useRef(null);
  const kernelPreviewRunRef = useRef(0);
  const medianDialogRef = useRef(null);
  const medianBaseImageDataRef = useRef(null);
  const medianPreviewRunRef = useRef(0);
  const displayImageDataRef = useRef(null);
  const sourceImageAspectRef = useRef(1);
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
  const [scalePercent, setScalePercent] = useState(100);
  const [scalePercentInput, setScalePercentInput] = useState('100');
  const [interpolationMethod, setInterpolationMethod] = useState('bilinear');
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeDialogMode, setResizeDialogMode] = useState('percent');
  const [resizeWidthPercent, setResizeWidthPercent] = useState(100);
  const [resizeHeightPercent, setResizeHeightPercent] = useState(100);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [resizeKeepAspect, setResizeKeepAspect] = useState(true);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levelsChannel, setLevelsChannel] = useState('master');
  const [histogramMode, setHistogramMode] = useState('linear');
  const [levelsPreview, setLevelsPreview] = useState(true);
  const [levelsSettings, setLevelsSettings] = useState(createDefaultLevelSettings);
  const [kernelOpen, setKernelOpen] = useState(false);
  const [kernelPreset, setKernelPreset] = useState('identity');
  const [kernelValues, setKernelValues] = useState(() => KERNEL_PRESETS.identity.values.map(String));
  const [kernelChannels, setKernelChannels] = useState({});
  const [kernelEdgeMode, setKernelEdgeMode] = useState('copy');
  const [kernelPreview, setKernelPreview] = useState(true);
  const [kernelBusy, setKernelBusy] = useState(false);
  const [medianOpen, setMedianOpen] = useState(false);
  const [medianChannels, setMedianChannels] = useState({});
  const [medianEdgeMode, setMedianEdgeMode] = useState('copy');
  const [medianPreview, setMedianPreview] = useState(true);
  const [medianBusy, setMedianBusy] = useState(false);

  const canSave = canvasReady;
  const allowedLabel = useMemo(() => ACCEPTED_EXTENSIONS.join(', '), []);
  const histogram = useMemo(() => {
    if (!levelsOpen || !levelsBaseImageDataRef.current) return null;
    return computeHistogram(levelsBaseImageDataRef.current, levelsChannel);
  }, [levelsOpen, levelsChannel]);
  const scaleDimensions = getScaledDimensions(originalImageDataRef.current, scalePercent);
  const canvasStyle = originalImageDataRef.current
    ? {
      width: `${scaleDimensions.width}px`,
      height: `${scaleDimensions.height}px`,
      imageRendering: interpolationMethod === 'nearest' ? 'pixelated' : 'auto',
    }
    : canvasFitSize
      ? { width: `${canvasFitSize.width}px`, height: `${canvasFitSize.height}px` }
      : undefined;
  const sourceMegapixels = originalImageDataRef.current
    ? formatMegapixels(originalImageDataRef.current.width * originalImageDataRef.current.height)
    : '0';
  const scaleMegapixels = formatMegapixels(scaleDimensions.width * scaleDimensions.height);

  useEffect(() => {
    drawPlaceholder();
  }, []);

  useEffect(() => {
    setScalePercentInput(String(scalePercent));
  }, [scalePercent]);

  useEffect(() => {
    const dialog = levelsDialogRef.current;
    if (!dialog) return;

    if (levelsOpen && !dialog.open) {
      dialog.showModal();
    } else if (!levelsOpen && dialog.open) {
      dialog.close();
    }
  }, [levelsOpen]);

  useEffect(() => {
    const dialog = resizeDialogRef.current;
    if (!dialog) return;

    if (resizeOpen && !dialog.open) {
      dialog.showModal();
    } else if (!resizeOpen && dialog.open) {
      dialog.close();
    }
  }, [resizeOpen]);

  useEffect(() => {
    const dialog = kernelDialogRef.current;
    if (!dialog) return;

    if (kernelOpen && !dialog.open) {
      dialog.showModal();
    } else if (!kernelOpen && dialog.open) {
      dialog.close();
    }
  }, [kernelOpen]);

  useEffect(() => {
    const dialog = medianDialogRef.current;
    if (!dialog) return;

    if (medianOpen && !dialog.open) {
      dialog.showModal();
    } else if (!medianOpen && dialog.open) {
      dialog.close();
    }
  }, [medianOpen]);

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
      const fitScale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);

      // If the canvas is larger than the available area, scale it down to fit.
      // Otherwise leave it at its intrinsic size so zoom >100% is visible (scrollable).
      if (fitScale < 1) {
        setCanvasFitSize({
          width: Math.max(1, Math.floor(canvas.width * fitScale)),
          height: Math.max(1, Math.floor(canvas.height * fitScale)),
        });
      } else {
        setCanvasFitSize(null);
      }
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
    displayImageDataRef.current = null;
    levelsBaseImageDataRef.current = null;
    levelsLastAppliedBaseImageDataRef.current = null;
    kernelBaseImageDataRef.current = null;
    kernelPreviewRunRef.current += 1;
    medianBaseImageDataRef.current = null;
    medianPreviewRunRef.current += 1;
    setAvailableChannels([]);
    setActiveChannels({});
    setPickedColor(null);
    setFileName('');
    setScalePercent(100);
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
    const hasAlphaChannel = ext === '.png' || file.type === 'image/png' || hasTransparency(imageData.data);
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
    displayImageDataRef.current = null;
    levelsBaseImageDataRef.current = null;
    levelsLastAppliedBaseImageDataRef.current = null;
    kernelBaseImageDataRef.current = null;
    kernelPreviewRunRef.current += 1;
    medianBaseImageDataRef.current = null;
    medianPreviewRunRef.current += 1;
    sourceImageAspectRef.current = imageData.width / imageData.height;
    setAvailableChannels(channels);
    const active = Object.fromEntries(channels.map((channel) => [channel, true]));
    setActiveChannels(active);
    setPickedColor(null);
    const initialScale = computeInitialScale(imageData.width, imageData.height);
    setScalePercent(initialScale);
    renderImageForScale(initialScale, imageData, interpolationMethod, channels, active);
  }

  function renderDisplayFromChannels(nextActiveChannels = activeChannels) {
    const display = displayImageDataRef.current || originalImageDataRef.current;
    if (!display) return;
    renderImageData(createChannelFilteredImageData(display, availableChannels, nextActiveChannels));
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

  function renderImageForScale(
    nextScale,
    sourceImageData = originalImageDataRef.current,
    method = interpolationMethod,
    channels = availableChannels,
    active = activeChannels
  ) {
    if (!sourceImageData) return;

    const dimensions = getScaledDimensions(sourceImageData, nextScale);
    displayImageDataRef.current = cloneImageData(sourceImageData);
    setStatus((current) => ({
      ...current,
      width: dimensions.width,
      height: dimensions.height,
    }));
    renderImageData(createChannelFilteredImageData(sourceImageData, channels, active));
  }

  function resizeImageData(imageData, width, height, method) {
    if (method === 'nearest') {
      return nearestNeighborInterpolation(imageData, width, height);
    }
    return bilinearInterpolation(imageData, width, height);
  }

  function nearestNeighborInterpolation(imageData, width, height) {
    const source = imageData.data;
    const output = new Uint8ClampedArray(width * height * 4);
    const xRatio = imageData.width / width;
    const yRatio = imageData.height / height;

    for (let y = 0; y < height; y += 1) {
      const srcY = Math.min(imageData.height - 1, Math.round(y * yRatio));
      for (let x = 0; x < width; x += 1) {
        const srcX = Math.min(imageData.width - 1, Math.round(x * xRatio));
        const srcIndex = (srcY * imageData.width + srcX) * 4;
        const dstIndex = (y * width + x) * 4;
        output[dstIndex] = source[srcIndex];
        output[dstIndex + 1] = source[srcIndex + 1];
        output[dstIndex + 2] = source[srcIndex + 2];
        output[dstIndex + 3] = source[srcIndex + 3];
      }
    }

    return new ImageData(output, width, height);
  }

  function bilinearInterpolation(imageData, width, height) {
    const source = imageData.data;
    const output = new Uint8ClampedArray(width * height * 4);
    const xRatio = imageData.width / width;
    const yRatio = imageData.height / height;

    for (let y = 0; y < height; y += 1) {
      const srcY = y * yRatio;
      const y0 = Math.floor(srcY);
      const y1 = Math.min(imageData.height - 1, y0 + 1);
      const wy = srcY - y0;

      for (let x = 0; x < width; x += 1) {
        const srcX = x * xRatio;
        const x0 = Math.floor(srcX);
        const x1 = Math.min(imageData.width - 1, x0 + 1);
        const wx = srcX - x0;
        const dstIndex = (y * width + x) * 4;

        for (let channel = 0; channel < 4; channel += 1) {
          const topLeft = source[(y0 * imageData.width + x0) * 4 + channel];
          const topRight = source[(y0 * imageData.width + x1) * 4 + channel];
          const bottomLeft = source[(y1 * imageData.width + x0) * 4 + channel];
          const bottomRight = source[(y1 * imageData.width + x1) * 4 + channel];
          const top = topLeft + (topRight - topLeft) * wx;
          const bottom = bottomLeft + (bottomRight - bottomLeft) * wx;
          output[dstIndex + channel] = Math.round(top + (bottom - top) * wy);
        }
      }
    }

    return new ImageData(output, width, height);
  }

  function computeInitialScale(width, height) {
    if (!canvasWrapRef.current) return 100;
    const rect = canvasWrapRef.current.getBoundingClientRect();
    const availableWidth = Math.max(1, rect.width - 100);
    const availableHeight = Math.max(1, rect.height - 100);
    const scale = Math.min(availableWidth / width, availableHeight / height) * 100;
    return clamp(Math.round(scale), SCALE_MIN, SCALE_MAX);
  }

  function handleScaleChange(event) {
    const rawValue = event.target.value;
    setScalePercentInput(rawValue);

    if (rawValue.trim() === '') return;

    const nextScale = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(nextScale) || nextScale < SCALE_MIN || nextScale > SCALE_MAX) {
      return;
    }

    updateScalePercent(nextScale);
  }

  function commitScaleInput() {
    const nextScale = clamp(Number(scalePercentInput.replace(',', '.')), SCALE_MIN, SCALE_MAX);
    setScalePercentInput(String(nextScale));
    updateScalePercent(nextScale);
  }

  function updateScalePercent(nextScale) {
    preserveCanvasViewportCenter(nextScale);
    const dimensions = getScaledDimensions(originalImageDataRef.current, nextScale);
    setScalePercent(nextScale);
    setStatus((current) => ({
      ...current,
      width: dimensions.width,
      height: dimensions.height,
    }));
  }

  function preserveCanvasViewportCenter(nextScale) {
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    const source = originalImageDataRef.current;
    if (!wrap || !canvas || !source) return;

    const oldWidth = Math.max(1, canvas.offsetWidth);
    const oldHeight = Math.max(1, canvas.offsetHeight);
    const centerX = oldWidth > wrap.clientWidth
      ? (wrap.scrollLeft + wrap.clientWidth / 2) / oldWidth
      : 0.5;
    const centerY = oldHeight > wrap.clientHeight
      ? (wrap.scrollTop + wrap.clientHeight / 2) / oldHeight
      : 0.5;
    const nextDimensions = getScaledDimensions(source, nextScale);

    requestAnimationFrame(() => {
      wrap.scrollLeft = Math.max(0, (nextDimensions.width * centerX) - (wrap.clientWidth / 2));
      wrap.scrollTop = Math.max(0, (nextDimensions.height * centerY) - (wrap.clientHeight / 2));
    });
  }

  function handleInterpolationMethodChange(event) {
    const nextMethod = event.target.value;
    setInterpolationMethod(nextMethod);
  }

  function applyScaleResize() {
    const source = originalImageDataRef.current;
    if (!source) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const { width, height } = getScaledDimensions(source, scalePercent);
    const resized = scalePercent === 100
      ? cloneImageData(source)
      : resizeImageData(source, width, height, interpolationMethod);

    originalImageDataRef.current = cloneImageData(resized);
    displayImageDataRef.current = cloneImageData(resized);
    sourceImageAspectRef.current = resized.width / resized.height;
    setScalePercent(100);
    setStatus((current) => ({
      ...current,
      width: resized.width,
      height: resized.height,
    }));
    renderImageData(createChannelFilteredImageData(resized, availableChannels, activeChannels));
    setMessage(`Размер применён: ${resized.width}×${resized.height} px.`);
  }

  function openResizeDialog() {
    const source = originalImageDataRef.current;
    if (!source) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const width = source.width;
    const height = source.height;
    setResizeDialogMode('percent');
    setResizeKeepAspect(true);
    setResizeWidthPercent(100);
    setResizeHeightPercent(100);
    setResizeWidth(width);
    setResizeHeight(height);
    setResizeOpen(true);
  }

  function closeResizeDialog() {
    setResizeOpen(false);
  }

  function updateResizeMode(nextMode) {
    const source = originalImageDataRef.current;
    if (!source) return;
    setResizeDialogMode(nextMode);
    if (nextMode === 'percent') {
      setResizeWidthPercent(Math.round((resizeWidth / source.width) * 100));
      setResizeHeightPercent(Math.round((resizeHeight / source.height) * 100));
    }
  }

  function updateResizePercentSize(widthPercentValue, heightPercentValue) {
    const source = originalImageDataRef.current;
    if (!source) return;
    const widthPercent = Math.max(1, Math.round(Number(widthPercentValue)));
    const heightPercent = Math.max(1, Math.round(Number(heightPercentValue)));
    const width = Math.max(1, Math.round(source.width * widthPercent / 100));
    const height = Math.max(1, Math.round(source.height * heightPercent / 100));
    setResizeWidthPercent(widthPercent);
    setResizeHeightPercent(heightPercent);
    setResizeWidth(width);
    setResizeHeight(height);
  }

  function updateResizeWidthPercent(widthPercentValue) {
    const widthPercent = Math.max(1, Math.round(Number(widthPercentValue)));
    updateResizePercentSize(widthPercent, resizeHeightPercent);
  }

  function updateResizeHeightPercent(heightPercentValue) {
    const heightPercent = Math.max(1, Math.round(Number(heightPercentValue)));
    updateResizePercentSize(resizeWidthPercent, heightPercent);
  }

  function updateResizeWidth(widthValue) {
    const source = originalImageDataRef.current;
    if (!source) return;
    const width = Math.max(1, Math.round(Number(widthValue)));
    const height = resizeKeepAspect
      ? Math.max(1, Math.round(width * source.height / source.width))
      : resizeHeight;
    setResizeWidth(width);
    setResizeHeight(height);
    setResizeWidthPercent(Math.round((width / source.width) * 100));
    setResizeHeightPercent(Math.round((height / source.height) * 100));
  }

  function updateResizeHeight(heightValue) {
    const source = originalImageDataRef.current;
    if (!source) return;
    const height = Math.max(1, Math.round(Number(heightValue)));
    const width = resizeKeepAspect
      ? Math.max(1, Math.round(height * source.width / source.height))
      : resizeWidth;
    setResizeHeight(height);
    setResizeWidth(width);
    setResizeHeightPercent(Math.round((height / source.height) * 100));
    setResizeWidthPercent(Math.round((width / source.width) * 100));
  }

  function updateResizeKeepAspect(checked) {
    setResizeKeepAspect(checked);
  }

  function applyResize() {
    const source = originalImageDataRef.current;
    if (!source) {
      setMessage('Нет изображения для изменения размера.');
      closeResizeDialog();
      return;
    }

    const width = clamp(Number(resizeWidth), 1, 10000);
    const height = clamp(Number(resizeHeight), 1, 10000);
    const resized = resizeImageData(source, width, height, interpolationMethod);

    originalImageDataRef.current = cloneImageData(resized);
    displayImageDataRef.current = cloneImageData(resized);
    setScalePercent(100);
    setResizeOpen(false);
    setStatus((current) => ({
      ...current,
      width: resized.width,
      height: resized.height,
    }));
    renderImageData(createChannelFilteredImageData(resized, availableChannels, activeChannels));
    setMessage('Изображение изменено по размеру.');
  }

  function openKernelDialog() {
    const source = originalImageDataRef.current;
    if (!source) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const preset = 'identity';
    const channels = Object.fromEntries(availableChannels.map((channel) => [channel, true]));
    kernelPreviewRunRef.current += 1;
    kernelBaseImageDataRef.current = cloneImageData(source);
    setKernelPreset(preset);
    setKernelValues(KERNEL_PRESETS[preset].values.map(String));
    setKernelChannels(channels);
    setKernelEdgeMode('copy');
    setKernelPreview(true);
    setKernelBusy(false);
    setKernelOpen(true);
    renderImageData(createChannelFilteredImageData(source, availableChannels, activeChannels));
    setMessage('Открыт фильтр Custom Kernel.');
  }

  function closeKernelDialog() {
    cancelKernelDialog();
  }

  function scheduleKernelPreview(
    nextValues = kernelValues,
    nextChannels = kernelChannels,
    nextEdgeMode = kernelEdgeMode,
    nextPreview = kernelPreview
  ) {
    const base = kernelBaseImageDataRef.current;
    if (!base) return;

    const runId = kernelPreviewRunRef.current + 1;
    kernelPreviewRunRef.current = runId;

    if (!nextPreview) {
      setKernelBusy(false);
      renderImageData(createChannelFilteredImageData(base, availableChannels, activeChannels));
      return;
    }

    setKernelBusy(true);
    const filterPromise = applyKernelToImageDataAsync(
      base,
      parseKernelValues(nextValues),
      nextChannels,
      nextEdgeMode
    );

    filterPromise
      .then((filtered) => {
        if (kernelPreviewRunRef.current !== runId) return;
        renderImageData(createChannelFilteredImageData(filtered, availableChannels, activeChannels));
      })
      .catch((error) => {
        if (kernelPreviewRunRef.current !== runId) return;
        setMessage(error.message || 'Не удалось выполнить фильтрацию.');
      })
      .finally(() => {
        if (kernelPreviewRunRef.current === runId) {
          setKernelBusy(false);
        }
      });
  }

  function updateKernelPreset(preset) {
    if (preset === 'custom') {
      setKernelPreset(preset);
      return;
    }

    const values = KERNEL_PRESETS[preset].values.map(String);
    setKernelPreset(preset);
    setKernelValues(values);
    scheduleKernelPreview(values, kernelChannels, kernelEdgeMode, kernelPreview);
  }

  function updateKernelValue(index, value) {
    const next = kernelValues.map((current, currentIndex) => (
      currentIndex === index ? value : current
    ));
    setKernelPreset('custom');
    setKernelValues(next);
    scheduleKernelPreview(next, kernelChannels, kernelEdgeMode, kernelPreview);
  }

  function updateKernelChannel(channel, checked) {
    const next = { ...kernelChannels, [channel]: checked };
    setKernelChannels(next);
    scheduleKernelPreview(kernelValues, next);
  }

  function updateKernelEdgeMode(edgeMode) {
    setKernelEdgeMode(edgeMode);
    scheduleKernelPreview(kernelValues, kernelChannels, edgeMode);
  }

  function updateKernelPreview(checked) {
    setKernelPreview(checked);
    scheduleKernelPreview(kernelValues, kernelChannels, kernelEdgeMode, checked);
  }

  function resetKernelDialog() {
    const preset = 'identity';
    const values = KERNEL_PRESETS[preset].values.map(String);
    const channels = Object.fromEntries(availableChannels.map((channel) => [channel, true]));
    setKernelPreset(preset);
    setKernelValues(values);
    setKernelChannels(channels);
    setKernelEdgeMode('copy');
    setKernelPreview(true);
    scheduleKernelPreview(values, channels, 'copy', true);
    setMessage('Kernel: значения сброшены.');
  }

  function cancelKernelDialog() {
    const base = kernelBaseImageDataRef.current;
    kernelPreviewRunRef.current += 1;
    if (base) {
      renderImageData(createChannelFilteredImageData(base, availableChannels, activeChannels));
    }
    kernelBaseImageDataRef.current = null;
    setKernelBusy(false);
    setKernelOpen(false);
    setMessage('Kernel: изменения отменены.');
  }

  async function applyKernelDialog() {
    const base = kernelBaseImageDataRef.current;
    if (!base) return;

    const runId = kernelPreviewRunRef.current + 1;
    kernelPreviewRunRef.current = runId;
    setKernelBusy(true);

    try {
      const result = await applyKernelToImageDataAsync(
        base,
        parseKernelValues(kernelValues),
        kernelChannels,
        kernelEdgeMode
      );
      if (kernelPreviewRunRef.current !== runId) return;

      originalImageDataRef.current = cloneImageData(result);
      displayImageDataRef.current = cloneImageData(result);
      kernelBaseImageDataRef.current = null;
      setStatus((current) => ({
        ...current,
        width: result.width,
        height: result.height,
      }));
      renderImageData(createChannelFilteredImageData(result, availableChannels, activeChannels));
      setKernelOpen(false);
      setMessage('Kernel: фильтр применён.');
    } catch (error) {
      setMessage(error.message || 'Не удалось применить фильтр.');
    } finally {
      if (kernelPreviewRunRef.current === runId) {
        setKernelBusy(false);
      }
    }
  }

  function openMedianDialog() {
    const source = originalImageDataRef.current;
    if (!source) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const channels = Object.fromEntries(availableChannels.map((channel) => [channel, true]));
    medianPreviewRunRef.current += 1;
    medianBaseImageDataRef.current = cloneImageData(source);
    setMedianChannels(channels);
    setMedianEdgeMode('copy');
    setMedianPreview(true);
    setMedianBusy(false);
    setMedianOpen(true);
    renderImageData(createChannelFilteredImageData(source, availableChannels, activeChannels));
    setMessage('Открыт медианный фильтр.');
  }

  function closeMedianDialog() {
    cancelMedianDialog();
  }

  function scheduleMedianPreview(
    nextChannels = medianChannels,
    nextEdgeMode = medianEdgeMode,
    nextPreview = medianPreview
  ) {
    const base = medianBaseImageDataRef.current;
    if (!base) return;

    const runId = medianPreviewRunRef.current + 1;
    medianPreviewRunRef.current = runId;

    if (!nextPreview) {
      setMedianBusy(false);
      renderImageData(createChannelFilteredImageData(base, availableChannels, activeChannels));
      return;
    }

    setMedianBusy(true);
    applyMedianToImageDataAsync(base, nextChannels, nextEdgeMode)
      .then((filtered) => {
        if (medianPreviewRunRef.current !== runId) return;
        renderImageData(createChannelFilteredImageData(filtered, availableChannels, activeChannels));
      })
      .catch((error) => {
        if (medianPreviewRunRef.current !== runId) return;
        setMessage(error.message || 'Не удалось выполнить медианную фильтрацию.');
      })
      .finally(() => {
        if (medianPreviewRunRef.current === runId) {
          setMedianBusy(false);
        }
      });
  }

  function updateMedianChannel(channel, checked) {
    const next = { ...medianChannels, [channel]: checked };
    setMedianChannels(next);
    scheduleMedianPreview(next);
  }

  function updateMedianEdgeMode(edgeMode) {
    setMedianEdgeMode(edgeMode);
    scheduleMedianPreview(medianChannels, edgeMode);
  }

  function updateMedianPreview(checked) {
    setMedianPreview(checked);
    scheduleMedianPreview(medianChannels, medianEdgeMode, checked);
  }

  function resetMedianDialog() {
    const channels = Object.fromEntries(availableChannels.map((channel) => [channel, true]));
    setMedianChannels(channels);
    setMedianEdgeMode('copy');
    setMedianPreview(true);
    scheduleMedianPreview(channels, 'copy', true);
    setMessage('Медианный фильтр: значения сброшены.');
  }

  function cancelMedianDialog() {
    const base = medianBaseImageDataRef.current;
    medianPreviewRunRef.current += 1;
    if (base) {
      renderImageData(createChannelFilteredImageData(base, availableChannels, activeChannels));
    }
    medianBaseImageDataRef.current = null;
    setMedianBusy(false);
    setMedianOpen(false);
    setMessage('Медианный фильтр: изменения отменены.');
  }

  async function applyMedianDialog() {
    const base = medianBaseImageDataRef.current;
    if (!base) return;

    const runId = medianPreviewRunRef.current + 1;
    medianPreviewRunRef.current = runId;
    setMedianBusy(true);

    try {
      const result = await applyMedianToImageDataAsync(base, medianChannels, medianEdgeMode);
      if (medianPreviewRunRef.current !== runId) return;

      originalImageDataRef.current = cloneImageData(result);
      displayImageDataRef.current = cloneImageData(result);
      medianBaseImageDataRef.current = null;
      setStatus((current) => ({
        ...current,
        width: result.width,
        height: result.height,
      }));
      renderImageData(createChannelFilteredImageData(result, availableChannels, activeChannels));
      setMedianOpen(false);
      setMessage('Медианный фильтр применён.');
    } catch (error) {
      setMessage(error.message || 'Не удалось применить медианный фильтр.');
    } finally {
      if (medianPreviewRunRef.current === runId) {
        setMedianBusy(false);
      }
    }
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
        renderImageForScale(scalePercent, originalImageDataRef.current);
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
    displayImageDataRef.current = null;
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

    renderImageForScale(scalePercent, corrected);
    levelsDisplayChannelsRef.current = [];
    levelsDisplayActiveChannelsRef.current = {};
    setLevelsOpen(false);
    setMessage('Levels: коррекция применена.');
  }

  function handleCanvasClick(event) {
    if (activeTool !== 'eyedropper' || !canvasReady) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * (canvas.width / rect.width))));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * (canvas.height / rect.height))));
    const imageData = displayImageDataRef.current || originalImageDataRef.current;
    if (!imageData) return;
    const offset = (y * canvas.width + x) * 4;
    const { data } = imageData;
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
    const original = originalImageDataRef.current;

    if (!canvasReady || !original) {
      setMessage('Сначала загрузите изображение.');
      return;
    }

    const baseName = normalizeBaseName(fileName || 'image');

    if (type === 'gb7') {
      const bytes = encodeGB7(original, { useMask: hasTransparency(original.data) });
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), `${baseName}.gb7`);
      setMessage('GB7-файл сохранён.');
      return;
    }

    const mimeType = type === 'png' ? 'image/png' : 'image/jpeg';
    const quality = type === 'jpg' ? 0.95 : undefined;

    try {
      const blob = await imageDataToBlob(original, mimeType, quality);
      downloadBlob(blob, `${baseName}.${type}`);
      setMessage(`${type.toUpperCase()}-файл сохранён.`);
    } catch (error) {
      setMessage(error.message || 'Не удалось сформировать файл для скачивания.');
    }
  }

  return (
    <div className="photoshop-shell">
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
            className={activeTool === 'resize' ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={() => {
              setActiveTool('resize');
              openResizeDialog();
            }}
            aria-label="Масштабирование"
            title="Масштабирование"
          >
            ⇲
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
          <button
            className={kernelOpen ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={openKernelDialog}
            aria-label="Custom Kernel"
            title="Custom Kernel"
          >
            ⊞
          </button>
          <button
            className={medianOpen ? 'tool-button active' : 'tool-button'}
            type="button"
            onClick={openMedianDialog}
            aria-label="Медианный фильтр"
            title="Медианный фильтр"
          >
            ◫
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

          <section className="panel scale-panel">
            <div className="panel-title">
              <span>Масштабирование</span>
            </div>
            <div className="scale-controls">
              <div className="mini-row">
                <span>Исходно:</span>
                <strong>{sourceMegapixels} Мп</strong>
              </div>
              <div className="mini-row">
                <span>Новый:</span>
                <strong>{scaleMegapixels} Мп</strong>
              </div>
              <div className="mini-row">
                <span>Размер:</span>
                <strong>{scaleDimensions.width}×{scaleDimensions.height} px</strong>
              </div>
              <div className="scale-zoom-card">
                <span>Увеличение</span>
                <strong>{scalePercent}%</strong>
              </div>
              <label className="scale-slider-field">
                <span>Процент масштабирования</span>
                <input
                  type="range"
                  min="10"
                  max="400"
                  step="5"
                  value={clamp(scalePercent, 10, 400)}
                  onChange={(event) => updateScalePercent(Number(event.target.value))}
                  disabled={!canvasReady}
                />
                <div className="scale-slider-marks" aria-hidden="true">
                  <span>10%</span>
                  <span>100%</span>
                  <span>400%</span>
                </div>
              </label>
              <label className="scale-percent-field">
                <span>Точно</span>
                <div className="scale-number">
                  <input
                    type="number"
                    min={SCALE_MIN}
                    max={SCALE_MAX}
                    step="1"
                    value={scalePercentInput}
                    onChange={handleScaleChange}
                    onBlur={commitScaleInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                    disabled={!canvasReady}
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="scale-percent-field">
                <span>Алгоритм</span>
                <select
                  value={interpolationMethod}
                  onChange={handleInterpolationMethodChange}
                  disabled={!canvasReady}
                >
                  {Object.entries(INTERPOLATION_METHODS).map(([value, meta]) => (
                    <option value={value} key={value}>{meta.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={applyScaleResize} disabled={!canvasReady}>
                Применить размер
              </button>
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

      <dialog
        className="resize-dialog"
        ref={resizeDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeResizeDialog();
        }}
      >
        <div className="resize-title">Изменение размера</div>
        <div className="resize-body">
          <div className="resize-meta">
            <div>Исходных пикселей: {(originalImageDataRef.current ? originalImageDataRef.current.width * originalImageDataRef.current.height : 0) / 1_000_000} Мп</div>
            <div>Новых пикселей: {(resizeWidth * resizeHeight) / 1_000_000} Мп</div>
          </div>

          <label className="resize-field">
            <span>Режим</span>
            <select
              value={resizeDialogMode}
              onChange={(event) => updateResizeMode(event.target.value)}
            >
              <option value="percent">Процент</option>
              <option value="pixels">Пиксели</option>
            </select>
          </label>

          <div className="resize-inputs">
            <label className="resize-field">
              <span>Ширина {resizeDialogMode === 'percent' ? '(%)' : '(px)'}</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={resizeDialogMode === 'percent' ? resizeWidthPercent : resizeWidth}
                onChange={(event) => {
                  if (resizeDialogMode === 'percent') {
                    updateResizeWidthPercent(event.target.value);
                  } else {
                    updateResizeWidth(event.target.value);
                  }
                }}
              />
            </label>
            <label className="resize-field">
              <span>Высота {resizeDialogMode === 'percent' ? '(%)' : '(px)'}</span>
              <input
                type="number"
                min="1"
                max="10000"
                value={resizeDialogMode === 'percent' ? resizeHeightPercent : resizeHeight}
                onChange={(event) => {
                  if (resizeDialogMode === 'percent') {
                    updateResizeHeightPercent(event.target.value);
                  } else {
                    updateResizeHeight(event.target.value);
                  }
                }}
              />
            </label>
          </div>

          <label className="resize-checkbox">
            <input
              type="checkbox"
              checked={resizeKeepAspect}
              onChange={(event) => updateResizeKeepAspect(event.target.checked)}
            />
            <span>Сохранять пропорции</span>
          </label>

          <label className="resize-field">
            <span>Интерполяция</span>
            <select value={interpolationMethod} onChange={handleInterpolationMethodChange}>
              {Object.entries(INTERPOLATION_METHODS).map(([value, meta]) => (
                <option value={value} key={value}>{meta.label}</option>
              ))}
            </select>
          </label>

        </div>
        <form className="resize-actions" method="dialog">
          <button type="button" onClick={closeResizeDialog}>Отмена</button>
          <button type="button" onClick={applyResize}>Применить</button>
        </form>
      </dialog>

      <dialog
        className="kernel-dialog"
        ref={kernelDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeKernelDialog();
        }}
      >
        <div className="kernel-title">Фильтр Custom Kernel</div>
        <div className="kernel-body">
          <label className="kernel-field">
            <span>Пресет</span>
            <select
              value={kernelPreset}
              onChange={(event) => updateKernelPreset(event.target.value)}
            >
              <option value="custom">Пользовательский</option>
              {Object.entries(KERNEL_PRESETS).map(([value, preset]) => (
                <option value={value} key={value}>{preset.label}</option>
              ))}
            </select>
          </label>

          <div className="kernel-grid" aria-label="Ядро свертки 3 на 3">
            {kernelValues.map((value, index) => (
              <input
                key={index}
                type="number"
                step="0.1"
                value={value}
                onChange={(event) => updateKernelValue(index, event.target.value)}
                aria-label={`Значение ядра ${index + 1}`}
              />
            ))}
          </div>

          <fieldset className="kernel-group">
            <legend>Каналы</legend>
            <div className="kernel-checks">
              {availableChannels.map((channel) => (
                <label key={channel}>
                  <input
                    type="checkbox"
                    checked={Boolean(kernelChannels[channel])}
                    onChange={(event) => updateKernelChannel(channel, event.target.checked)}
                  />
                  <span>{CHANNEL_DEFS[channel].label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="kernel-field">
            <span>Край</span>
            <select
              value={kernelEdgeMode}
              onChange={(event) => updateKernelEdgeMode(event.target.value)}
            >
              {Object.entries(EDGE_HANDLING_OPTIONS).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="preview-check">
            <input
              type="checkbox"
              checked={kernelPreview}
              onChange={(event) => updateKernelPreview(event.target.checked)}
            />
            <span>Предпросмотр</span>
          </label>

          <div className="kernel-status">
            {kernelBusy ? 'Выполняется фильтрация...' : 'Готово'}
          </div>
        </div>
        <form className="kernel-actions" method="dialog">
          <button type="button" onClick={closeKernelDialog}>Закрыть</button>
          <button type="button" onClick={resetKernelDialog}>Сбросить</button>
          <button type="button" onClick={applyKernelDialog} disabled={kernelBusy}>Применить</button>
        </form>
      </dialog>

      <dialog
        className="kernel-dialog"
        ref={medianDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeMedianDialog();
        }}
      >
        <div className="kernel-title">Медианный фильтр</div>
        <div className="kernel-body">
          <div className="kernel-info">
            Окно 3 на 3 сортируется по яркости, центральный пиксель заменяется медианным значением.
          </div>

          <fieldset className="kernel-group">
            <legend>Каналы</legend>
            <div className="kernel-checks">
              {availableChannels.map((channel) => (
                <label key={channel}>
                  <input
                    type="checkbox"
                    checked={Boolean(medianChannels[channel])}
                    onChange={(event) => updateMedianChannel(channel, event.target.checked)}
                  />
                  <span>{CHANNEL_DEFS[channel].label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="kernel-field">
            <span>Край</span>
            <select
              value={medianEdgeMode}
              onChange={(event) => updateMedianEdgeMode(event.target.value)}
            >
              {Object.entries(EDGE_HANDLING_OPTIONS).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="preview-check">
            <input
              type="checkbox"
              checked={medianPreview}
              onChange={(event) => updateMedianPreview(event.target.checked)}
            />
            <span>Предпросмотр</span>
          </label>

          <div className="kernel-status">
            {medianBusy ? 'Выполняется фильтрация...' : 'Готово'}
          </div>
        </div>
        <form className="kernel-actions" method="dialog">
          <button type="button" onClick={closeMedianDialog}>Закрыть</button>
          <button type="button" onClick={resetMedianDialog}>Сбросить</button>
          <button type="button" onClick={applyMedianDialog} disabled={medianBusy}>Применить</button>
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

function getScaledDimensions(imageData, percent) {
  if (!imageData) return { width: 0, height: 0 };
  return {
    width: Math.max(1, Math.round(imageData.width * percent / 100)),
    height: Math.max(1, Math.round(imageData.height * percent / 100)),
  };
}

function formatMegapixels(pixelCount) {
  return (pixelCount / 1_000_000).toFixed(3).replace(/\.?0+$/, '');
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

function parseKernelValues(values) {
  return values.map((value) => {
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

async function applyKernelToImageDataAsync(imageData, kernel, selectedChannels, edgeMode) {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);
  const channelIndexes = Object.entries(selectedChannels)
    .filter(([, selected]) => selected)
    .map(([channel]) => CHANNEL_DEFS[channel]?.sampleIndex)
    .filter((index, position, indexes) => Number.isInteger(index) && indexes.indexOf(index) === position);

  if (channelIndexes.length === 0) {
    return cloneImageData(imageData);
  }

  const rowChunkSize = 24;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;

      for (const channelIndex of channelIndexes) {
        let sum = 0;

        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            const sample = getKernelSample(data, width, height, x + kx, y + ky, channelIndex, edgeMode);
            sum += sample * kernel[kernelIndex];
          }
        }

        output[targetIndex + channelIndex] = clamp(Math.round(sum), 0, 255);
      }
    }

    if (y % rowChunkSize === rowChunkSize - 1) {
      await waitForMainThread();
    }
  }

  return new ImageData(output, width, height);
}

async function applyMedianToImageDataAsync(imageData, selectedChannels, edgeMode) {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);
  const selectedChannelNames = Object.entries(selectedChannels)
    .filter(([, selected]) => selected)
    .map(([channel]) => channel);
  const channelIndexes = Object.entries(selectedChannels)
    .filter(([, selected]) => selected)
    .map(([channel]) => CHANNEL_DEFS[channel]?.sampleIndex)
    .filter((index, position, indexes) => Number.isInteger(index) && indexes.indexOf(index) === position);
  const shouldFilterGray = selectedChannelNames.includes('gray');
  const colorChannels = shouldFilterGray
    ? [0, 1, 2]
    : channelIndexes.filter((index) => index >= 0 && index <= 2);
  const shouldFilterAlpha = channelIndexes.includes(3);
  const shouldFilterRed = colorChannels.includes(0);
  const shouldFilterGreen = colorChannels.includes(1);
  const shouldFilterBlue = colorChannels.includes(2);

  if (channelIndexes.length === 0) {
    return cloneImageData(imageData);
  }

  const brightnessSamples = new Array(9);
  const redSamples = new Array(9);
  const greenSamples = new Array(9);
  const blueSamples = new Array(9);
  const alphaSamples = new Array(9);
  const rowChunkSize = 48;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;

      if (colorChannels.length > 0) {
        let sampleIndex = 0;

        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            setMedianColorSample(
              data,
              width,
              height,
              x + kx,
              y + ky,
              edgeMode,
              sampleIndex,
              redSamples,
              greenSamples,
              blueSamples,
              brightnessSamples
            );
            sampleIndex += 1;
          }
        }

        sortMedianColorSamples(brightnessSamples, redSamples, greenSamples, blueSamples);
        if (shouldFilterGray) {
          output[targetIndex] = brightnessSamples[4];
          output[targetIndex + 1] = brightnessSamples[4];
          output[targetIndex + 2] = brightnessSamples[4];
        } else {
          if (shouldFilterRed) output[targetIndex] = redSamples[4];
          if (shouldFilterGreen) output[targetIndex + 1] = greenSamples[4];
          if (shouldFilterBlue) output[targetIndex + 2] = blueSamples[4];
        }
      }

      if (shouldFilterAlpha) {
        let sampleIndex = 0;

        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            alphaSamples[sampleIndex] = getKernelSample(data, width, height, x + kx, y + ky, 3, edgeMode);
            sampleIndex += 1;
          }
        }

        sortNineValues(alphaSamples);
        output[targetIndex + 3] = alphaSamples[4];
      }
    }

    if (y % rowChunkSize === rowChunkSize - 1) {
      await waitForMainThread();
    }
  }

  return new ImageData(output, width, height);
}

function setMedianColorSample(
  data,
  width,
  height,
  x,
  y,
  edgeMode,
  sampleIndex,
  redSamples,
  greenSamples,
  blueSamples,
  brightnessSamples
) {
  let r;
  let g;
  let b;

  if (x >= 0 && x < width && y >= 0 && y < height) {
    const index = (y * width + x) * 4;
    r = data[index];
    g = data[index + 1];
    b = data[index + 2];
  } else if (edgeMode === 'black') {
    r = 0;
    g = 0;
    b = 0;
  } else if (edgeMode === 'white') {
    r = 255;
    g = 255;
    b = 255;
  } else {
    const clampedX = clamp(x, 0, width - 1);
    const clampedY = clamp(y, 0, height - 1);
    const index = (clampedY * width + clampedX) * 4;
    r = data[index];
    g = data[index + 1];
    b = data[index + 2];
  }

  redSamples[sampleIndex] = r;
  greenSamples[sampleIndex] = g;
  blueSamples[sampleIndex] = b;
  brightnessSamples[sampleIndex] = Math.round((0.299 * r) + (0.587 * g) + (0.114 * b));
}

function sortMedianColorSamples(brightnessSamples, redSamples, greenSamples, blueSamples) {
  for (let i = 1; i < 9; i += 1) {
    const brightness = brightnessSamples[i];
    const red = redSamples[i];
    const green = greenSamples[i];
    const blue = blueSamples[i];
    let j = i - 1;

    while (j >= 0 && brightnessSamples[j] > brightness) {
      brightnessSamples[j + 1] = brightnessSamples[j];
      redSamples[j + 1] = redSamples[j];
      greenSamples[j + 1] = greenSamples[j];
      blueSamples[j + 1] = blueSamples[j];
      j -= 1;
    }

    brightnessSamples[j + 1] = brightness;
    redSamples[j + 1] = red;
    greenSamples[j + 1] = green;
    blueSamples[j + 1] = blue;
  }
}

function sortNineValues(values) {
  for (let i = 1; i < 9; i += 1) {
    const value = values[i];
    let j = i - 1;

    while (j >= 0 && values[j] > value) {
      values[j + 1] = values[j];
      j -= 1;
    }

    values[j + 1] = value;
  }
}

function getKernelSample(data, width, height, x, y, channelIndex, edgeMode) {
  if (x >= 0 && x < width && y >= 0 && y < height) {
    return data[(y * width + x) * 4 + channelIndex];
  }

  if (edgeMode === 'black') return 0;
  if (edgeMode === 'white') return 255;

  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  return data[(clampedY * width + clampedX) * 4 + channelIndex];
}

function waitForMainThread() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

function imageDataToBlob(imageData, mimeType, quality) {
  return new Promise((resolve, reject) => {
    const scratch = document.createElement('canvas');
    const ctx = scratch.getContext('2d');
    scratch.width = imageData.width;
    scratch.height = imageData.height;

    if (mimeType === 'image/jpeg') {
      const sourceCanvas = document.createElement('canvas');
      const sourceCtx = sourceCanvas.getContext('2d');
      sourceCanvas.width = imageData.width;
      sourceCanvas.height = imageData.height;
      sourceCtx.putImageData(imageData, 0, 0);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, scratch.width, scratch.height);
      ctx.drawImage(sourceCanvas, 0, 0);
    } else {
      ctx.putImageData(imageData, 0, 0);
    }
    scratch.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Не удалось сформировать файл для скачивания.'));
        }
      },
      mimeType,
      quality
    );
  });
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
