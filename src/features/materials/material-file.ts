const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;
const MAX_COMPRESSION_RATIO = 1_000;

export type MaterialKind = "TEXT" | "PDF" | "DOCX" | "PPTX" | "IMAGE";

export type MaterialFileErrorCode =
  | "UNSUPPORTED_TYPE"
  | "MIME_MISMATCH"
  | "SIGNATURE_MISMATCH"
  | "FILE_TOO_LARGE"
  | "INVALID_CONTAINER"
  | "RESOURCE_LIMIT"
  | "CANCELLED"
  | "READ_FAILED";

export class MaterialFileError extends Error {
  constructor(
    readonly code: MaterialFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialFileError";
  }
}

export interface MaterialReadProgress {
  loadedBytes: number;
  totalBytes: number;
}

export interface InspectedMaterialFile {
  fileName: string;
  extension: string;
  kind: MaterialKind;
  mimeType: string;
  zipEntries?: readonly string[];
}

interface FileRule {
  kind: MaterialKind;
  mimeTypes: ReadonlySet<string>;
  signature?: (bytes: Uint8Array) => boolean;
}

const OFFICE_MIME_FALLBACKS = ["application/zip", "application/octet-stream", ""];
const rules: Record<string, FileRule> = {
  md: {
    kind: "TEXT",
    mimeTypes: new Set(["text/markdown", "text/x-markdown", "text/plain", ""]),
  },
  txt: { kind: "TEXT", mimeTypes: new Set(["text/plain", ""]) },
  pdf: {
    kind: "PDF",
    mimeTypes: new Set(["application/pdf"]),
    signature: (bytes) => startsWith(bytes, [37, 80, 68, 70, 45]),
  },
  docx: {
    kind: "DOCX",
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ...OFFICE_MIME_FALLBACKS,
    ]),
    signature: isZip,
  },
  pptx: {
    kind: "PPTX",
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ...OFFICE_MIME_FALLBACKS,
    ]),
    signature: isZip,
  },
  png: {
    kind: "IMAGE",
    mimeTypes: new Set(["image/png"]),
    signature: (bytes) => startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10]),
  },
  jpg: {
    kind: "IMAGE",
    mimeTypes: new Set(["image/jpeg"]),
    signature: isJpeg,
  },
  jpeg: {
    kind: "IMAGE",
    mimeTypes: new Set(["image/jpeg"]),
    signature: isJpeg,
  },
  webp: {
    kind: "IMAGE",
    mimeTypes: new Set(["image/webp"]),
    signature: (bytes) =>
      startsWith(bytes, [82, 73, 70, 70]) &&
      bytes[8] === 87 &&
      bytes[9] === 69 &&
      bytes[10] === 66 &&
      bytes[11] === 80,
  },
};

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function isZip(bytes: Uint8Array) {
  return (
    startsWith(bytes, [80, 75, 3, 4]) ||
    startsWith(bytes, [80, 75, 5, 6]) ||
    startsWith(bytes, [80, 75, 7, 8])
  );
}

function isJpeg(bytes: Uint8Array) {
  return startsWith(bytes, [255, 216, 255]);
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let index = bytes.length - 22; index >= minimum; index -= 1) {
    if (startsWith(bytes.subarray(index), [80, 75, 5, 6])) return index;
  }
  return -1;
}

export function inspectZipContainer(bytes: Uint8Array) {
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) {
    throw new MaterialFileError("INVALID_CONTAINER", "Office 文件容器不完整或已损坏。 ");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (entryCount > MAX_ZIP_ENTRIES || centralOffset + centralSize > bytes.length) {
    throw new MaterialFileError("RESOURCE_LIMIT", "Office 文件结构过大，请拆分材料。 ");
  }

  const names: string[] = [];
  const normalizedNames = new Set<string>();
  let totalExpandedBytes = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new MaterialFileError("INVALID_CONTAINER", "Office 文件目录结构无效。 ");
    }
    const flags = view.getUint16(cursor + 8, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const expandedBytes = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if ((flags & 1) !== 0) {
      throw new MaterialFileError("INVALID_CONTAINER", "不支持加密的 Office 文件。 ");
    }
    totalExpandedBytes += expandedBytes;
    const ratio = compressedBytes === 0 ? expandedBytes : expandedBytes / compressedBytes;
    if (totalExpandedBytes > MAX_ZIP_BYTES || ratio > MAX_COMPRESSION_RATIO) {
      throw new MaterialFileError(
        "RESOURCE_LIMIT",
        "Office 文件解压规模异常，请拆分材料。 ",
      );
    }
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) {
      throw new MaterialFileError("INVALID_CONTAINER", "Office 文件条目无效。 ");
    }
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(nameStart, nameEnd),
    );
    if (!name || name.includes("\0") || name.split(/[\\/]/u).includes("..")) {
      throw new MaterialFileError("INVALID_CONTAINER", "Office 文件包含不安全路径。 ");
    }
    const normalizedName = name.replaceAll("\\", "/");
    if (normalizedNames.has(normalizedName)) {
      throw new MaterialFileError("INVALID_CONTAINER", "Office 文件包含重复条目。 ");
    }
    normalizedNames.add(normalizedName);
    names.push(normalizedName);
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) {
    throw new MaterialFileError("INVALID_CONTAINER", "Office 文件目录长度无效。 ");
  }
  return names;
}

function requireOfficeStructure(kind: "DOCX" | "PPTX", entries: readonly string[]) {
  const entrySet = new Set(entries);
  const common = entrySet.has("[Content_Types].xml") && entrySet.has("_rels/.rels");
  const specific =
    kind === "DOCX"
      ? entrySet.has("word/document.xml")
      : entrySet.has("ppt/presentation.xml") &&
        entries.some((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry));
  if (!common || !specific) {
    throw new MaterialFileError(
      "INVALID_CONTAINER",
      `文件不是有效的${kind === "DOCX" ? " Word（DOCX）" : " PPT（PPTX）"}材料。`,
    );
  }
}

export function inspectMaterialFile(
  file: File,
  bytes: Uint8Array,
): InspectedMaterialFile {
  const fileName = file.name.split(/[\\/]/u).at(-1)?.trim() ?? "";
  const extension = fileName.toLocaleLowerCase("en-US").split(".").at(-1) ?? "";
  const rule = rules[extension];
  if (!fileName || !rule) {
    throw new MaterialFileError(
      "UNSUPPORTED_TYPE",
      "支持 PDF、Word（DOCX）、PPT（PPTX）、Markdown、TXT 和常见图片。",
    );
  }
  const mimeType = file.type.toLocaleLowerCase("en-US");
  if (!rule.mimeTypes.has(mimeType)) {
    throw new MaterialFileError("MIME_MISMATCH", "文件类型与扩展名不一致，请重新选择。 ");
  }
  if (rule.signature && !rule.signature(bytes)) {
    throw new MaterialFileError(
      "SIGNATURE_MISMATCH",
      "文件内容与扩展名不一致，请重新选择。 ",
    );
  }
  let zipEntries: readonly string[] | undefined;
  if (rule.kind === "DOCX" || rule.kind === "PPTX") {
    zipEntries = inspectZipContainer(bytes);
    requireOfficeStructure(rule.kind, zipEntries);
  }
  return { fileName, extension, kind: rule.kind, mimeType, zipEntries };
}

export async function readMaterialBytes(
  file: File,
  onProgress?: (progress: MaterialReadProgress) => void,
  signal?: AbortSignal,
) {
  if (file.size > MAX_FILE_BYTES) {
    throw new MaterialFileError("FILE_TOO_LARGE", "文件超过 30MB，请拆分材料后再上传。 ");
  }
  if (signal?.aborted) {
    throw new MaterialFileError("CANCELLED", "已取消处理这份材料。 ");
  }
  onProgress?.({ loadedBytes: 0, totalBytes: file.size });
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => reader.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const finish = () => signal?.removeEventListener("abort", cancel);
    reader.onprogress = (event) =>
      onProgress?.({ loadedBytes: event.loaded, totalBytes: file.size });
    reader.onerror = () => {
      finish();
      reject(new MaterialFileError("READ_FAILED", "读取文件失败，请重试。 "));
    };
    reader.onabort = () => {
      finish();
      reject(new MaterialFileError("CANCELLED", "已取消处理这份材料。 "));
    };
    reader.onload = () => {
      finish();
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new MaterialFileError("READ_FAILED", "读取文件失败，请重试。 "));
        return;
      }
      onProgress?.({ loadedBytes: file.size, totalBytes: file.size });
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}
