import JSZip from "jszip";

import {
  finishParsedMaterial,
  MaterialParseError,
  type ParsingProgress,
} from "./parsed-material";

const MAX_SLIDES = 200;

function parseSafeXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new MaterialParseError("INVALID_CONTENT", "PPT 包含不安全的 XML 声明。 ");
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new MaterialParseError("INVALID_CONTENT", "PPT 的 XML 结构无效。 ");
  }
  return document;
}

function resolveSlideOrder(presentationXml: string, relationshipsXml: string) {
  const presentation = parseSafeXml(presentationXml);
  const relationships = parseSafeXml(relationshipsXml);
  const targets = new Map<string, string>();
  for (const relation of relationships.getElementsByTagNameNS("*", "Relationship")) {
    const id = relation.getAttribute("Id");
    const target = relation.getAttribute("Target");
    if (
      !id ||
      !target ||
      relation.getAttribute("TargetMode") === "External" ||
      /^(?:[a-z]+:|\/|\\)/iu.test(target) ||
      target.split(/[\\/]/u).includes("..")
    ) {
      continue;
    }
    targets.set(id, `ppt/${target.replaceAll("\\", "/")}`);
  }
  return [...presentation.getElementsByTagNameNS("*", "sldId")].map((slide) => {
    const relationshipId = slide.getAttribute("r:id");
    const path = relationshipId ? targets.get(relationshipId) : undefined;
    if (!path || !/^ppt\/slides\/slide\d+\.xml$/u.test(path)) {
      throw new MaterialParseError("INVALID_CONTENT", "PPT 的幻灯片顺序无效。 ");
    }
    return path;
  });
}

export async function parsePptx(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  onProgress?: (progress: ParsingProgress) => void,
) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  const presentationEntry = zip.file("ppt/presentation.xml");
  const relationshipsEntry = zip.file("ppt/_rels/presentation.xml.rels");
  if (!presentationEntry || !relationshipsEntry) {
    throw new MaterialParseError("INVALID_CONTENT", "PPT 缺少幻灯片顺序信息。 ");
  }
  const order = resolveSlideOrder(
    await presentationEntry.async("string"),
    await relationshipsEntry.async("string"),
  );
  if (order.length > MAX_SLIDES) {
    throw new MaterialParseError("SLIDE_LIMIT", "PPT 超过 200 页，请拆分材料。 ");
  }
  const blocks = [];
  for (const [index, path] of order.entries()) {
    const entry = zip.file(path);
    if (!entry) {
      throw new MaterialParseError("INVALID_CONTENT", "PPT 缺少已声明的幻灯片。 ");
    }
    onProgress?.({
      stage: "PARSING",
      current: index + 1,
      total: order.length,
      label: `读取第 ${index + 1} 张幻灯片`,
    });
    const slide = parseSafeXml(await entry.async("string"));
    const text = [...slide.getElementsByTagNameNS("*", "t")]
      .map((node) => node.textContent ?? "")
      .join(" ");
    blocks.push({ sourceLabel: `第 ${index + 1} 张幻灯片`, text });
  }
  return finishParsedMaterial(fileName, mimeType, blocks);
}
