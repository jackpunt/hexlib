export const playerColors = ['b', 'w'] as const // Player Colors!
export const playerColorsC = ['b', 'w', 'c'] as const // Player Colors + Criminal!
export const playerColor0 = playerColors[0]
export const playerColor1 = playerColors[1]
export const playerColor2 = playerColorsC[2]
//type playerColorTuple = typeof playerColors
export type PlayerColor = typeof playerColorsC[number];
export function otherColor(color: PlayerColor): PlayerColor { return color === playerColor0 ? playerColor1 : playerColor0 }

/** PlayerColerRecord<T> maps from PlayerColor -> T */
export type PlayerColorRecord<T> = Record<PlayerColor, T>
export function playerColorRecord<T>(b: T, w: T, c: T): PlayerColorRecord<T> { return { b, w, c } };
export function playerColorRecordF<T>(f: (sc: PlayerColor) => T) { return playerColorRecord(f(playerColor0), f(playerColor1), f(playerColor2)) }

/** OR: import { Params } from "@angular/router"; */
declare type Params = Record<string, any>;

export class TP {
  static buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
    return `${scheme}://${host}.${domain}:${port}${path}`
  }
  static staticFields(over = (TP as Params)) {
    const basic_props = Object.getOwnPropertyNames(class { });// [length, prototype, name]
    const static_props = Object.getOwnPropertyNames(over).filter(k => !basic_props.includes(k));
    return static_props;
  }
  /** called by framework before TP is used; put your overrides here.
   * @param qParams
   * @param force true to apply exact value, if new key or new type.
   */
  static setParams(qParams: Params = {}, force = false, over = (TP as Params)) {
    /** do not muck with standard basic properties of all/empty classes */
    const static_props = TP.staticFields(over);
    for (let [key, value] of Object.entries(qParams)) {
      if (force || static_props.includes(key)) {
        if (!force && (typeof value === 'string' && typeof over[key] === 'number')) {
          value = Number.parseInt(value); // minimal effort to align types.
        }
        (TP as Params)[key] = value; // set a static value in base; DANGER! not typesafe!
      }
    }
  }

  /**
   * After pushing all values from local subclass of TP into base TP,
   * delete them, so there is only the one copy in original base class: TP (from hexlib)
   * Local references should still get/set values in the base object.
   *
   * This way, tsc still sees local TP for type safety,
   * but there is a single object for updates using Chooser.
   *
   * @param local the locally created subclass of TP with static fields
   */
  static eraseLocal(local: Params) {
    const static_props = TP.staticFields(local);
    static_props.forEach(key => delete local[key])
    const new_props = TP.staticFields(local);
    // assert new_props is empty!
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

  static bgColor: string = 'rgba(155, 100, 150, .3)';
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
  static meepleRad = 45;
  static meepleY0 = 15;

  // for AI control:
  static maxPlys = 3;
  static maxBreadth = 3;
}
