import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import { parseDocx } from "./docx-parser";
import { parsePptx } from "./pptx-parser";

async function docxBytes() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>水循环由太阳驱动。</w:t></w:r></w:p><w:p><w:r><w:t>水蒸气凝结成云。</w:t></w:r></w:p></w:body></w:document>',
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function pptxBytes(xmlOverride?: string) {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    xmlOverride ??
      '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>',
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
  );
  zip.file(
    "ppt/slides/slide1.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>第一张</a:t></p:sld>',
  );
  zip.file(
    "ppt/slides/slide2.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>第二张</a:t></p:sld>',
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("Office 材料解析", () => {
  it("DOCX 只提取纯文本，并保留段落来源", async () => {
    const progress = vi.fn();
    const result = await parseDocx(
      await docxBytes(),
      "lesson.docx",
      progress,
    );

    expect(result.text).toContain("水循环由太阳驱动");
    expect(result.sourceBlocks).toEqual([
      { sourceLabel: "第 1 段", text: "水循环由太阳驱动。" },
      { sourceLabel: "第 2 段", text: "水蒸气凝结成云。" },
    ]);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ current: 1, total: 1 }),
    );
  });

  it("PPTX 按演示文稿关系顺序提取每张幻灯片", async () => {
    const result = await parsePptx(
      await pptxBytes(),
      "lesson.pptx",
    );

    expect(result.sourceBlocks).toEqual([
      { sourceLabel: "第 1 张幻灯片", text: "第二张" },
      { sourceLabel: "第 2 张幻灯片", text: "第一张" },
    ]);
  });

  it("PPTX 拒绝 DTD 或实体声明", async () => {
    await expect(
      parsePptx(
        await pptxBytes(
          '<!DOCTYPE p [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><p:presentation xmlns:p="p"/>',
        ),
        "unsafe.pptx",
      ),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT" });
  });

  it("PPTX 在逐页解析前拒绝超过 200 张幻灯片", async () => {
    const zip = new JSZip();
    const slideIds = Array.from(
      { length: 201 },
      (_, index) => `<p:sldId r:id="rId${index + 1}"/>`,
    ).join("");
    const relationships = Array.from(
      { length: 201 },
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Target="slides/slide${index + 1}.xml"/>`,
    ).join("");
    zip.file(
      "ppt/presentation.xml",
      `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`,
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`,
    );
    await expect(
      parsePptx(
        await zip.generateAsync({ type: "uint8array" }),
        "huge.pptx",
      ),
    ).rejects.toMatchObject({ code: "SLIDE_LIMIT" });
  });
});
