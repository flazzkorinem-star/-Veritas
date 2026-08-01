const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 300_000;

const TEXT_MIME_TYPES: Record<string, ReadonlySet<string>> = {
  md: new Set(["text/markdown", "text/x-markdown", "text/plain", ""]),
  txt: new Set(["text/plain", ""]),
};

export type MaterialReadErrorCode =
  | "UNSUPPORTED_TYPE"
  | "MIME_MISMATCH"
  | "FILE_TOO_LARGE"
  | "TEXT_TOO_LONG"
  | "EMPTY_TEXT"
  | "INVALID_ENCODING";

export class MaterialReadError extends Error {
  constructor(
    readonly code: MaterialReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialReadError";
  }
}

export interface ReadProgress {
  loadedBytes: number;
  totalBytes: number;
}

function validateFile(file: File) {
  const fileName = file.name.split(/[\\/]/).at(-1)?.trim() ?? "";
  const extension = fileName.toLocaleLowerCase("en-US").split(".").at(-1) ?? "";
  const acceptedMimeTypes = TEXT_MIME_TYPES[extension];
  if (!fileName || !acceptedMimeTypes) {
    throw new MaterialReadError(
      "UNSUPPORTED_TYPE",
      "当前步骤只支持 Markdown（MD）和 TXT 文件。",
    );
  }
  if (!acceptedMimeTypes.has(file.type.toLocaleLowerCase("en-US"))) {
    throw new MaterialReadError("MIME_MISMATCH", "文件类型与扩展名不一致，请重新选择。 ");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new MaterialReadError("FILE_TOO_LARGE", "文件超过 30MB，请拆分材料后再上传。");
  }
  return fileName;
}

async function readBytes(file: File, onProgress?: (progress: ReadProgress) => void) {
  onProgress?.({ loadedBytes: 0, totalBytes: file.size });
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) =>
      onProgress?.({ loadedBytes: event.loaded, totalBytes: file.size });
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败。"));
    reader.onabort = () => reject(new Error("读取已取消。"));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("读取结果无效。"));
        return;
      }
      onProgress?.({ loadedBytes: file.size, totalBytes: file.size });
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function readTextMaterial(
  file: File,
  onProgress?: (progress: ReadProgress) => void,
) {
  const fileName = validateFile(file);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true })
      .decode(await readBytes(file, onProgress))
      .replace(/^\uFEFF/, "")
      .trim();
  } catch (error) {
    if (error instanceof MaterialReadError) throw error;
    throw new MaterialReadError(
      "INVALID_ENCODING",
      "文本不是有效的 UTF-8 编码，请转换编码后重试。",
    );
  }
  if (!text) {
    throw new MaterialReadError("EMPTY_TEXT", "材料中没有可读取的文字。 ");
  }
  if (text.length > MAX_TEXT_CHARACTERS) {
    throw new MaterialReadError(
      "TEXT_TOO_LONG",
      "解析后的文字超过 30 万字符，请拆分材料后再上传。",
    );
  }
  return { fileName, mimeType: file.type, sizeBytes: file.size, text };
}
