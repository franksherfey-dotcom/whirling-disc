// Server-only. Turns one label close-up into what the vision model actually
// needs to read etched matrix text: an overview for context plus four
// magnified, overlapping quadrants of the ring around the label. The model
// downsizes anything over ~1.5 MP, so a whole-frame photo leaves the etching
// a dozen pixels tall; quadrants keep it at native resolution.
import sharp from "sharp";

export type DeadwaxTile = { role: string; base64: string };

const OVERVIEW_PX = 1000;
const TILE_MAX_PX = 1568; // the model's long-edge ceiling; anything larger is wasted bytes
const TILE_FRAC = 0.62;   // each quadrant covers 62% of the side, so neighbours overlap ~24%

async function fetchBuffer(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const b64 = src.includes(",") ? src.split(",")[1] : src;
    return Buffer.from(b64, "base64");
  }
  if (src.startsWith("http://") || src.startsWith("https://")) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`Could not fetch deadwax image (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
  return Buffer.from(src, "base64");
}

export async function deadwaxTiles(src: string): Promise<DeadwaxTile[]> {
  const input = await fetchBuffer(src);
  // Respect EXIF orientation, then centre-crop to a square (the client already
  // does this, but a stored photo from an older build may be a full frame).
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) throw new Error("Unreadable deadwax image");
  const side = Math.min(w, h);
  const square = base.extract({ left: Math.floor((w - side) / 2), top: Math.floor((h - side) / 2), width: side, height: side });
  const squareBuf = await square.jpeg({ quality: 90 }).toBuffer();

  const overview = await sharp(squareBuf).resize(OVERVIEW_PX, OVERVIEW_PX, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();

  const tileSide = Math.round(side * TILE_FRAC);
  const off = side - tileSide;
  const spots: [string, number, number][] = [
    ["top-left", 0, 0],
    ["top-right", off, 0],
    ["bottom-left", 0, off],
    ["bottom-right", off, off],
  ];
  const tiles: DeadwaxTile[] = [
    { role: "label close-up, OVERVIEW of the whole shot (Side A label with the runout ring around it)", base64: overview.toString("base64") },
  ];
  for (const [name, left, top] of spots) {
    const buf = await sharp(squareBuf)
      .extract({ left, top, width: tileSide, height: tileSide })
      .resize(Math.min(TILE_MAX_PX, tileSide), Math.min(TILE_MAX_PX, tileSide), { fit: "inside" })
      .normalise() // stretch contrast so shallow etching in dark vinyl separates from the surface
      .sharpen()
      .jpeg({ quality: 88 })
      .toBuffer();
    tiles.push({
      role: `label close-up, MAGNIFIED ${name} quadrant of the same shot. The label edge and the smooth runout ring are in this tile; read any scratched or stamped characters in the ring (they may be upside-down or run along the curve)`,
      base64: buf.toString("base64"),
    });
  }
  return tiles;
}
