const playerColorsLib = ['b', 'w'] as const // Player Colors!
export const playerColors = playerColorsLib.concat();
/** Default type for PlayerColor. Maybe don't import, define your own locally.
 *
 * @example
 * import { playerColors, PlayerColor as PCLib } from "@thegraid/hexlib"
 * playerColors.push('c')
 * type PlayerColor = PCLib | 'c' // Player Colors + Criminal!
 */
export type PlayerColor = typeof playerColorsLib[number];
// Locally (for example, hextowns):

export const playerColor0 = playerColors[0]
export const playerColor1 = playerColors[1]
// export const playerColor2 = playerColorsC[2]
export function otherColor(color: PlayerColor): PlayerColor { return color === playerColor0 ? playerColor1 : playerColor0 }

export type PlayerColorRecord<T> = Record<PlayerColor, T>
/** @return \{ pc0: arg0 as T, pc1: arg1 as T, ...}: PlayerColorRecord\<T> */
export function playerColorRecord<T>(...args: T[]) {
  const rv = {} as PlayerColorRecord<T>
  playerColors.forEach((key, ndx) => rv[key] = (args[ndx]))
  return rv;
}
export function playerColorRecordF<T>(f: (sc: PlayerColor) => T) {
  return playerColorRecord(...playerColors.map(pc => f(pc)))
}

/** 'Object' OR: import { Params } from "@angular/router"; */
declare type Params = Record<string, any>;

export class TP {
  /** number of hexes in a metaHex of order n; number of districts(n=TP.mHexes)
   * @return an odd number: 1, 7, 19, 37, 61, 97, ... */
  static ftHexes(n: number): number { return (n <= 1) ? n : 6 * (n-1) + TP.ftHexes(n - 1) }

  /** compose a URL of form wss://host.domain:port/path.
   *
   * @param scheme ['wss']
   * @param host [TP.ghost]
   * @param domain [TP.gdomain]
   * @param port [TP.gport]
   * @param path [''] supply your own '/' and any query part
   */
  static buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
    return `${scheme}://${host}.${domain}:${port}${path}`
  }
  /** return OwnPropertyNames that are NOT also in Object (ie: length, name, prototype) */
  static staticFields(over = (TP as Params)) {
    const basic_props = Object.getOwnPropertyNames(class { });// [length, prototype, name]
    const static_props = Object.getOwnPropertyNames(over).filter(k => !basic_props.includes(k));
    return static_props;
  }
  /**
   * If local field is present in tplib, set local value in tplib, and delete it from local.
   *
   * So hexlib methods will see and use the value as TP.field
   *
   * If tplib value is a number and local value is a string, try coerce using parseInt()
   *
   * @param local source of the new values (typically TP-local or {...})
   * @param force [false] if true, do not attempt to coerce value with parseInt().
   * @param tplib [TP-lib] the target in which to set the values from local.
   * @return local with tplib values removed
   */
  static setParams(local: Params = {}, force = false, tplib = (TP as Params)) {
    /** do not muck with standard basic properties of all/empty classes */
    const static_props = TP.staticFields(tplib);
    for (let [key, value] of Object.entries(local)) {
      if (!static_props.includes(key)) continue; // if no collision leave in TP-local
      if (!force && (typeof value === 'string' && typeof tplib[key] === 'number')) {
        value = Number.parseInt(value); // minimal effort to align types.
      }
      tplib[key] = value; // set a static value in base; DANGER! not typesafe!
      delete local[key];  // so future local[key] = value will tplib[key] = value;
    }
    return local
  }

  /** the current map from PlayerColor to colorn */
  static colorScheme = playerColorRecordF(n => n as string);
  static useEwTopo = true;
  static cacheTiles = 2;
  static snapToPixel = true;
  static textLogLines = 13;
  static log = 0; // log level; see also: GamePlay.ll(n)

  static numPlayers = 2;
  static maxPlayers = 6;
  static mapRows:number = 7;   /// standard: 6 (AnkhMap)
  static mapCols:number = 12;  /// standard: 15
  static nHexes = 6;
  static mHexes = 1;

  static playerRGBcolors: string[] = []; // filled by Player.initialize()
  static autoEvent: number | true = 2000;

  // timeout: see also 'autoEvent'
  static moveDwell:  number = 600
  static flashDwell: number = 500
  static flipDwell:  number = 200 // chooseStartPlayer dwell between each card flip

  static bgColor = 'rgba(200, 120, 40, 0.8)'; // C.nameToRgbaString('Sienna', .8); // 'saddlebrown'
  static bgRect = { x: -2400, y: -1000, w: 8000, h: 5000 }

  static ghost: string = 'game7'   // game-setup.network()
  static gdomain: string = 'thegraid.com'
  static gport: number = 8447
  static networkUrl: string = TP.buildURL();  // URL to cgserver (wspbserver)
  static networkGroup: string = 'title:game1';

  static vpToWin: number = 20;
  static roboDrawTile: number = 1.0 // Bias toward draw Tile

  static trapNotDropTarget: boolean = true; // warn & alert when D&D to non-DropTarget

  static hexRad = 60;
  static meepleRad = TP.hexRad * .75;
  static meepleY0 = TP.hexRad * .25;

  // for AI control:
  static maxPlys = 3;
  static maxBreadth = 3;
}
