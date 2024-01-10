import { C, Constructor, F, RC, S } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, Point, Text } from "@thegraid/easeljs-module";
import { EwDir, H, HexDir, NsDir } from "./hex-intfs";
import type { Meeple } from "./meeple";
import { HexShape, LegalMark } from "./shapes";
import { PlayerColor, TP } from "./table-params";
import type { MapTile, Tile } from "./tile";
import { NamedObject } from "./game-play";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip '
export type IHex = { Aname: string, row: number, col: number }

export type HexConstructor<T extends Hex> = new (map: HexMap<T>, row: number, col: number, name?: string) => T;
// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

type LINKS<T extends Hex> = { [key in HexDir]?: T }
//type DCR    = { [key in "dc" | "dr"]: number }  // Delta for Col & Row
type DCR = { dc: number, dr: number };
type TopoEW = { [key in EwDir]: DCR }
type TopoNS = { [key in NsDir]: DCR }
type Topo = TopoEW | TopoNS

export type HSC = { hex: Hex, sc: PlayerColor, Aname: string }
export function newHSC(hex: Hex, sc: PlayerColor, Aname = hex.Aname) { return { Aname, hex, sc } }

/** to recognize this class in hexUnderPoint and obtain the associated Hex2. */
class HexCont extends Container {
  constructor(public hex2: Hex2) {
    super()
  }
}

/** Base Hex, has no connection to graphics.
 * topological links to adjacent hex objects.
 */
export class Hex {
  /** return indicated Hex from otherMap */
  static ofMap(ihex: IHex, otherMap: HexMap<Hex>) {
    try {
      return otherMap[ihex.row][ihex.col]
    } catch (err) {
      console.warn(`ofMap failed:`, err, { ihex, otherMap }) // eg: otherMap is different (mh,nh)
      throw err
    }
  }
  static aname(row: number, col: number) {
    return (row >= 0) ? `Hex@[${row},${col}]` : col == -1 ? S_Skip : S_Resign
  }
  constructor(map: HexMap<Hex>, row: number, col: number, name = Hex.aname(row, col)) {
    this.Aname = name
    this.map = map
    this.row = row
    this.col = col
    this.links = {}
  }
  /** (x,y): center of hex; (width,height) of hex; scaled by radius if supplied
   * @param radius [1] radius used in drawPolyStar(radius,,, H.dirRot[tiltDir])
   * @param ewTopo [TP.useEwTopo] true -> suitable for ewTopo (long axis of hex is N/S)
   * @param row [this.row]
   * @param col [this.col]
   * @returns \{ x, y, w, h, dxdc, dydr } of cell at [row, col]
   */
  xywh(radius = TP.hexRad, ewTopo = TP.useEwTopo, row = this.row, col = this.col) {
    if (ewTopo) { // tiltDir = 'NE'; tilt = 30-degrees; nsTOPO
      const h = 2 * radius, w = radius * H.sqrt3;  // h height of hexagon (long-vertical axis)
      const dxdc = w;
      const dydr = 1.5 * radius;
      const x = (col + Math.abs(Math.floor(row) % 2) / 2) * dxdc;
      const y = (row) * dydr;   // dist between rows
      return { x, y, w, h, dxdc, dydr }
    } else { // tiltdir == 'N'; tile = 0-degrees; ewTOPO
      const w = 2 * radius, h = radius * H.sqrt3 // radius * 1.732
      const dxdc = 1.5 * radius;
      const dydr = h;
      const x = (col) * dxdc;
      const y = (row + Math.abs(Math.floor(col) % 2) / 2) * dydr;
      return { x, y, w, h, dxdc, dydr }
    }
  }
  get xywh0() { return this.xywh(); } // so can see xywh from debugger

  readonly Aname: string
  /** reduce to serializable IHex (removes map, inf, links, etc) */
  get iHex(): IHex { return { Aname: this.Aname, row: this.row, col: this.col } }
  protected nf(n: number) { return `${n !== undefined ? (n === Math.floor(n)) ? n : n.toFixed(1) : ''}`; }
  /** [row,col] OR special name */
  get rcs(): string { return (this.row >= 0) ? `[${this.nf(this.row)},${this.nf(this.col)}]` : this.Aname.substring(4)}
  get rowsp() { return (this.nf(this.row ?? -1)).padStart(2) }
  get colsp() { return (this.nf(this.col ?? -1)).padStart(2) } // col== -1 ? S_Skip; -2 ? S_Resign
  /** [row,col] OR special name */
  get rcsp(): string { return (this.row >= 0) ? `[${this.rowsp},${this.colsp}]` : this.Aname.substring(4).padEnd(7)}
  /** compute ONCE, *after* HexMap is populated with all the Hex! */
  get rc_linear(): number { return this._rcLinear || (this._rcLinear = this.map.rcLinear(this.row, this.col))}
  _rcLinear?: number = undefined;
  /** accessor so Hex2 can override-advise */
  _district: number | undefined // district ID
  get district() { return this._district }
  set district(d: number | undefined) {
    this._district = d;
  }
  get isOnMap() { return this.district !== undefined; } // also: (row !== undefined) && (col !== undefined)

  _isLegal: boolean;
  get isLegal() { return this._isLegal; }
  set isLegal(v: boolean) { this._isLegal = v; }

  readonly map: HexMap<Hex>;  // Note: this.parent == this.map.hexCont [cached] TODO: typify ??
  readonly row: number;
  readonly col: number;
  /** Link to neighbor in each H.dirs direction [NE, E, SE, SW, W, NW] */
  readonly links: LINKS<this> = {}

  get linkDirs() { return Object.keys(this.links) as HexDir[];}

  /** colorScheme(playerColor)@rcs */
  toString() {
    return `Hex@${this.rcs}` // hex.toString => Hex@[r,c] | Hex@Skip , Hex@Resign
  }
  /** hex.rcspString => Hex@[ r, c] | 'Hex@Skip   ' , 'Hex@Resign ' */
  rcspString() {
    return `Hex@${this.rcsp}`
  }

  /** convert LINKS object to Array of Hex */
  get linkHexes() {
    return (Object.keys(this.links) as HexDir[]).map((dir: HexDir) => this.links[dir])
  }
  forEachLinkHex(func: (hex: Hex | undefined, dir: HexDir | undefined, hex0: Hex) => unknown, inclCenter = false) {
    if (inclCenter) func(this, undefined, this);
    this.linkDirs.forEach((dir: HexDir) => func(this.links[dir], dir, this));
  }
  /** return HexDir to the first linked hex that satisfies predicate. */
  findLinkHex(pred: (hex: this | undefined, dir: HexDir, hex0: this) => boolean) {
    return this.linkDirs.find((dir: HexDir) => pred(this.links[dir], dir, this));
  }

  /** continue in HexDir until pred is satisfied. */
  findInDir(dir: HexDir, pred: (hex: Hex, dir: HexDir, hex0: Hex) => boolean) {
    let hex: Hex | undefined = this;
    do {
       if (pred(hex, dir, this)) return hex;
    } while(!!(hex = hex.nextHex(dir)));
    return undefined;
  }

  /** array of all hexes in line from dir. */
  hexesInDir(dir: HexDir, rv: this[] = []) {
    let hex: this | undefined = this;
    while (!!(hex = hex.links[dir])) rv.push(hex);
    return rv;
  }

  /** for each Hex in each Dir: func(hex, dir, this) */
  forEachHexDir(func: (hex: this, dir: HexDir, hex0: this) => unknown) {
    this.linkDirs.forEach((dir: HexDir) => this.hexesInDir(dir).filter(hex => !!hex).map(hex => func(hex, dir, this)));
  }

  nextHex(ds: HexDir, ns: number = 1) {
    let hex: Hex | undefined = this;
    while (!!(hex = hex.links[ds]) && --ns > 0) {  }
    return hex;
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: HexDir): Hex {
    let hex: Hex = this, nhex: Hex | undefined;
    while (!!(nhex = hex.links[ds])) { hex = nhex }
    return hex
  }
  /** distance between Hexes: adjacent = 1, based on row, col, sqrt3 */
  radialDist(hex: Hex): number {
    let unit = 1 / H.sqrt3 // so w = delta(col) = 1
    let { x: tx, y: ty } = this.xywh(unit), { x: hx, y: hy } = hex.xywh(unit)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/**
 * Hex1 may be occupied by [tile?: MapTile, meep?: Meeple].
 */
export class Hex1 extends Hex {

  _tile: MapTile | undefined;
  get tile() { return this._tile; }
  set tile(tile: Tile | undefined) { this._tile = tile; } // override in Hex2!
  // Note: set hex.tile mostly invoked from: tile.hex = hex;

  _meep: Meeple | undefined;
  get meep() { return this._meep; }
  set meep(meep: Meeple | undefined) { this._meep = meep }

  get occupied(): [Tile | undefined, Meeple | undefined] | undefined { return (this.tile || this.meep) ? [this.tile, this.meep] : undefined; }

  /** colorScheme(playerColor)@rcs */
  override toString(sc = this.tile?.player?.color || this.meep?.player?.color) {
    return `${sc ?? 'Empty'}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  /** hex.rcspString => COLOR@[ r, c] | 'COLOR@Skip   ' , 'COLOR@Resign ' */
  override rcspString(sc = this.tile?.player?.color || this.meep?.player?.color) {
    return `${sc ?? 'Empty'}@${this.rcsp}`
  }
}

/** One Hex cell in the game, shown as a polyStar Shape */
export class Hex2 extends Hex1 {
  /** Child of mapCont.hexCont: HexCont holds hexShape(color), rcText, distText, capMark */
  readonly cont: HexCont = new HexCont(this); // Hex IS-A Hex0, HAS-A HexCont Container
  readonly radius = TP.hexRad;                // determines width & height
  readonly hexShape = this.makeHexShape();    // shown on this.cont: colored hexagon
  get mapCont() { return this.map.mapCont; }
  get markCont() { return this.mapCont.markCont; }

  get x() { return this.cont.x}
  set x(v: number) { this.cont.x = v}
  get y() { return this.cont.y}
  set y(v: number) { this.cont.y = v}
  get scaleX() { return this.cont.scaleX}
  get scaleY() { return this.cont.scaleY}

  // if override set, then must override get!
  override get district() { return this._district }
  override set district(d: number | undefined) {
    this._district = d    // cannot use super.district = d [causes recursion, IIRC]
    this.distText.text = `${d}`
  }
  distColor: string // district color of hexShape (paintHexShape)
  distText: Text    // shown on this.cont
  rcText: Text      // shown on this.cont

  setUnit(unit: Tile, meep = false) {
    const cont: Container = this.map.mapCont.tileCont, x = this.x, y = this.y;
    let k = true;     // debug double tile
    const this_unit = (meep ? this.meep : this.tile)
    if (unit !== undefined && this_unit !== undefined && !(meep && this_unit.recycleVerb === 'demolished')) {
      if (this === this_unit.source?.hex && this === unit.source?.hex) {
        // Table.dragStart does moveTo(undefined); which triggers source.nextUnit()
        // so if we drop to the startHex, we have a collision.
        // Resolve by putting this_unit (the 'nextUnit') back in the source.
        // (availUnit will recurse to set this.unit = undefined)
        this_unit.source.availUnit(this_unit as Tile); // Meeple extends Tile, but TS seems confused.
      } else if (k) debugger;
    }
    meep ? (super.meep = unit as Meeple) : (super.tile = unit); // set _meep or _tile;
    if (unit !== undefined) {
      unit.x = x; unit.y = y;
      cont.addChild(unit);      // meep will go under tile
      // after source.hex is set, updateCounter:
      if (this === unit.source?.hex) unit.source.updateCounter();
    }
  }

  override get tile() { return super.tile; }
  override set tile(tile: Tile | undefined) { this.setUnit(tile as Tile, false)}

  override get meep() { return super.meep; }
  override set meep(meep: Meeple | undefined) { this.setUnit(meep as Tile, true)}

  /**
   * add Hex2 to map?.mapCont.hexCont; not in map.hexAry!
   * Hex2.cont contains:
   * - polyStar Shape of radius @ (XY=0,0)
   * - stoneIdText (user settable stoneIdText.text)
   * - rcText (r,c)
   * - distText (d)
   */
  constructor(map: HexMap<Hex2>, row: number, col: number, name?: string) {
    super(map, row, col, name);
    this.initCont(row, col);
    map?.mapCont.hexCont.addChild(this.cont);
    this.hexShape.name = this.Aname;
    const nf = (n: number) => `${n !== undefined ? (n === Math.floor(n)) ? n : n.toFixed(1) : ''}`;
    const rc = `${nf(row)},${nf(col)}`, tdy = -25;
    const rct = this.rcText = new Text(rc, F.fontSpec(26), 'white'); // radius/2 ?
    rct.textAlign = 'center'; rct.y = tdy; // based on fontSize? & radius
    this.cont.addChild(rct);

    this.distText = new Text(``, F.fontSpec(20));
    this.distText.textAlign = 'center'; this.distText.y = tdy + 46 // yc + 26+20
    this.cont.addChild(this.distText);
    this.legalMark.setOnHex(this);
    this.showText(true); // & this.cache()
  }

  /** set visibility of rcText & distText */
  showText(vis = this.rcText.visible) {
    this.rcText.visible = this.distText.visible = vis;
    this.cont.updateCache();
  }

  readonly legalMark = new LegalMark();
  override get isLegal() { return this._isLegal; }
  override set isLegal(v: boolean) {
    super.isLegal = v;
    this.legalMark.visible = v;
  }

  private initCont(row: number, col: number) {
    const cont = this.cont;
    const { x, y, w, h } = this.xywh(this.radius, TP.useEwTopo, row, col); // include margin space between hexes
    cont.x = x;
    cont.y = y;
    // initialize cache bounds:
    cont.setBounds(-w / 2, -h / 2, w, h);
    const b = cont.getBounds();
    cont.cache(b.x, b.y, b.width, b.height);
    // cont.rotation = this.map.topoRot;
  }

  makeHexShape(shape: Constructor<HexShape> = HexShape) {
    const hs = new shape(this.radius, this.map.topoRot);
    this.cont.addChildAt(hs, 0);
    this.cont.hitArea = hs;
    hs.paint('grey');
    return hs;
  }

  /** set hexShape using color: draw border and fill
   * @param color
   * @param district if supplied, set this.district
   */
  setHexColor(color: string, district?: number | undefined) {
    if (district !== undefined) this.district = district // hex.setHexColor update district
    this.distColor = color;
    this.hexShape.paint(color);
    this.cont.updateCache();
  }

  // The following were created for the map in hexmarket:
  /** unit distance between Hexes: adjacent = 1; see also: radialDist */
  metricDist(hex: Hex): number {
    let { x: tx, y: ty } = this.xywh(1), { x: hx, y: hy } = hex.xywh(1)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy); // tw == H.sqrt3
  }
  /** location of corner between dir0 and dir1; in parent coordinates.
   * @param dir0 an EwDir
   * @param dir1 an EwDir
   */
  // hexmarket uses to find ewDir corner between two nsDir edges.
  cornerPoint(dir0: HexDir, dir1: HexDir) {
    const d0 = H.ewDirRot[dir0 as EwDir], d1 = H.ewDirRot[dir1 as EwDir];
    let a2 = (d0 + d1) / 2, h = this.radius
    if (Math.abs(d0 - d1) > 180) a2 += 180
    let a = a2 * H.degToRadians
    return new Point(this.x + Math.sin(a) * h, this.y - Math.cos(a) * h)
  }
  /** location of edge point in dir; in parent coordinates. */
  edgePoint(dir: HexDir) {
    let a = H.ewDirRot[dir as EwDir] * H.degToRadians, h = this.radius * H.sqrt3_2
    return new Point(this.x + Math.sin(a) * h, this.y - Math.cos(a) * h)
  }
}

export class RecycleHex extends Hex2 { }

/** for contrast paint it black AND white, leave a hole in the middle unpainted. */
export class HexMark extends HexShape {
  hex: Hex2;
  constructor(public hexMap: HexMap<Hex2>, radius: number, radius0: number = 0) {
    super(radius);
    const mark = this;
    const cm = "rgba(127,127,127,.3)";
    mark.graphics.f(cm).dp(0, 0, this.radius, 6, 0, this.tilt);
    mark.cache(-radius, -radius, 2 * radius, 2 * radius)
    mark.graphics.c().f(C.BLACK).dc(0, 0, radius0)
    mark.updateCache("destination-out")
    mark.setHexBounds();
    mark.mouseEnabled = false;
  }

  override paint(color: string): Graphics {
    this.setHexBounds();
    return this.graphics;   // do not repaint.
  }

  // Fail: markCont to be 'above' tileCont...
  showOn(hex: Hex2) {
    // when mark is NOT showing, this.visible === false && this.hex === undefined.
    // when mark IS showing, this.visible === true && (this.hex instanceof Hex2)
    if (this.hex === hex) return;
    if (this.hex) {
      this.visible = false;
      if (!this.hex.cont.cacheID) debugger;
      this.hex.cont.updateCache();
    }
    this.hex = hex;
    if (this.hex) {
      this.visible = true;
      hex.cont.addChild(this);
      if (!hex.cont.cacheID) debugger;
      hex.cont.updateCache();
    }
    this.hexMap.update();
  }
}

export class MapCont extends Container {
  constructor(public hexMap: HexMap<Hex2>) {
    super()
    this.name = 'mapCont';
  }
  static cNames = ['resaCont', 'hexCont', 'infCont', 'tileCont', 'markCont', 'capCont', 'counterCont', 'eventCont'] as const;
  resaCont: Container    // playerPanels
  hexCont: Container     // hex shapes on bottom stats: addChild(dsText), parent.rotation
  infCont: Container     // infMark below tileCont; Hex2.showInf
  tileCont: Container    // Tiles & Meeples on Hex2/HexMap.
  markCont: Container    // showMark over Hex2; LegalMark
  capCont: Container     // for tile.capMark
  counterCont: Container // counters for AuctionCont
  eventCont: Container   // the eventHex & and whatever Tile is on it...

  /** add all the layers of Containers. */
  addContainers() {
    MapCont.cNames.forEach(cname => {
      const cont = new Container();
      (cont as NamedObject).Aname = cont.name = cname;
      this[cname] = cont;
      this.addChild(cont);
    })
  }
}

export interface HexM<T extends Hex> {
  readonly district: T[][]        // all the Hex in a given district
  readonly mapCont: MapCont
  rcLinear(row: number, col: number): number
  forEachHex<K extends T>(fn: (hex: K) => void): void // stats forEachHex(incCounters(hex))
  update(): void
  showMark(hex: T): void

}
/**
 * Collection of Hex *and* Graphics-Containers for Hex2
 * allStones: HSC[] and districts: Hex[]
 *
 * HexMap[row][col]: Hex or Hex2 elements.
 * If mapCont is set, then populate with Hex2
 *
 * (TP.mh X TP.nh) hexes in districts; allStones: HSC[]
 *
 * With a Mark and off-map: skipHex & resignHex
 *
 */
export class HexMap<T extends Hex> extends Array<Array<T>> implements HexM<T> {
  // A color for each District: 'rgb(198,198,198)'
  static readonly distColor = ['lightgrey',"limegreen","deepskyblue","rgb(255,165,0)","violet","rgb(250,80,80)","yellow"]

  get asHex2Map() { return this as any as HexMap<Hex2> }
  /** Each occupied Hex, with the occupying PlayerColor  */
  readonly district: Array<T[]> = []
  hexAry: T[];  // set by makeAllDistricts()
  readonly mapCont: MapCont = new MapCont(this.asHex2Map);   // if/when using Hex2

  //
  //                         |    //                         |    //                         |
  //         2        .      |  1 //         1        .      | .5 //         2/sqrt3  .      |  1/sqrt3
  //            .            |    //            .            |    //            .            |
  //      .                  |    //      .                  |    //      .                  |
  //  -----------------------+    //  -----------------------+    //  -----------------------+
  //         sqrt3                //         sqrt3/2              //         1
  //

  readonly radius = TP.hexRad
  /** return this.centerHex.xywh() for this.topo */
  get xywh() { return this.centerHex.xywh(); }

  private minCol?: number = undefined               // Array.forEach does not look at negative indices!
  private maxCol?: number = undefined               // used by rcLinear
  private minRow?: number = undefined               // to find centerHex
  private maxRow?: number = undefined               // to find centerHex
  get centerHex() {
    let cr = Math.floor(((this.maxRow ?? 0) + (this.minRow ?? 0)) / 2)
    let cc = Math.floor(((this.minCol ?? 0) + (this.maxCol ?? 0)) / 2);
    return this[cr][cc]; // as Hex2; as T;
  }
  // when called, maxRow, etc are defined...
  get nRowCol() { return [(this.maxRow ?? 0) - (this.minRow ?? 0), (this.maxCol ?? 0) - (this.minCol ?? 0)] }
  getCornerHex(dn: HexDir) {
    return this.centerHex.lastHex(dn)
  }
  rcLinear(row: number, col: number): number { return col + row * (1 + (this.maxCol ?? 0) - (this.minCol ?? 0)) }

  readonly metaMap = Array<Array<T>>()           // hex0 (center Hex) of each MetaHex, has metaLinks to others.

  mark: HexMark | undefined                        // a cached DisplayObject, used by showMark
  Aname: string = '';

  /**
   * HexMap: TP.nRows X TP.nCols hexes.
   *
   * Basic map is non-GUI, addToMapCont uses Hex2 elements to enable GUI interaction.
   * @param addToMapCont use Hex2 for Hex, make Containers: hexCont, infCont, markCont, stoneCont
   * @param hexC Constructor<T> for the Hex elements (typed as HexConstructor<Hex> for Typescript...)
   */
  constructor(radius: number = TP.hexRad, addToMapCont = false,
      public hexC: HexConstructor<Hex> = Hex) //
  {
    super(); // Array<Array<Hex>>()
    this.radius = radius;
    if (addToMapCont) this.addToMapCont(this.hexC as Constructor<T>);
  }

  // the 'tilt' to apply to a HexShape to align with map.topo:
  get topoRot() { return TP.useEwTopo ? 30 : 0 }

  makeMark() {
    const mark = new HexMark(this.asHex2Map, this.radius, this.radius/2.5);
    return mark;
  }

  /** create/attach Graphical components for HexMap */
  addToMapCont(hexC?: Constructor<T>): this {
    if (hexC) this.hexC = hexC;
    this.mark = this.makeMark();
    this.mapCont.addContainers();
    return this
  }

  /** ...stage.update() */
  update() {
    this.mapCont.hexCont.updateCache()  // when toggleText: hexInspector
    this.mapCont.hexCont.parent?.stage.update()
  }

  /** to build this HexMap: create Hex (or Hex2) and link it to neighbors. */
  addHex(row: number, col: number, district: number, hexC = this.hexC as Constructor<T>): T {
    // If we have an on-screen Container, then use Hex2: (addToMapCont *before* makeAllDistricts)
    const hex = new hexC(this, row, col);
    hex.district = district // and set Hex2.districtText
    if (this[row] === undefined) {  // create new row array
      this[row] = new Array<T>()
      if (this.minRow === undefined || row < this.minRow) this.minRow = row
      if (this.maxRow === undefined || row > this.maxRow) this.maxRow = row
    }
    if (this.minCol === undefined || col < this.minCol) this.minCol = col
    if (this.maxCol === undefined || col > this.maxCol) this.maxCol = col
    this[row][col] = hex   // addHex to this Array<Array<Hex>>
    this.link(hex)   // link to existing neighbors
    return hex
  }

  hexUnderObj(dragObj: DisplayObject, legalOnly = true ) {
    const pt = dragObj.parent.localToLocal(dragObj.x, dragObj.y, this.mapCont.markCont);
    return this.hexUnderPoint(pt.x, pt.y, legalOnly);
  }

  /** find first Hex matching the given predicate function */
  findHex<K extends T>(fn: (hex: K) => boolean): K | undefined {
    for (let hexRow of this) {
      if (hexRow === undefined) continue
      const found = hexRow.find((hex: T) => hex && fn(hex as K)) as K;
      if (found !== undefined) return found;
    }
    return undefined;
  }
  /** Array.forEach does not use negative indices: ASSERT [row,col] is non-negative (so 'of' works) */
  forEachHex<K extends T>(fn: (hex: K) => void) {
    // minRow generally [0 or 1] always <= 5, so not worth it
    //for (let ir = this.minRow || 0; ir < this.length; ir++) {
    for (let ir of this) {
      // beginning and end of this AND ir may be undefined
      if (ir !== undefined) for (let hex of ir) { hex !== undefined && fn(hex as K) }
    }
  }
  /** return array of results of mapping fn over each Hex */
  mapEachHex<K extends T, R>(fn: (hex: K) => R): R[] {
    const rv: R[] = [];
    this.forEachHex<K>(hex => rv.push(fn(hex)));
    return rv
  }
  /** find all Hexes matching given predicate */
  filterEachHex<K extends T>(fn: (hex: K) => boolean): K[] {
    const rv: K[] = []
    this.forEachHex<K>(hex => fn(hex) && rv.push(hex))
    return rv
  }

  /** make this.mark visible above the given Hex */
  showMark(hex?: Hex) {
    const mark = this.mark as HexMark;
    if (!hex) {  // || hex.Aname === S_Skip || hex.Aname === S_Resign) {
      mark.visible = false;
    } else if (hex instanceof Hex2) {
      mark.scaleX = hex.scaleX; mark.scaleY = hex.scaleY;
      mark.visible = true;
      // put the mark, at location of hex, on hex.markCont:
      hex.cont.localToLocal(0, 0, hex.markCont, mark);
      hex.markCont.addChild(mark);
      this.update();
    }
  }

  /** neighborhood topology, E-W & N-S orientation; even(n0) & odd(n1) rows: */
  topo: (rc: RC) => (TopoEW | TopoNS) = TP.useEwTopo ? H.ewTopo : H.nsTopo;

  /** see also: Hex.linkDirs */
  get linkDirs(): HexDir[] {
    return TP.useEwTopo ? H.ewDirs : H.nsDirs;
  }

  nextRowCol(rc: RC, dir: HexDir, nt: Topo = this.topo(rc)): RC {
    const ntdir = (nt as TopoNS)[dir as NsDir];
    const { dr, dc } = ntdir; // OR (nt as TopoEW[dir as EwDir]) OR simply: nt[dir]
    let row = rc.row + dr, col = rc.col + dc;
    return { row, col }
  }

  /** link hex to/from each extant neighor */
  link(hex: T, rc: RC = hex, map: T[][] = this, nt: Topo = this.topo(rc), lf: (hex: T) => LINKS<T> = (hex) => hex.links) {
    const topoDirs = Object.keys(nt) as Array<HexDir>
    topoDirs.forEach(dir => {
      const { dr, dc } = (nt as TopoNS)[dir as NsDir]; // OR (nt as TopoEW[dir as EwDir])
      const nr = rc.row + dr;
      const nc = rc.col + dc;
      const nHex = map[nr] && map[nr][nc]
      if (!!nHex) {
        lf(hex)[dir] = nHex
        lf(nHex)[H.dirRev[dir]] = hex
      }
    });
  }
  /**
   * The [Legal] Hex under the given x,y coordinates.
   * If on the line, then the top (last drawn) Hex.
   * @param x in local coordinates of this HexMap.mapCont
   * @param y
   * @param legal - returnn ONLY hex with LegalMark visible & mouseenabled.
   * @returns the Hex2 under mouse or undefined, if not a Hex (background)
   */
  hexUnderPoint(x: number, y: number, legal = true): T | undefined {
    const mark = this.mapCont.markCont.getObjectUnderPoint(x, y, 1);
    // Note: in theory, mark could be on a Hex2 that is NOT in hexCont!
    if (mark instanceof LegalMark) return mark.hex2 as any as T;
    if (legal) return undefined;
    const hexc = this.mapCont.hexCont.getObjectUnderPoint(x, y, 1); // 0=all, 1=mouse-enabled (Hex, not Stone)
    if (hexc instanceof HexCont) return hexc.hex2 as any as T;
    return undefined;
  }

  // not sure if these will be useful:
  private _nh: number;
  private _mh: number;
  get nh() { return this._nh }
  get mh() { return this._mh }

  /**
   *
   * @param nh number of hexes on on edge of metaHex
   * @param mh order of metaHexes (greater than 0);
   */
  makeAllDistricts(nh = TP.nHexes, mh = TP.mHexes) {
    this._nh = nh;
    this._mh = mh;
    const hexAry = this.makeDistrict(nh, 0, mh, 0);    // nh hexes on outer ring; single meta-hex
    this.mapCont.hexCont && this.centerOnContainer();
    this.hexAry = hexAry;
    return hexAry;
  }
  centerOnContainer() {
    let mapCont = this.mapCont;
    let hexRect = mapCont.hexCont.getBounds(); // based on aggregate of Hex2.cont.cache(bounds);
    const { x, y, width, height } = hexRect;
    let x0 = x + width / 2, y0 = y + height / 2;
    MapCont.cNames.forEach(cname => {
      const cont = mapCont[cname];
      cont.x = -x0; cont.y = -y0
    })
    // mapCont.x = x0; mapCont.y = y0;
  }

  pickColor(hexAry: Hex2[]): string {
    let hex = hexAry[0]
    let adjColor: string[] = [HexMap.distColor[0]] // colors not to use
    this.linkDirs.forEach(hd => {
      let nhex: Hex2 = hex;
      while (!!(nhex = nhex.nextHex(hd) as Hex2)) {
        if (nhex.district != hex.district) { adjColor.push(nhex.distColor); return }
      }
    })
    return HexMap.distColor.find(ci => !adjColor.includes(ci)) ?? 'white'; // or undefined or ...
  }
  /**
   * rings of Hex with EwTopo; HexShape(tilt = 'NE')
   * @param nh order of inner-hex: number hexes on side of meta-hex
   * @param district identifying number of this district
   * @param mr make new district on meta-row
   * @param mc make new district on meta-col
   */
  makeDistrict(nh: number, district: number, mr: number, mc: number): T[] {
    const mcp = Math.abs(mc % 2), mrp = Math.abs(mr % 2), dia = 2 * nh - 1;
    // irow-icol define topology of MetaHex composed of HexDistrict
    // TODO: generalize using this.topo to compute offsets!
    const irow = (mr: number, mc: number) => {
      let ir = mr * dia - nh * (mcp + 1) + 1
      ir -= Math.floor((mc) / 2)              // - half a row for each metaCol
      return ir
    }
    const icol = (mr: number, mc: number, row: number) => {
      let np = Math.abs(nh % 2), rp = Math.abs(row % 2)
      let ic = Math.floor(mc * ((nh * 3 - 1) / 2))
      ic += (nh - 1)                        // from left edge to center
      ic -= Math.floor((mc + (2 - np)) / 4) // 4-metaCol means 2-rows, mean 1-col
      ic += Math.floor((mr - rp) / 2)       // 2-metaRow means +1 col
      return ic
    }
    const row0 = irow(mr, mc), col0 = icol(mr, mc, row0);
    const hexAry: T[] & { Mr?: number, Mc?: number } = Array<T>();
    hexAry['Mr'] = mr; hexAry['Mc'] = mc;
    const hex = this.addHex(row0, col0, district);
    hexAry.push(hex) // The *center* hex
    let rc: RC = { row: row0, col: col0 } // == {hex.row, hex.col}
    //console.groupCollapsed(`makelDistrict [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}:${district}-${dcolor}`)
    //console.log(`.makeDistrict: [mr: ${mr}, mc: ${mc}] hex0= ${hex.Aname}`, hex)
    const dirs = this.linkDirs;     // HexDirs of the extant Topo.
    const startDir = dirs.includes('W') ? 'W' : 'WS'; // 'W' or 'WN'
    for (let ring = 1; ring < nh; ring++) {
      rc = this.nextRowCol(rc, startDir); // step West to start a ring
      // place 'ring' hexes along each axis-line:
      dirs.forEach(dir => rc = this.newHexesOnLine(ring, rc, dir, district, hexAry))
    }
    //console.groupEnd()
    this.setDistrictColor(hexAry, district);
    return hexAry
  }
  setDistrictColor(hexAry: T[], district = 0) {
  this.district[district] = hexAry;
    if (hexAry[0] instanceof Hex2) {
      const hex2Ary = hexAry as any as Hex2[];
      const dcolor = district == 0 ? HexMap.distColor[0] : this.pickColor(hex2Ary)
      hex2Ary.forEach(hex => hex.setHexColor(dcolor)) // makeDistrict: dcolor=lightgrey
    }
  }

  /**
   *
   * @param n number of Hex to create
   * @param hex start with a Hex to the West of this Hex
   * @param dir after first Hex move this Dir for each other hex
   * @param district
   * @param hexAry push created Hex(s) on this array
   * @returns RC of next Hex to create (==? RC of original hex)
   */
  newHexesOnLine(n: number, rc: RC, dir: HexDir, district: number, hexAry: Hex[]): RC {
    let hex: Hex
    for (let i = 0; i < n; i++) {
      hexAry.push(hex = this.addHex(rc.row, rc.col, district))
      rc = this.nextRowCol(hex, dir)
    }
    return rc
  }

}

/** Marker class for HexMap used by GamePlayD */
export class HexMapD extends HexMap<Hex> {

}

