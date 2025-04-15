import { RC } from "@thegraid/common-lib";
// export { XYWH } from "@thegraid/common-lib";

/** Hexagonal canonical directions */
export type HexDir = 'NE' | 'EN' | 'E' | 'ES' | 'SE' | 'S' | 'SW' | 'WS' | 'W' | 'WN' | 'NW' | 'N';
export type EwDir = Extract<HexDir, 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW'>
export type NsDir = Extract<HexDir, 'EN' | 'ES' | 'S' | 'WS' | 'WN' | 'N'>;
export type Or8Dir = Extract<HexDir, 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N'>; // 8 compass dirs
export type Or4Dir = Extract<Or8Dir, 'N' | 'E' | 'S' | 'W'>; // 4 compass dirs
export type PyrDir = Extract<HexDir, 'NW' | 'NE' | 'SE' | 'SW'>; // 4 off-axis dirs

export type DCR    = { dc: number, dr: number }  // Delta for Col & Row
type TopoDCR = Record<HexDir, DCR>
type EwDCR = Record<EwDir, DCR>
type NsDCR = Record<NsDir, DCR>
type Or8DCR = Record<Or8Dir, DCR>
type Or4DCR = Record<Or4Dir, DCR>
export type DirDCR = Partial<Record<HexDir, DCR>>;
export type TopoXYWH = {
  x: number;
  y: number;
  w: number;
  h: number;
  dxdc: number;
  dydr: number;
}
/** function that returns XYWH of cell of size rad at row, col; using dxdc & dydr of the Topo. */
export type TopoMetric = (rad?: number, row?: number, col?: number) => TopoXYWH;

export abstract class TopoC<TD extends Partial<TopoDCR>, K extends keyof TD = keyof TD> {
  /** override to supply correct linkDirs */
  _linkDirs: K[];
  /** identify directions to adjacent cells; valid keys in topoDCR() */
  get linkDirs() { return this._linkDirs };

  /**
   * Used by nextRowCol to locate an adjacent cell.
   * @param rc For Hex topology, the adjacency depends on the particular (row, col)
   * @returns a TopoDCR
   */
  abstract topoDCR(rc: RC): TD;

  /**
   * Location of cell adjacent to RC in direction dir.
   * @param rc identify the current/source hex
   * @param dir the direction to step
   * @returns RC of the next/adjacent cell in the given direction
   */
  nextRowCol(rc: RC, dir: K) {
    const dcr = this.topoDCR(rc)[dir] as DCR;
    return { row: rc.row + dcr.dr, col: rc.col + dcr.dc };
  }

  /** a TopoMetric for graphical layout */
  xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const r2 = rad * 2;
    return { x: col * r2, y: row * r2, w: r2, h: r2, dxdc: r2, dydr: r2 }
  }
}

export class TopoOR8C extends TopoC<Or8DCR> {
  override _linkDirs = H.or8Dirs;
  topoDCR(rc: RC) {
    return {
      N: { dr: -1, dc: 0 }, E: { dr: 0, dc: 1 }, S: { dr: 1, dc: 0 }, W: { dr: 0, dc: -1 },
      NE: { dr: -1, dc: 1 }, SE: { dr: 1, dc: 1 }, SW: {dr: 1, dc: -1}, NW: {dr: -1, dc: -1}
   };
  }
}

export class TopoOR4C extends TopoC<Or4DCR> {
  override _linkDirs = H.or4Dirs;
  topoDCR(rc: RC) {
    return { N: { dr: -1, dc: 0 }, E: { dr: 0, dc: 1 }, S: { dr: 1, dc: 0 }, W: { dr: 0, dc: -1 } };
  }
}

export class TopoEWC extends TopoC<EwDCR> {
  override _linkDirs = H.ewDirs;
  // Hex rows with alternating alignment:
  ewEvenRow: EwDCR = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }
  }
  ewOddRow: EwDCR = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: { dc: 0, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: 0, dr: -1 }
  }
  topoDCR(rc: RC): EwDCR { return (rc.row % 2 == 0) ? this.ewEvenRow : this.ewOddRow };

  /** "odd rows" (based on abs(floor(row))) are shifted 1/2 column to right */
  override xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const h = 2 * rad, w = H.sqrt3 * rad, dydr = 1.5 * rad, dxdc = H.sqrt3 * rad;
    const x = (col + Math.abs(Math.floor(row) % 2) / 2) * dxdc;
    const y = (row) * dydr;   // dist between rows
    return { x, y, w, h, dxdc, dydr }
  };
}

export class TopoNSC extends TopoC<NsDCR> {
  override _linkDirs = H.nsDirs;
  // Hex columns with alternating alignment:
  nsEvenCol: NsDCR = {
    EN: { dc: +1, dr: -1 }, N: { dc: 0, dr: -1 }, ES: { dc: +1, dr: 0 },
    WS: { dc: -1, dr: 0 }, S: { dc: 0, dr: +1 }, WN: { dc: -1, dr: -1 }
  }
  nsOddCol: NsDCR = {
    EN: { dc: 1, dr: 0 }, N: { dc: 0, dr: -1 }, ES: { dc: 1, dr: 1 },
    WS: { dc: -1, dr: 1 }, S: { dc: 0, dr: 1 }, WN: { dc: -1, dr: 0 }
  }
  topoDCR(rc: RC) { return (rc.col % 2 == 0) ? this.nsEvenCol : this.nsOddCol };

  override xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const h = 2 * rad, w = H.sqrt3 * rad, dydr = 1.5 * rad, dxdc = H.sqrt3 * rad;
    const x = (col) * dxdc;   // dist between rows
    const y = (row + Math.abs(Math.floor(col) % 2) / 2) * dydr;
    return { x, y, w, h, dxdc, dydr }
  };
}

/** Hex things */
export namespace H {
  export const degToRadians = Math.PI / 180;
  /** 1.7320508075688772 */
  export const sqrt3 = Math.sqrt(3);
  /** 0.8660254037844386 */
  export const sqrt3_2 = H.sqrt3 / 2;

  /** not a HexDir, but identifies a Center; no Dir */
  export const C: 'C' = 'C';
  export const N: HexDir = 'N'
  export const S: HexDir = 'S'
  export const E: HexDir = 'E'
  export const W: HexDir = 'W'
  export const NE: HexDir = 'NE'
  export const SE: HexDir = 'SE'
  export const SW: HexDir = 'SW'
  export const NW: HexDir = 'NW'
  export const EN: HexDir = 'EN'
  export const ES: HexDir = 'ES'
  export const WS: HexDir = 'WS'
  export const WN: HexDir = 'WN'
  export function hexBounds(r: number, tilt = 0) {
    // dp(...6), so tilt: 30 | 0; being nsAxis (ewTopo) or ewAxis (nsTopo);
    const w = r * Math.cos(H.degToRadians * tilt);
    const h = r * Math.cos(H.degToRadians * (tilt - 30));
    return { x: -w, y: -h, width: 2 * w, height: 2 * h };
  }

  export const or4Dirs: Or4Dir[] = [E, S, W, N];
  export const or8Dirs: Or8Dir[] = [NE, E, SE, S, SW, W, NW, N];
  export const pyrDirs: PyrDir[] = [NE, NW, SE, SW];
  /** includes E & W, suitable for ewTopo */
  export const ewDirs: EwDir[] = [NE, E, SE, SW, W, NW]; // directions in TopoEW: EwDir
  /** includes N & S, suitable for nsTopo */
  export const nsDirs: NsDir[] = [N, EN, ES, S, WS, WN]; // directions in TopoNS: NsDir
  /** all hexDirs */
  export const hexDirs: HexDir[] = (H.ewDirs as HexDir[]).concat(H.nsDirs); // standard direction signifiers () ClockWise

  // angles for ewTopo!
  export const ewDirRot: Record<EwDir, number> = { NE: 30, E: 90, SE: 150, SW: 210, W: 270, NW: 330 }
  // angles for nwTopo!
  export const nsDirRot: Record<NsDir, number> = { N: 0, EN: 60, ES: 120, S: 180, WS: 240, WN: 300 }
  export const dirRot: Record<HexDir, number> = { ...H.ewDirRot, ...H.nsDirRot }

  export const dirRev: Record<HexDir, HexDir> = { N: S, S: N, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE, ES: WN, EN: WS, WS: EN, WN: ES }
  export const dirRevEW: Record<EwDir, EwDir> = { E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }
  export const dirRevNS: Record<NsDir, NsDir> = { N: S, S: N, EN: WS, ES: WN, WS: EN, WN: ES }
  export const rotDir: { [key: number]: HexDir } = { 0: N, 30: NE, 60: EN, 90: E, 120: ES, 150: SE, 180: S, 210: SW, 240: WS, 270: W, 300: WN, 330: NW, 360: N }
}
