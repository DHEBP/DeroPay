/**
 * Minimal QR code renderer for the widget.
 * Same algorithm as checkout/src/qr.ts but self-contained.
 */

export function renderQR(container: HTMLElement, text: string, size = 180): void {
  const modules = generateQR(text);
  const moduleCount = modules.length;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cellSize = size / moduleCount;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (modules[row][col]) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize + 0.5, cellSize + 0.5);
      }
    }
  }

  container.innerHTML = "";
  container.appendChild(canvas);
}

function generateQR(text: string): boolean[][] {
  const data = new TextEncoder().encode(text);
  const version = getMinVersion(data.length);
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  addFinderPatterns(modules, reserved, size);
  addAlignmentPatterns(modules, reserved, version, size);
  addTimingPatterns(modules, reserved, size);
  reserved[8][size - 8] = true;
  modules[8][size - 8] = true;

  const bits = encodeData(data, version);
  placeBits(modules, reserved, bits, size);
  applyMask(modules, reserved, size);
  addFormatInfo(modules, size);
  return modules;
}

function getMinVersion(len: number): number {
  const c = [0,17,32,53,78,106,134,154,192,230,271,321,367,425,458,520,586,644,718,792,858];
  for (let v = 1; v <= 20; v++) { if (len <= c[v]) return v; }
  return 20;
}

function addFinderPatterns(m: boolean[][], r: boolean[][], s: number): void {
  for (const [row, col] of [[0,0],[0,s-7],[s-7,0]]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = row+dr, cc = col+dc;
        if (rr<0||rr>=s||cc<0||cc>=s) continue;
        r[rr][cc] = true;
        const outer = dr===0||dr===6||dc===0||dc===6;
        const inner = dr>=2&&dr<=4&&dc>=2&&dc<=4;
        m[rr][cc] = (dr>=0&&dr<=6&&dc>=0&&dc<=6) && (outer||inner);
      }
    }
  }
}

function addAlignmentPatterns(m: boolean[][], r: boolean[][], v: number, s: number): void {
  if (v < 2) return;
  const pos = getAlignPos(v);
  for (const row of pos) for (const col of pos) {
    if (r[row][col]) continue;
    for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++) {
      r[row+dr][col+dc] = true;
      m[row+dr][col+dc] = Math.abs(dr)===2||Math.abs(dc)===2||(dr===0&&dc===0);
    }
  }
}

function getAlignPos(v: number): number[] {
  if (v===1) return [];
  const last = v*4+10;
  if (v<=6) return [6,last];
  const cnt = Math.floor(v/7)+2;
  const step = Math.ceil((last-6)/(cnt-1)/2)*2;
  const r = [6];
  for (let i=last; r.length<cnt; i-=step) r.splice(1,0,i);
  return r;
}

function addTimingPatterns(m: boolean[][], r: boolean[][], s: number): void {
  for (let i=8;i<s-8;i++) {
    if (!r[6][i]) { r[6][i]=true; m[6][i]=i%2===0; }
    if (!r[i][6]) { r[i][6]=true; m[i][6]=i%2===0; }
  }
}

function encodeData(data: Uint8Array, version: number): number[] {
  const total = getCapBits(version);
  const bits: number[] = [];
  push(bits,0b0100,4);
  push(bits,data.length,version<=9?8:16);
  for (const b of data) push(bits,b,8);
  push(bits,0,Math.min(4,total-bits.length));
  while (bits.length%8!==0) bits.push(0);
  const pad = [0b11101100,0b00010001];
  let pi = 0;
  while (bits.length<total) { push(bits,pad[pi%2],8); pi++; }
  return bits;
}

function getCapBits(v: number): number {
  const c = [0,152,272,440,640,864,1088,1248,1552,1856,2192,2592,2960,3424,3688,4184,4712,5176,5768,6360,6888];
  return c[v]??c[20];
}

function push(bits: number[], val: number, len: number): void {
  for (let i=len-1;i>=0;i--) bits.push((val>>i)&1);
}

function placeBits(m: boolean[][], r: boolean[][], bits: number[], s: number): void {
  let bi=0;
  for (let right=s-1;right>=1;right-=2) {
    if (right===6) right=5;
    for (let vert=0;vert<s;vert++) {
      for (let j=0;j<2;j++) {
        const col=right-j;
        const row=((right+1)&2)===0?s-1-vert:vert;
        if (r[row][col]) continue;
        m[row][col]=bi<bits.length?bits[bi]===1:false;
        bi++;
      }
    }
  }
}

function applyMask(m: boolean[][], r: boolean[][], s: number): void {
  for (let row=0;row<s;row++) for (let col=0;col<s;col++) {
    if (r[row][col]) continue;
    if ((row+col)%2===0) m[row][col]=!m[row][col];
  }
}

function addFormatInfo(m: boolean[][], s: number): void {
  const f=0b101010000010010;
  for (let i=0;i<15;i++) {
    const bit=((f>>(14-i))&1)===1;
    if (i<6) m[8][i]=bit;
    else if (i===6) m[8][7]=bit;
    else if (i===7) m[8][8]=bit;
    else if (i===8) m[7][8]=bit;
    else m[14-i][8]=bit;
    if (i<8) m[s-1-i][8]=bit;
    else m[8][s-15+i]=bit;
  }
}
