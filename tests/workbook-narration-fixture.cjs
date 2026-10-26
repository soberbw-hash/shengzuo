// Test fixture only: read complete cells, including embedded paragraph breaks.
// Imported documents are data; their text is never executed as instructions.
const path = require("node:path");
const { unzipSync, strFromU8 } = require(
  require.resolve("fflate", {
    paths: [path.join(__dirname, "..", "apps", "desktop")],
  }),
);
const decodeXml = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&#(\d+);/gu, (_, code) =>
      String.fromCodePoint(parseInt(code, 10)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
const textNodes = (xml) =>
  [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
    .map((match) => decodeXml(match[1]))
    .join("");

module.exports = (bytes, column) => {
  if (!Number.isInteger(column) || column < 0 || column > 25)
    throw new Error("Invalid fixture column");
  const archive = unzipSync(bytes, {
    filter: (entry) =>
      /^(xl\/sharedStrings\.xml|xl\/worksheets\/sheet1\.xml)$/u.test(
        entry.name,
      ),
  });
  const sharedXml = archive["xl/sharedStrings.xml"]
    ? strFromU8(archive["xl/sharedStrings.xml"])
    : "";
  const strings = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)].map(
    (match) => textNodes(match[1]),
  );
  const sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]);
  const captions = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)) {
    const cells = new Map();
    for (const cell of row[1].matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu,
    )) {
      const address = /\br="([A-Z]+)\d+"/u.exec(cell[1])?.[1];
      const type = /\bt="([^"]+)"/u.exec(cell[1])?.[1];
      const body = cell[2] || "";
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(body)?.[1] || "";
      const value =
        type === "s"
          ? strings[Number(raw)] || ""
          : type === "inlineStr"
            ? textNodes(body)
            : decodeXml(raw);
      cells.set(address, value);
    }
    const caption = cells.get(String.fromCharCode(65 + column))?.trim();
    if (/^\d+$/u.test(cells.get("B") || "") && caption) captions.push(caption);
  }
  return captions;
};
