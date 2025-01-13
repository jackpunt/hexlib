import { RC } from "@thegraid/common-lib";
// export { XYWH } from "@thegraid/common-lib";

/** Hexagonal canonical directions */
export type HexDir = 'NE' | 'EN' | 'E' | 'ES' | 'SE' | 'S' | 'SW' | 'WS' | 'W' | 'WN' | 'NW' | 'N';
export type EwDir = Exclude<HexDir, 'N' | 'S' | 'EN' | 'WN' | 'ES' | 'WS'>;
export type NsDir = Exclude<HexDir, 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'>;
export type Or8Dir = Exclude<HexDir, 'EN' | 'WN' | 'ES' | 'WS'>; // 8 compass dirs
export type Or4Dir = Exclude<Or8Dir, 'NE' | 'NW' | 'SE' | 'SW'>; // 4 compass dirs

type DCR    = { [key in 'dc' | 'dr']: number }  // Delta for Col & Row
type TopoDCR = Record<HexDir, DCR>
export type TopoEW = Record<EwDir, DCR>
export type TopoNS = Record<NsDir, DCR>
export type TopoOr8 = Record<Or8Dir, DCR>
export type TopoOr4 = Record<Or4Dir, DCR>
export type Topo = TopoEW | TopoNS | TopoOr8 | TopoOr4;
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

export abstract class TopoC<TD extends Partial<TopoDCR>> {
  /** a TopoMetric for graphical layout */
  xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    return { x: row * rad, y: col * rad, w: rad, h: rad, dxdc: rad, dydr: rad }
  }

  _linkDirs = ['N', 'E', 'S', 'W'] as HexDir[];
  /** identify directions to adjancent cells; valid keys in topoDCR() */
  get linkDirs() { return this._linkDirs };

  /**
   * Used by nextRowCol to locate an adjacent cell.
   * @param rc For Hex topology, the adjacency depends on the particular (row, col)
   * @returns a TopoDCR
   */
  topoDCR(rc: RC): TD {
    return { N: { dr: -1, dc: 0 }, E: { dr: 0, dc: 1 }, S: { dr: 1, dc: 0 }, W: { dr: 0, dc: -1 } } as TD;
  }
  nextRowCol(rc: RC, dir: HexDir) {
    const dcr = this.topoDCR(rc)[dir] as DCR;
    return { row: rc.row + dcr.dr, col: rc.col + dcr.dc };
  }
}
export class TopoEWC extends TopoC<TopoEW> {
  override _linkDirs: HexDir[] = H.ewDirs;
  // Hex rows with alternating alignment:
  ewEvenRow: TopoEW = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }
  }
  ewOddRow: TopoEW = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: { dc: 0, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: 0, dr: -1 }
  }
  override topoDCR(rc: RC): TopoEW { return (rc.row % 2 == 0) ? this.ewEvenRow : this.ewOddRow };

  override xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const h = 2 * rad, w = H.sqrt3 * rad, dydr = 1.5 * rad, dxdc = H.sqrt3 * rad;
    const x = (col + Math.abs(Math.floor(row) % 2) / 2) * dxdc;
    const y = (row) * dydr;   // dist between rows
    return { x, y, w, h, dxdc, dydr }
  };
}
export class TopoNSC extends TopoC<TopoNS> {
  override _linkDirs: HexDir[] = H.nsDirs;
  // Hex columns with alternating alignment:
  nsEvenCol: TopoNS = {
    EN: { dc: +1, dr: -1 }, N: { dc: 0, dr: -1 }, ES: { dc: +1, dr: 0 },
    WS: { dc: -1, dr: 0 }, S: { dc: 0, dr: +1 }, WN: { dc: -1, dr: -1 }
  }
  nsOddCol: TopoNS = {
    EN: { dc: 1, dr: 0 }, N: { dc: 0, dr: -1 }, ES: { dc: 1, dr: 1 },
    WS: { dc: -1, dr: 1 }, S: { dc: 0, dr: 1 }, WN: { dc: -1, dr: 0 }
  }
  override topoDCR(rc: RC) { return (rc.col % 2 == 0) ? this.nsEvenCol : this.nsOddCol };

  override xywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const h = 2 * rad, w = H.sqrt3 * rad, dydr = 1.5 * rad, dxdc = H.sqrt3 * rad;
    const x = (col + Math.abs(Math.floor(row) % 2) / 2) * dxdc;
    const y = (row) * dydr;   // dist between rows
    return { x, y, w, h, dxdc, dydr }
  };
}

/** Hex things */
export namespace H {
  export const degToRadians = Math.PI / 180;
  export const sqrt3 = Math.sqrt(3)  // 1.7320508075688772
  export const sqrt3_2 = H.sqrt3 / 2;

  export function NSxywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const w = 2 * rad, h = H.sqrt3 * rad, dxdc = 1.5 * rad, dydr = H.sqrt3 * rad;
    const x = (col) * dxdc;
    const y = (row + Math.abs(Math.floor(col) % 2) / 2) * dydr;
    return { x, y, w, h, dxdc, dydr }
  };
  export function EWxywh(rad = 1, row = 0, col = 0): TopoXYWH {
    const h = 2 * rad, w = H.sqrt3 * rad, dydr = 1.5 * rad, dxdc = H.sqrt3 * rad;
    const x = (col + Math.abs(Math.floor(row) % 2) / 2) * dxdc;
    const y = (row) * dydr;   // dist between rows
    return { x, y, w, h, dxdc, dydr }
  };

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

  /** includes E & W, suitable for ewTopo */
  export const ewDirs: EwDir[] = [NE, E, SE, SW, W, NW]; // directions in TopoEW: EwDir
  /** includes N & S, suitable for nsTopo */
  export const nsDirs: NsDir[] = [N, EN, ES, S, WS, WN]; // directions in TopoNS: NsDir
  /** all hexDirs */
  export const hexDirs: HexDir[] = (H.ewDirs as HexDir[]).concat(H.nsDirs); // standard direction signifiers () ClockWise

  // angles for ewTopo!
  export const ewDirRot: {[key in EwDir] : number} = { NE: 30, E: 90, SE: 150, SW: 210, W: 270, NW: 330 }
  // angles for nwTopo!
  export const nsDirRot: {[key in NsDir] : number} = { N: 0, EN: 60, ES: 120, S: 180, WS: 240, WN: 300 }
  export const dirRot: { [key in HexDir]: number } = { ...H.ewDirRot, ...H.nsDirRot }

  export const dirRev: {[key in HexDir] : HexDir} = { N: S, S: N, E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE, ES: WN, EN: WS, WS: EN, WN: ES }
  export const dirRevEW: {[key in EwDir] : EwDir} = { E: W, W: E, NE: SW, SE: NW, SW: NE, NW: SE }
  export const dirRevNS: {[key in NsDir] : NsDir} = { N: S, S: N, EN: WS, ES: WN, WS: EN, WN: ES }
  export const rotDir: { [key: number]: HexDir } = { 0: 'N', 30: 'NE', 60: 'EN', 90: 'E', 120: 'ES', 150: 'SE', 180: 'S', 210: 'SW', 240: 'WS', 270: 'W', 300: 'WN', 330: 'NW', 360: 'N' }
}
