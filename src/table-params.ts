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

export function buildURL(scheme = 'wss', host = TP.ghost, domain = TP.gdomain, port = TP.gport, path = ''): string {
  return `${scheme}://${host}.${domain}:${port}${path}`
}
export class TP {
  static colorScheme = playerColorRecordF(n => n);
  static useEwTopo = true;  // spiral districts require useEwTopo === true
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
  static networkUrl: string = 'wss://game7.thegraid.com:8447';  // URL to cgserver (wspbserver)
  static networkGroup: string = 'citymap:game1';

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
