const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d];
const GB7_VERSION = 0x01;

export function decodeGB7(arrayBuffer) {
  const view = new DataView(arrayBuffer);

  if (arrayBuffer.byteLength < 12) {
    throw new Error('Файл слишком короткий для формата GB7.');
  }

  for (let i = 0; i < GB7_SIGNATURE.length; i += 1) {
    if (view.getUint8(i) !== GB7_SIGNATURE[i]) {
      throw new Error('Некорректная сигнатура GB7-файла.');
    }
  }

  const version = view.getUint8(4);
  const flags = view.getUint8(5);
  const width = view.getUint16(6, false);
  const height = view.getUint16(8, false);
  const reserved = view.getUint16(10, false);
  const hasMask = (flags & 0b00000001) === 1;
  const reservedBits = flags & 0b11111110;

  if (version !== GB7_VERSION) {
    throw new Error(`Неподдерживаемая версия GB7: ${version}.`);
  }

  if (reservedBits !== 0) {
    throw new Error('В поле флагов выставлены зарезервированные биты.');
  }

  if (reserved !== 0) {
    throw new Error('Зарезервированное поле заголовка должно быть равно 0x0000.');
  }

  if (width === 0 || height === 0) {
    throw new Error('Ширина и высота GB7 должны быть больше нуля.');
  }

  const pixelCount = width * height;
  const expectedSize = 12 + pixelCount;

  if (arrayBuffer.byteLength !== expectedSize) {
    throw new Error(
      `Некорректный размер файла GB7. Ожидалось ${expectedSize} байт, получено ${arrayBuffer.byteLength}.`
    );
  }

  const source = new Uint8Array(arrayBuffer, 12);
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i += 1) {
    const value = source[i];
    const gray7 = value & 0b01111111;
    const gray8 = Math.round((gray7 / 127) * 255);
    const alpha = hasMask ? ((value & 0b10000000) !== 0 ? 255 : 0) : 255;

    if (!hasMask && (value & 0b10000000) !== 0) {
      throw new Error('GB7 без маски содержит установленный старший бит в данных пикселей.');
    }

    const offset = i * 4;
    rgba[offset] = gray8;
    rgba[offset + 1] = gray8;
    rgba[offset + 2] = gray8;
    rgba[offset + 3] = alpha;
  }

  return {
    width,
    height,
    hasMask,
    imageData: new ImageData(rgba, width, height),
    meta: {
      format: 'GB7',
      colorDepth: hasMask ? '7-bit Gray + 1-bit mask' : '7-bit Gray',
      version,
      flags,
    },
  };
}

export function encodeGB7(imageData, { useMask } = {}) {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const withMask = typeof useMask === 'boolean' ? useMask : hasTransparency(data);
  const output = new Uint8Array(12 + pixelCount);

  output.set(GB7_SIGNATURE, 0);
  output[4] = GB7_VERSION;
  output[5] = withMask ? 0x01 : 0x00;

  const view = new DataView(output.buffer);
  view.setUint16(6, width, false);
  view.setUint16(8, height, false);
  view.setUint16(10, 0, false);

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    const gray8 = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const gray7 = Math.max(0, Math.min(127, Math.round((gray8 / 255) * 127)));
    const maskBit = withMask ? (a >= 128 ? 0b10000000 : 0) : 0;

    output[12 + i] = maskBit | gray7;
  }

  return output;
}

export function hasTransparency(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
}
