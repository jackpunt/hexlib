import { RC } from "@thegraid/common-lib";

/** Hexagonal canonical directions */
export enum Dir { C, NE, E, SE, SW, W, NW }
export type HexDir = 'NE' | 'EN' | 'E' | 'ES' | 'SE' | 'S' | 'SW' | 'WS' | 'W' | 'WN' | 'NW' | 'N';
export type XYWH = { x: number, y: number, w: number, h: number } // like a Rectangle
export type EwDir = Exclude<HexDir, 'N' | 'S' | 'EN' | 'WN' | 'ES' | 'WS'>;
export type NsDir = Exclude<HexDir, 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'>;

type DCR    = { [key in 'dc' | 'dr']: number }  // Delta for Col & Row
export type TopoEW = { [key in EwDir]: DCR }
export type TopoNS = { [key in NsDir]: DCR }
export type Topo = TopoEW | TopoNS

/** Hex things */
export namespace H {
  export const degToRadians = Math.PI / 180;
  export const sqrt3 = Math.sqrt(3)  // 1.7320508075688772
  export const sqrt3_2 = H.sqrt3 / 2;
  export const infin = String.fromCodePoint(0x221E)
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
  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  export const ewEvenRow: TopoEW = {
    NE: { dc: 0, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 0, dr: 1 },
    SW: { dc: -1, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: -1, dr: -1 }
  }
  export const ewOddRow: TopoEW = {
    NE: { dc: 1, dr: -1 }, E: { dc: 1, dr: 0 }, SE: { dc: 1, dr: 1 },
    SW: { dc: 0, dr: 1 }, W: { dc: -1, dr: 0 }, NW: { dc: 0, dr: -1 }
  }
  export const nsEvenCol: TopoNS = {
    EN: { dc: +1, dr: -1 }, N: { dc: 0, dr: -1 }, ES: { dc: +1, dr: 0 },
    WS: { dc: -1, dr: 0 }, S: { dc: 0, dr: +1 }, WN: { dc: -1, dr: -1 }
  }
  export const nsOddCol: TopoNS = {
    EN: { dc: 1, dr: 0 }, N: { dc: 0, dr: -1 }, ES: { dc: 1, dr: 1 },
    WS: { dc: -1, dr: 1 }, S: { dc: 0, dr: 1 }, WN: { dc: -1, dr: 0 }
  }
  export function nsTopo(rc: RC): TopoNS { return (rc.col % 2 == 0) ? H.nsEvenCol : H.nsOddCol };
  export function ewTopo(rc: RC): TopoEW { return (rc.row % 2 == 0) ? H.ewEvenRow : H.ewOddRow };

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

  export const capColor1:   string = "rgba(150,  0,   0, .8)"  // unplayable: captured last turn
  export const capColor2:   string = "rgba(128,  80, 80, .8)"  // protoMove would capture
  export const sacColor1:   string = "rgba(228,  80,  0, .8)"  // unplayable: sacrifice w/o capture
  export const sacColor2:   string = "rgba(228, 120,  0, .6)"  // isplayable: sacrifice w/ capture
  export const fjColor:     string = "rgba(228, 228,  0, .8)"  // ~unplayable: jeopardy w/o capture
}
