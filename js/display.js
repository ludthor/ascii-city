export const C = {
  BLACK: 0,
  CYAN: 1,
  CYAN_DIM: 2,
  BLUE: 3,
  BLUE_DEEP: 4,
  YELLOW: 5,
  AMBER: 6,
  GOLD_DIM: 7,
  LIME: 8,
  GREEN_DIM: 9,
  MAGENTA: 10,
  RED: 11,
  MAGENTA_DIM: 12,
  WHITE: 13,
  GRAY: 14,
  ORANGE: 15,
};

export const PALETTE = [
  "#000000",
  "#00f5ff",
  "#2a8a99",
  "#4d7cff",
  "#1a3a8a",
  "#ffe600",
  "#ffb800",
  "#8a7400",
  "#39ff14",
  "#1a8a30",
  "#ff2a6d",
  "#ff4d00",
  "#8a1040",
  "#e8e8e8",
  "#5a5a5a",
  "#ff7a18",
];

export const DIM_OF = [
  C.BLACK,
  C.CYAN_DIM,
  C.CYAN_DIM,
  C.BLUE_DEEP,
  C.BLUE_DEEP,
  C.GOLD_DIM,
  C.GOLD_DIM,
  C.GOLD_DIM,
  C.GREEN_DIM,
  C.GREEN_DIM,
  C.MAGENTA_DIM,
  C.MAGENTA_DIM,
  C.MAGENTA_DIM,
  C.GRAY,
  C.GRAY,
  C.GOLD_DIM,
];

const FIRST_CHAR = 32;
const CHAR_COUNT = 95;

export class Display {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.cols = 0;
    this.rows = 0;
    this.pixelW = 10;
    this.pixelH = 16;
    this.chars = new Uint16Array(0);
    this.colors = new Uint8Array(0);
    this.colZ = new Float32Array(0);
    this.atlas = null;
  }

  resize(viewW, viewH) {
    const targetW = 10;
    const targetH = 16;
    this.cols = Math.max(80, Math.floor(viewW / targetW));
    this.rows = Math.max(36, Math.floor(viewH / targetH));
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.pixelW = Math.max(7, Math.floor((viewW * dpr) / this.cols));
    this.pixelH = Math.max(11, Math.floor((viewH * dpr) / this.rows));

    this.canvas.width = this.cols * this.pixelW;
    this.canvas.height = this.rows * this.pixelH;
    this.ctx.imageSmoothingEnabled = false;

    const n = this.cols * this.rows;
    this.chars = new Uint16Array(n);
    this.colors = new Uint8Array(n);
    this.colZ = new Float32Array(this.cols);
    this._buildAtlas();
  }

  clear() {
    this.chars.fill(32);
    this.colors.fill(0);
  }

  _buildAtlas() {
    const pw = this.pixelW;
    const ph = this.pixelH;
    const atlas = document.createElement("canvas");
    atlas.width = CHAR_COUNT * pw;
    atlas.height = PALETTE.length * ph;
    const actx = atlas.getContext("2d", { alpha: false });
    actx.imageSmoothingEnabled = false;
    actx.fillStyle = "#000000";
    actx.fillRect(0, 0, atlas.width, atlas.height);
    const fontPx = Math.floor(ph * 0.84);
    actx.font = `700 ${fontPx}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    actx.textAlign = "center";
    actx.textBaseline = "middle";

    const ox = pw / 2;
    const oy = ph / 2 + ph * 0.05;
    for (let ci = 0; ci < PALETTE.length; ci++) {
      actx.fillStyle = PALETTE[ci];
      for (let i = 0; i < CHAR_COUNT; i++) {
        const ch = FIRST_CHAR + i;
        if (ch === 32) continue;
        actx.fillText(String.fromCharCode(ch), i * pw + ox, ci * ph + oy);
      }
    }
    this.atlas = atlas;
  }

  present() {
    const { ctx, cols, rows, pixelW, pixelH, chars, colors, atlas } = this;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!atlas) return;

    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      const dy = y * pixelH;
      for (let x = 0; x < cols; x++) {
        const ch = chars[row + x];
        if (ch <= 32 || ch > 126) continue;
        const ci = colors[row + x];
        const sx = (ch - FIRST_CHAR) * pixelW;
        const sy = ci * pixelH;
        ctx.drawImage(atlas, sx, sy, pixelW, pixelH, x * pixelW, dy, pixelW, pixelH);
      }
    }
  }
}
