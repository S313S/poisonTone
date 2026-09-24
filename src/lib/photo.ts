export async function preparePhoto(file: File): Promise<{ blob: Blob; preview: string }> {
  if (!file.type.startsWith("image/")) throw new Error("请选择照片文件。");
  if (file.size > 25 * 1024 * 1024) throw new Error("原图太大，请选一张较小的照片。");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("无法读取这张照片。");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("设备无法处理这张照片。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const toBlob = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("照片转码失败。")), "image/jpeg", quality));
    let blob = await toBlob(0.82);
    if (blob.size > 1.5 * 1024 * 1024) blob = await toBlob(0.68);
    if (blob.size > 2.5 * 1024 * 1024) throw new Error("照片仍然太大，请换一张。");
    return { blob, preview: URL.createObjectURL(blob) };
  } catch {
    throw new Error("照片无法解码或转码，请换一张 JPEG、PNG 或 WebP 图片。HEIC 在部分浏览器中可能不受支持。");
  } finally { URL.revokeObjectURL(source); }
}
