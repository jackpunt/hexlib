import { C, Constructor, F, RC, XY, XYWH } from '@thegraid/common-lib';
import { CenterText, CircleShape, NamedContainer, type Paintable } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Point, Text } from "@thegraid/easeljs-module";
import { EwDir, H, HexDir, NsDir } from "./hex-intfs";
import { HexShape } from "./shapes";
import { TP } from "./table-params";
import type { MapTile, Tile } from "./tile";

export const S_Resign = 'Hex@Resign'
export const S_Skip = 'Hex@skip '
/** serializable Hex ID; identify a Hex by {row, col}, used in Move? see also: RC */
export type IdHex = { Aname: string, row: number, col: number }

export type HexConstructor<T extends Hex> = new (map: HexM<T>, row: number, col: number, name?: string) => T;
// Note: graphics.drawPolyStar(x,y,radius, sides, pointSize, angle) will do a regular polygon

/** Record<HexDir,T>; if HexDir is mentioned then value is defined */
export type LINKS<H extends Hex> = Partial<Record<HexDir, H>>; // { [key in HexDir]?: H }
//type DCR    = { [key in 'dc' | 'dr']: number }  // Delta for Col & Row
type DCR = { dc: number, dr: number };
type TopoEW = { [key in EwDir]: DCR }
type TopoNS = { [key in NsDir]: DCR }
type Topo = TopoEW | TopoNS

/** to recognize this class in hexUnderPoint and obtain the associated hex2: IHex2 */
export class HexCont extends NamedContainer {
  constructor(public hex2: IHex2) {
    super()
  }
}
function nf(n: number) { return `${n !== undefined ? (n === Math.floor(n)) ? n : n.toFixed(1) : ''}`; }

export class LegalMark extends Container {
  hex2: IHex2;
  doGraphics() {
    this.removeAllChildren();
    this.addChild(new CircleShape(C.legalGreen, this.hex2.radius / 2, '')); // @(0,0)
  }
  /** position circular LegalMark over hex; hitArea, mouseEnabled */
  setOnHex(hex: IHex2) {
    this.hex2 = hex;
    this.doGraphics();
    const parent = hex.mapCont.markCont;
    hex.cont.parent.localToLocal(hex.x, hex.y, parent, this);
    this.hitArea = hex.hexShape; // legal mark is used for hexUnderObject, so need to cover whole hex.
    this.mouseEnabled = true;
    this.visible = false;
    parent.addChild(this);
    return this;
  }
}

/**
 * Minimal Hex, with topological links to adjacent hex objects;
 * No tile/meep, no connection to graphics.
 */
export class Hex {
  /** Identify Hex instance derived from Hex2Mixin; and so implements IHex2. */
  static isIHex2(hex: Hex): hex is IHex2 { return (hex as any)?.implementsIHex2 as boolean; }

  /** return indicated Hex from otherMap */
  static ofMap(ihex: IdHex, otherMap: HexMap<Hex>) {
    try {
      return otherMap[ihex.row][ihex.col]
    } catch (err) {
      console.warn(`ofMap failed:`, err, { ihex, otherMap }) // eg: otherMap is different (mh,nh)
      throw err
    }
  }

  /**
   * Location/size of Hex@[row, col]
   * @param radius [1] 'size' of hex; radius used in drawPolyStar(radius,,, H.dirRot[tiltDir])
   * @param ewTopo [true] true -> suitable for ewTopo (has E & W [vertical] sides)
   * @param row [0]
   * @param col [0]
   * @returns \{ x, y, w, h, dxdc, dydr } of cell at [row, col]
   */
  static xywh(radius = TP.hexRad, ewTopo = TP.useEwTopo, row = 0, col = 0) {
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

  static aname(row: number, col: number) {
    return (row >= 0) ? `Hex@[${row},${col}]` : col == -1 ? S_Skip : S_Resign
  }
  /**
   *
   * @param map Hex is element of given HexM @ [row, col]
   * @param row
   * @param col
   * @param Aname
   */
  constructor(map: HexM<Hex>, row: number, col: number, Aname = Hex.aname(row, col)) {
    this.Aname = Aname
    this.map = map
    this.row = row
    this.col = col
    this.links = {}
  }
  /** (x,y): center of hex; (width,height) of hex; scaled by radius if supplied
   * @param radius [TP.hexRad] 'size' of hex; radius used in drawPolyStar(radius,,, H.dirRot[tiltDir])
   * @param ewTopo [TP.useEwTopo] true -> suitable for ewTopo (has E & W [vertical] sides)
   * @param row [this.row]
   * @param col [this.col]
   * @returns \{ x, y, w, h, dxdc, dydr } of cell at [row, col]
   */
  xywh(radius = TP.hexRad, ewTopo = TP.useEwTopo, row = this.row, col = this.col) {
    return Hex.xywh(radius, ewTopo, row, col);
  }
  get xywh0() { return this.xywh(TP.hexRad); } // so can see xywh from debugger

  // _Aname: string;
  // get Aname() { return this._Aname; }
  // protected set Aname (name: string) { this._Aname = name; }
  Aname: string;

  /** reduce to serializable IHex (removes map, inf, links, etc) */
  get iHex(): IdHex { return { Aname: this.Aname, row: this.row, col: this.col } }
  /** [row,col] OR special name */
  get rcs(): string { return (this.row >= 0) ? `[${nf(this.row)},${nf(this.col)}]` : this.Aname.substring(4) }
  get rowsp() { return (nf(this.row ?? -1)).padStart(2) }
  get colsp() { return (nf(this.col ?? -1)).padStart(2) } // col== -1 ? S_Skip; -2 ? S_Resign
  /** [row,col] OR special name */
  get rcsp(): string { return (this.row >= 0) ? `[${this.rowsp},${this.colsp}]` : this.Aname.substring(4).padEnd(7) }
  /** compute ONCE, *after* HexMap is populated with all the Hex! */
  get rc_linear(): number { return this._rcLinear || (this._rcLinear = this.map.rcLinear(this.row, this.col)) }
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

  /** hexlib.Hex uses only the HexM slice of a HexMap. */
  readonly map: HexM<Hex>;  // Note: this.parent == this.map.hexCont [cached] TODO: typify ??
  readonly row: number;
  readonly col: number;
  /** Link to neighbor in each H.dirs direction [NE, E, SE, SW, W, NW] */
  readonly links: LINKS<this> = {}
  metaLinks: LINKS<this>;     // defined only for the center Hex of a metaHex

  get linkDirs() { return Object.keys(this.links) as HexDir[]; }

  /** Hex(playerColor)@rcs */
  toString() {
    return `Hex@${this.rcs}` // hex.toString => Hex@[r,c] | Hex@Skip , Hex@Resign
  }
  /** hex.rcspString => Hex@[ r, c] | 'Hex@Skip   ' , 'Hex@Resign ' */
  rcspString() {
    return `Hex@${this.rcsp}`
  }

  /** convert LINKS object to Array of Hex */
  get linkHexes(): this[] {
    return (Object.keys(this.links) as HexDir[]).map((dir: HexDir) => this.links[dir] as this)
  }
  forEachLinkHex(func: (hex: this | undefined, dir: HexDir | undefined, hex0: this) => unknown, inclCenter = false) {
    if (inclCenter) func(this, undefined, this);
    this.linkDirs.forEach((dir: HexDir) => func(this.links[dir], dir, this));
  }
  /** return HexDir to the first linked hex that satisfies predicate. */
  findLinkHex(pred: (hex: this | undefined, dir: HexDir, hex0: this) => boolean) {
    return this.linkDirs.find((dir: HexDir) => pred(this.links[dir], dir, this));
  }

  /** continue in HexDir until pred is satisfied. */
  findInDir(dir: HexDir, pred: (hex: this, dir: HexDir, hex0: this) => boolean): this | undefined {
    let hex: this | undefined = this;
    do {
      if (pred(hex, dir, this)) return hex;
    } while (!!(hex = hex.nextHex(dir)));
    return undefined;
  }

  /** array of all hexes in line from dir. */
  hexesInDir(dir: HexDir, rv: this[] = []): this[] {
    let hex: this | undefined = this;
    while (!!(hex = hex.links[dir])) rv.push(hex);
    return rv;
  }

  /** for each Hex in each Dir: func(hex, dir, this) */
  forEachHexDir(func: (hex: this, dir: HexDir, hex0: this) => unknown) {
    this.linkDirs.forEach((dir: HexDir) => this.hexesInDir(dir).filter(hex => !!hex).map(hex => func(hex, dir, this)));
  }

  /** from this Hex, follow links[ds], ns times (or until !links[ds]). */
  nextHex(dir: HexDir, ns: number = 1): this | undefined {
    let hex: this | undefined = this;
    while (ns-- > 0 && !!(hex = hex.links[dir])) { }
    return hex;
  }
  /** return last Hex on axis in given direction */
  lastHex(ds: HexDir): this {
    let hex = this, nhex: this | undefined;
    while (!!(nhex = hex.links[ds] as this | undefined)) { hex = nhex }
    return hex
  }
  /** distance between Hexes: adjacent = 1, based on row, col, unit = 1 / H.sqrt3 */
  radialDist(hex: Hex): number {
    let unit = 1 / H.sqrt3 // so w = delta(col) = 1
    let { x: tx, y: ty } = this.xywh(unit), { x: hx, y: hy } = hex.xywh(unit)
    let dx = tx - hx, dy = ty - hy
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/**
 * Hex1 may be occupied by [tile?: MapTile, meep?: Tile.isMeep].
 */
export class Hex1 extends Hex {

  _tile: MapTile | undefined;
  get tile() { return this._tile; }
  set tile(tile: Tile | undefined) { this.setUnit(tile, false) }
  // Note: set hex.tile mostly invoked from: tile.hex = hex;

  _meep: Tile | undefined;
  get meep() { return this._meep; }
  set meep(meep: Tile | undefined) { this.setUnit(meep, true) }

  /** @return [this.tile, this.meep] | undefined */
  get occupied(): [Tile | undefined, Tile | undefined] | undefined { return (this.tile || this.meep) ? [this.tile, this.meep] : undefined; }

  /** PLYRID@[r,c]; PLYRID = this.(tile??meep).player.plyrId ?? Empty */
  override toString(color = (this.tile ?? this.meep)?.player?.plyrId ?? 'Empty') {
    return `${color}@${this.rcs}` // hex.toString => COLOR@[r,c] | COLOR@Skip , COLOR@Resign
  }
  /** PLYRID@[ r, c] or PLYRID@Name */
  override rcspString(color = (this.tile ?? this.meep)?.player?.plyrId ?? 'Empty') {
    return `${color}@${this.rcsp}`
  }

  // 13-dec-2024: decided this belongs in Hex1, where tile/meep:
  setUnit(unit?: Tile, isMeep = unit?.isMeep) {
    const this_unit = (isMeep ? this.meep : this.tile)
    if (unit !== undefined && this_unit !== undefined && unit !== this_unit) {
      this.unitCollision(this_unit, unit, isMeep);
    }
    isMeep ? (this._meep = unit) : (this._tile = unit); // set _meep or _tile;
    // too much effort to do this in subclass Hex2:
    if (unit !== undefined && Hex.isIHex2(this)) {
      unit.x = this.x; unit.y = this.y;
      this.mapCont.tileCont?.addChild(unit);      // meep will go under tile [wut?]
    }
  }

  // from 13-dec-2024: projects should override as necessary;
  // should be handled by isLegal() and override dropFunc()/placeTile()/moveTo()
  unitCollision(this_unit: Tile, unit: Tile, isMeep = false) {
    if (isMeep && this_unit.recycleVerb === 'demolished') return; // ok to collide?
    if (this === this_unit.source?.hex && this === unit.source?.hex) {
      // Legacy! 13-dec-2024: fixed by removing moveTo() -> source.nextUnit()
      // Table.dragStart does moveTo(undefined); which triggers source.nextUnit()
      // so if we drop to the startHex, we have a collision.
      // Resolve by putting this_unit (the 'nextUnit') back in the source.
      // (availUnit will recurse to set this.unit = undefined)
      this_unit.source.availUnit(this_unit);
    } else if (Hex1.debugCollision) debugger;
  }
  static debugCollision = true;
}

/**
 * Mixin hexlib/Hex2Impl with (LocalHex extends Hex1)
 *
 * class LocalHex1 extends Hex1Lib { ... }
 *
 * class LibHex2extendsLocalHex1 extends Hex2Mixin(LocalHex1) { }
 *
 * class LocalHex2 extends LibHex2extendsLocalHex1 { ... }
 *
 * https://www.typescriptlang.org/docs/handbook/mixins.html
 *
 *
 * Note: In the compiled hex.js and its hex.d.ts,
 * the type 'this' in the Hex2Mixin versions of Hex methods
 * is converted to type 'any'.
 * (because Hex2Mixin and Hex2_base come from new(...) but are not a class,
 * therefore have no instance or this/type)
 *
 * To get properly typed versions in your derived class extends Hex2Mixin,
 * include the following overrides:
 *
 * @example
  class MyHex2Base extends Hex2Mixin(MyHex1) {}
  class MyHex2 extends MyHex2Base { ... } // including overrides below:

  override forEachLinkHex(func: (hex: this | undefined, dir: HexDir | undefined, hex0: this) => unknown, inclCenter = false) {
    super.forEachLinkHex(func)
  }
  override findLinkHex(pred: (hex: this | undefined, dir: HexDir, hex0: this) => boolean) {
    return super.findLinkHex(pred)
  }
  override findInDir(dir: HexDir, pred: (hex: this, dir: HexDir, hex0: this) => boolean): this | undefined {
    return super.findInDir(dir, pred)
  }
  override hexesInDir(dir: HexDir, rv: this[] = []): this[] {
    return super.hexesInDir(dir, rv)
  }
  override forEachHexDir(func: (hex: this, dir: HexDir, hex0: this) => unknown) {
    super.forEachHexDir(func);
  }
  override nextHex(dir: HexDir, ns: number = 1): this | undefined {
    return super.nextHex(dir, ns) as this | undefined;
  }
  override lastHex(ds: HexDir): this {
    return super.lastHex(ds)
  }
 *
 */
export function Hex2Mixin<TBase extends Constructor<Hex1>>(Base: TBase) {
  return class Hex2Impl extends Base {
    /**
      * add Hex2 to map?.mapCont.hexCont; not in map.hexAry!
      *
      * Hex2.cont contains:
      * - hexShape: polyStar Shape of radius @ (XY=0,0)
      * - rcText: '(r,c)' slightly above center, WHITE
      * - distText: initially distText.text = `${district}` slightly below center, BLACK
      */
    constructor(...args: any[]) {
      // here we inforce that derived class has identical Constructor!
      // Alternative, we could pass the args [] directly, ie: super(args) !not spread!
      // new class constructor could parse/spread to get the bits they want,
      // then edit-in-place the args array to be compatible for this.constructorCode()
      const [map, row, col, Aname] = args;
      super(map, row, col, Aname);  // invoke the given Base constructor: LocalHex1
      this.constructorCode(map, row, col, Aname);
      return;         // breakpoint able
    }

    readonly implementsIHex2 = true;
    /** Child of mapCont.hexCont: HexCont holds hexShape(color), rcText, distText, capMark */
    readonly cont: HexCont = new HexCont(this); // Hex IS-A Hex0, HAS-A HexCont Container
    readonly radius = TP.hexRad;                // determines width & height
    readonly hexShape = this.makeHexShape();    // shown on this.cont: colored hexagon
    get mapCont() { return this.map.mapCont; }
    get markCont() { return this.mapCont.markCont; }

    get x() { return this.cont.x }
    set x(v: number) { this.cont.x = v }
    get y() { return this.cont.y }
    set y(v: number) { this.cont.y = v }
    get scaleX() { return this.cont.scaleX }
    get scaleY() { return this.cont.scaleY }

    // if override set, then must override get!
    override get district() { return this._district }
    override set district(d: number | undefined) {
      this._district = d    // cannot use super.district = d [causes recursion, IIRC]
      this.distText.text = `${d}`
    }
    distColor: string // district color of hexShape (paintHexShape)
    distText: Text    // shown on this.cont
    rcText: Text      // shown on this.cont

    /**
     * initCont(r,c); rcText; distText; legalMark; showText(true)
     * @param map addChild(hex.cont) to map?.mapCont.hexCont (can force map to undefined)
     * @param row compute y offset from xywh using radius & topo
     * @param col compute x offset from xywh using radius & topo
     * @param dText [''] initial distText
     */
    constructorCode(map: HexM<IHex2>, row: number, col: number, dText = '') {
      this.initCont(row, col);
      map?.mapCont.hexCont.addChild(this.cont);
      this.hexShape.name = this.Aname;
      this.setRcText(row, col);
      this.setDistText(dText);
      this.legalMark = this.makeLegalMark().setOnHex(this);
      this.showText(true); // & this.cache()
    }

    /** set rcText to identify 'row,col'
     * @param rcf fontSize and (y -= rcf/2);
     */
    setRcText(row: number, col: number, rcf = 26 * TP.hexRad / 60) {
      const nf = (n: number) => `${n !== undefined ? (n === Math.floor(n) ? n : n.toFixed(1)) : ''}`;
      const rcs = `${nf(row)},${nf(col)}`;
      const rct = this.rcText = new CenterText(rcs, F.fontSpec(rcf), 'white');
      rct.y -= rcf / 2; // raise it up
      this.cont.addChild(rct);
    }
    /**
     * Place distText on this.cont
     * @param dText distText
     * @param size fontSize & y-offset from center of hex
     */
    setDistText(dText = '', size = 20 * TP.hexRad / 60) {
      this.distText = new CenterText(dText, F.fontSpec(size));
      this.distText.y += size;   // push it down
      this.cont.addChild(this.distText);
    }

    /** set visibility of rcText & distText; updateCache() */
    showText(vis = !this.rcText.visible) {
      this.rcText.visible = this.distText.visible = vis;
      this.reCache();
    }

    makeLegalMark() { return new LegalMark() }
    legalMark!: LegalMark;
    override get isLegal() { return this._isLegal; }
    override set isLegal(v: boolean) {
      super.isLegal = v;
      this.legalMark.visible = v;
    }

    /** place this.cont; setBounds(); cont.cache() */
    initCont(row: number, col: number) {
      const cont = this.cont, hs = this.hexShape;
      cont.addChildAt(hs, 0);
      cont.hitArea = hs;
      const { x, y, w, h } = this.xywh(this.radius, TP.useEwTopo, row, col); // include margin space between hexes
      cont.x = x;
      cont.y = y;
      // initialize cache bounds:
      this.reCache();
    }

    reCache(scale = TP.cacheTiles) {
      const cont = this.cont;
      if (cont.cacheID) cont.uncache()
      cont.setBoundsNull(); // remove bounds
      const b = cont.getBounds();    // of hexShape & others?
      cont.setBounds(b.x, b.y, b.width, b.height); // record for debugger
      if (scale > 0) cont.cache(b.x, b.y, b.width, b.height, scale);
    }

    makeHexShape(colorn = C.grey224): Paintable {
      const hs = new HexShape(this.radius)
      hs.paint(colorn);
      return hs;
    }

    /** this.hexShape.paint(color); optionally set this.district.
     * @param color
     * @param district [undefined] if supplied, set this.district number
     */
    setHexColor(color: string, district?: number | undefined) {
      if (district !== undefined) this.district = district // hex.setHexColor update district
      this.distColor = color;
      this.hexShape.paint(color);
      this.reCache();
    }

    // The following were created for the map in hexmarket:
    /** unit distance between Hexes: adjacent = 1; see also: radialDist */
    metricDist(hex: Hex): number {
      let { x: tx, y: ty } = this.xywh(1), { x: hx, y: hy } = hex.xywh(1)
      let dx = tx - hx, dy = ty - hy
      return Math.sqrt(dx * dx + dy * dy); // tw == H.sqrt3
    }

    /** Location of corner on radial of given dir */
    cornerXY(dir: HexDir, rad = this.radius, point = new Point(0, 0)) {
      const deg = H.dirRot[dir];
      const a = deg * H.degToRadians
      point.x += Math.sin(a) * rad;
      point.y -= Math.cos(a) * rad;
      return point;
    }

    /** Location of corner between dir0 and dir1; in parent coordinates.
     * @param dir0 a HexDir
     * @param dir1 a HexDir
     * @param point [new Point()] set location-x,y in point and return it.
     * @param rad [this.radius]
     */
    cornerPoint(dir0: HexDir, dir1: HexDir, rad = this.radius, point = new Point()) {
      const d0 = H.dirRot[dir0], d1 = H.dirRot[dir1];
      let a2 = (d0 + d1) / 2;
      if (Math.abs(d0 - d1) > 180) a2 += 180
      const a = a2 * H.degToRadians
      point.x = this.x + Math.sin(a) * rad;
      point.y = this.y - Math.cos(a) * rad;
      return point;
    }
    /** Location of edge point in dir; in parent coordinates.
     * @param dir indicates direction to edge
     * @param rad [1] per-unit distance from center: 0 --> center, 1 --> exactly on edge, 1+ --> outside hex
     * @param point [new Point()] set location-x,y in point and return it.
     */
    edgePoint(dir: HexDir, rad = 1, point: XY = new Point()) {
      const a = H.dirRot[dir] * H.degToRadians, h = rad * this.radius * H.sqrt3_2;
      point.x = this.x + Math.sin(a) * h;
      point.y = this.y - Math.cos(a) * h;
      return point as Point;
    }
  }
}

/** a default Constructor and implementation of IHex2 */
export class Hex2 extends Hex2Mixin(Hex1) { }

type PublicInterface<T> = { [K in keyof T]: T[K] };

/** A graphics-enabled Hex cell, with a Container holding a HexShape. */
export type IHex2 = PublicInterface<Hex2>; // IHex2

/** a default Constructor and impl for RecycleHex. */
export class RecycleHex extends Hex2 { } // RecycleHex

/**
 * A HexShape/PaintableShape to indicate selected hex of HexMap.
 *
 * For contrast paint it (GREY,.3), leave a hole in the middle unpainted.
 *
 * @param radius of this HexShape
 * @param radius0 of removed circle
 * @param cm of HexShape/ring for mark ['rgba(127,127,127,.3)']
 */
export class HexMark extends HexShape {
  hex?: IHex2;
  constructor(radius: number, radius0 = 0, cm = 'rgba(127,127,127,.3)') {
    super(radius);
    this.graphics.f(cm).dp(0, 0, this.radius, 6, 0, this.tilt);
    this.cache(-radius, -radius, 2 * radius, 2 * radius); // oversize; see Hex.xywh()
    this.graphics.c().f(C.BLACK).dc(0, 0, radius0)
    this.updateCache('destination-out')
    this.setHexBounds();      // bounds are based on readonly, should be const
    this.mouseEnabled = false;
  }

  // Fail: markCont to be 'above' tileCont...
  /**
   * Show or hide mark on given hex; and hex.updateCache.
   *
   * (this.hex = hex) ? hex.cont.addChild(this.cont) : this.visible = false
   */
  showOn(hex: IHex2 | undefined) {
    // when mark is NOT showing, this.visible === false && this.hex === undefined.
    // when mark IS showing, this.visible === true && (this.hex instanceof Hex2)
    if (this.hex === hex) return;
    let ohex = this.hex, map = ohex?.map;
    if (ohex) {
      this.visible = false;
      if (!ohex.cont.cacheID) debugger;
      ohex.reCache();
      map = ohex.map;
    }
    if (hex) {
      this.visible = true;
      hex.cont.addChild(this);
      if (!hex.cont.cacheID) debugger;
      hex.reCache();
      map = hex.map;
    }
    this.hex = hex;
    map?.update(); // remove old hex, add new hex
  }
}

export type MapContName = 'hexCont' | 'markCont';
/** MapCont is an empty Container until .addContainers(cNames) */
export class MapCont extends Container {
  constructor() {
    super()
    this.name = 'mapCont';
  }

  /** initial, default, readonly Container names, fieldNames */
  static cNames = ['backCont', 'hexCont', 'tileCont', 'markCont', 'counterCont'] as const;
  /** actual cNames being used for this MapCont, set in addContainers() */
  private _cNames: string[] = MapCont.cNames.concat();
  get cNames() { return this._cNames; }
  backCont: Container    // playerPanels
  hexCont: Container     // hex shapes on bottom stats: addChild(dsText), parent.rotation
  // infCont: Container  // infMark below tileCont; Hex2.showInf
  tileCont: Container    // Tiles & Meeples on Hex2/HexMap.
  markCont: Container    // showMark over Hex2; LegalMark
  // capCont: Container  // for tile.capMark
  counterCont: Container // counters for AuctionCont
  // eventCont: Container// the eventHex & and whatever Tile is on it...

  /** add all the layers of Containers. update this.cNames */
  addContainers(cNames: readonly string[] = this.cNames) {
    this._cNames = cNames.concat();
    this.removeAllChildren(); // TODO: remove all the field references also
    this.cNames.forEach(cname => {
      const cont = new NamedContainer(cname);
      this[cname as MapContName] = cont;
      this.addChild(cont);
    })
  }
  isContName(cname: string): cname is MapContName {
    return this.cNames.includes(cname)
  }
  getCont(cname: MapContName) {
    return this[cname]; // Assert: this._cNames.includes(cname)
  }

  /**
   * Set hexCont(x,y) so hexMap.getBounds() is centered around mapCont(0,0);
   *
   * [Generally, hexCont.centerHex is ~ mapCont(0,0)]
   *
   * Move ALL children of this MapCont to have that same (x,y) alignment.
   * @param bounds [hexCont.getBounds()] align containers to center of given bounds.
   */
  centerContainers(bounds = this.hexCont.getBounds()) {
    // based on aggregate of all added Hex2.cont; == the .cache(bounds);
    const { x, y, width, height } = bounds;
    const x0 = x + width / 2, y0 = y + height / 2;
    this.cNames.forEach(cname => {
      const cont = this[cname as MapContName];
      cont.x = -x0; cont.y = -y0
    })
  }
}

/**
 * Minimal subset of HexMap\<T extends Hex\> used by hexlib: Hex, Tile, TileSource.
 *
 * Expect HexM\<IHex2\> for many cases; HexM\<Hex1\> for robo-planner?
 */
export interface HexM<T extends Hex> {
  readonly district: T[][]        // all the Hex in a given district
  readonly mapCont: MapCont
  rcLinear(row: number, col: number): number
  forEachHex(fn: (hex: T) => void): void // stats forEachHex(incCounters(hex))
  update(): void
  showMark(hex?: T): void
  // Table also uses:
  radius: number;
  centerHex: T;
  xywh: XYWH & { dxdc: number; dydr: number; }
  xyFromMap(target: DisplayObject, row: number, col: number): XYWH;
  hexC: Constructor<T>
  hexUnderObj(dragObj: DisplayObject, legalOnly?: boolean): T | undefined
  getHex(id: RC): T;
}

/**
 * 2-D Array[row][col]: Hex; plus a mapCont of Graphics-Containers for IHex2.
 *
 * hexAry[n]: all the Hex (or IHex2) elements.
 *
 * district[i]: Hex[]; all the Hex in a given district.
 *
 * (TP.mh X TP.nh) hexes in districts;
 *
 * Use addToMapCont(hexC), to populate with new hexC()
 *
 * mark: a HexMark to visually indicate a selected IHex2.
 *
 */
export class HexMap<T extends Hex> extends Array<Array<T>> implements HexM<T> {
  /** A color for each District: 'rgb(198,198,198)' */
  static readonly distColor = ['lightgrey', 'limegreen', 'deepskyblue', 'rgb(255,165,0)', 'violet', 'rgb(250,80,80)', 'yellow'];

  /**
   * HexMap: TP.nRows X TP.nCols of Hex [new hexC()]
   *
   * Basic map is non-GUI, addToMapCont(hexC) makes IHex2 elements to enable GUI interaction.
   * Use hexC() to make Hex; mapCont has layers of Containers per HexMap.cNames;
   *
   * @param radius [TP.hexRad] typically 60
   * @param addToMapCont [false] set true to include addToMapCont(hexC)
   * @param hexC [Hex] HexConstructor\<Hex\> for each element
   * @param Aname ['mainMap'] a name for debugger
   */
  constructor(radius = TP.hexRad, addToMapCont = false,
    public hexC: Constructor<T>,
    public Aname: string = 'mainMap') //
  {
    super(); // Array<Array<Hex>>()
    this.radius = radius;
    if (addToMapCont) this.addToMapCont(this.hexC);
  }

  /** may be obsolete when using IHex2 */
  get asIHex2Map() { return this as any as HexMap<IHex2> }
  /** Each occupied Hex, with the associated district color */
  readonly district: Array<T[]> = []
  hexAry: T[];  // set by makeAllDistricts()
  readonly mapCont: MapCont = new MapCont();   // if/when using Hex2

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
  get xywh() { return this.centerHex.xywh(this.radius); }

  private minCol?: number = undefined               // Array.forEach does not look at negative indices!
  private maxCol?: number = undefined               // used by rcLinear
  private minRow?: number = undefined               // to find centerHex
  private maxRow?: number = undefined               // to find centerHex
  get centerRC() {
    const row = Math.floor(((this.maxRow ?? 0) + (this.minRow ?? 0)) / 2);
    const col = Math.floor(((this.minCol ?? 0) + (this.maxCol ?? 0)) / 2);
    return { row, col }
  }

  get centerHex() {
    const { row, col } = this.centerRC;
    return this[row][col]; // as Hex2; as T;
  }

  // when called, maxRow, etc are defined...
  get nRowCol() { return [(this.maxRow ?? 0) - (this.minRow ?? 0), (this.maxCol ?? 0) - (this.minCol ?? 0)] }
  getCornerHex(dn: HexDir) {
    return this.centerHex.lastHex(dn)
  }

  getHex(ihex: RC) {
    /** return indicated Hex from otherMap */
    try {
      return this[ihex.row][ihex.col]
    } catch (err) {
      console.warn(`ofMap failed:`, err, { ihex, hexMap: this }) // eg: id is from different (mh,nh)
      throw err
    }
  }

  rcLinear(row: number, col: number): number { return col + row * (1 + (this.maxCol ?? 0) - (this.minCol ?? 0)) }

  mark: DisplayObject         // a cached DisplayObject, used by showMark

  makeMark(): DisplayObject {
    const mark = new HexMark(this.radius, this.radius / 2.5);
    return mark;
  }

  /**
   * create/attach Graphical components for HexMap
   * @param hexC constructor for graphical Hex
   * @param cNames names for Containers to be added & aligned with map; MapCont.cNames.concat() as string[]
   * @returns this
   */
  addToMapCont(hexC?: Constructor<T>, cNames?: readonly string[]): this {
    if (hexC) this.hexC = hexC;
    this.mapCont.addContainers(cNames);
    this.mark = this.makeMark();
    return this;
  }

  /** ...stage?.update() */
  update() {
    const hexCont = this.mapCont?.hexCont;
    hexCont?.cacheID && hexCont.updateCache()  // when toggleText: hexInspector
    hexCont?.stage?.update();
  }

  /** to build this HexMap: create Hex (or Hex2) and link it to neighbors. */
  addHex(row: number, col: number, district: number | undefined, hexC = this.hexC): T {
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

  /** find object under dragObj, using hexUnderPoint() */
  hexUnderObj(dragObj: DisplayObject, legalOnly = true) {
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

  /** make this.mark visible (or not) above the given Hex
   * @param hex [undefined] if supplied mark.visible = true; else mark.visible = false
   * @param mark [this.mark] can supply alternate mark to be moved and visiblized.
   */
  showMark(hex?: Hex, mark = this.mark) {
    if (!hex) {  // || hex.Aname === S_Skip || hex.Aname === S_Resign) {
      mark.visible = false;
    } else if (Hex.isIHex2(hex)) {
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

  /** return a new RC; does not mutate the given RC.
   * @return RC of adjacent Hex in given direction for given topo.
   */
  nextRowCol(rc: RC, dir: HexDir, nt: Topo = this.topo(rc)): RC {
    const ntdir = (nt as TopoNS)[dir as NsDir];
    const { dr, dc } = ntdir; // OR (nt as TopoEW[dir as EwDir]) OR simply: nt[dir]
    return { row: rc.row + dr, col: rc.col + dc };
  }

  readonly metaMap = Array<Array<T>>()           // hex0 (center Hex) of each MetaHex, has metaLinks to others.

  addMetaHex(hex: T, mrc: RC) {
    const metaMap = this.metaMap, { row: mr, col: mc } = mrc;
    if (metaMap[mr] === undefined) metaMap[mr] = new Array<T>()
    if (metaMap[mr][mc] === undefined) metaMap[mr][mc] = hex;
    this.metaLink(hex, { row: mr, col: mc })
  }

  /** link metaHex on metaMap; maybe need ewTopo for nh==1 ?? */
  metaLink(hex: T, rc: RC) {
    // planner expects Dir1 & Dir2 in NsDir; nextMetaRC.mrc: NsDir
    let nt = (this.nh == 0) ? H.ewTopo(rc) : H.nsTopo(rc); // always nsTopo!!
    if (!hex.metaLinks) hex.metaLinks = {};
    this.link(hex, rc, this.metaMap, nt, (hex) => hex.metaLinks)
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
   * Return the Hex under the given x,y coordinates.
   *
   * Conceptually: (legal ? LegalMark : HexCont)?.hex2 as \<T extends IHex2\>;
   *
   * If multiple HexCont at x,y, return the top (last drawn) HexCont.
   * @param x in local coordinates of this HexMap.mapCont
   * @param y
   * @param legal - return ONLY a Hex with LegalMark visible & mouseenabled.
   * @returns the IHex2 of the LegalMark or HexCont at the given point (or undefined if no such HexCont)
   */
  hexUnderPoint(x: number, y: number, legal = true): T | undefined {
    const mark = this.mapCont.markCont.getObjectUnderPoint(x, y, 1);
    // Note: in theory, mark could be on a IHex2 that is NOT in hexCont!
    if (mark instanceof LegalMark) return mark.hex2 as any as T;
    if (legal) return undefined;
    const hexc = this.mapCont.hexCont.getObjectUnderPoint(x, y, 1); // 0=all, 1=mouse-enabled (Hex, not Stone)
    if (hexc instanceof HexCont) return hexc.hex2 as any as T;
    return undefined;
  }

  /** set target.xy to metric [row, col] of this HexMap.hexCont; return the xywh coordinates
   *
   * see also: Table.setToRowCol(cont, row, col)
   */
  xyFromMap(target: DisplayObject, row = 0, col = 0) {
    const xywh = Hex2.xywh(undefined, undefined, row, col)
    const xy = this.mapCont.hexCont.localToLocal(xywh.x, xywh.y, target, xywh); // offset from hexCont to target
    return xywh;
  }

  // not sure if these will be useful:
  private _nh: number;
  private _mh: number;
  get nh() { return this._nh }
  get mh() { return this._mh }

  /** final; set size of this HexMap; then it is readonly.
   * @param nh size of district (size of each MetaHex) [TP.nHexes]
   * @param mh order of MetaHex (number of MetaHex per side of map)  [TP.mHexes]
   */
  setSize(nh = TP.nHexes, mh = TP.mHexes) {
    this._nh = nh;
    this._mh = mh;
  }

  /** utility for makeAllDistricts; make hex0 at RC */
  calculateRC0(): RC {
    // suitable for makeMetaHexes
    const offs = Math.ceil(2 * this.nh * (this.mh - .5)); // row incr could be smaller for EwTopo
    return { row: offs, col: offs } // row,col to be non-negative
  }

  /**
   * Wrapper for makeAllHexes;
   * setSize, calculateRC0, makeAllHexes, set this.hexAry, centerContainers()
   * @param nh number of hexes on on edge of metaHex
   * @param mh order of metaHexes (greater than 0);
   */
  makeAllDistricts(nh = TP.nHexes, mh = TP.mHexes) {
    this.setSize(nh, mh);
    const rc0 = this.calculateRC0();
    const hexAry = this.hexAry = this.makeAllHexes(nh, mh, rc0);    // nh hexes on outer ring; single meta-hex
    this.mapCont?.hexCont && this.mapCont.centerContainers();
    return hexAry;
  }

  /**
   * overridable action for makeAllDistricts;
   *
   * Base implementation invokes makeMetaHexRings(nh, mh, rc0)
   *
   * Alterative: makeRect(nrow, ncol, ...)
   *
   * @param nh
   * @param mh
   * @param rc0
   * @return hexAry of the created hexes, becomes hexMap.hexAry
   */
  makeAllHexes(nh = TP.nHexes, mh = TP.mHexes, rc0: RC) {
    return this.makeMetaHexRings(nh, mh, rc0);
  }

  /**
   * Make the center district, then make (mh-1) rings other meta-hex districts.
   *
   * Spiral clockwise from center, placing a line of meta-hex [using makeMetaHex()].
   *
   * MakeMetaHex likewise spirals from center, placing a line of Hex.
   *
   * @param nh order [number of 'rings'] of meta-hexes (2 or 3 for this game) [TP.mHexes]
   * @param mh size ['rings' in each meta-hex] of meta-hex (1..6) [TP.nHexes]
   * @param rc0 location of initial, central Hex
   * @return
   */
  makeMetaHexRings(nh = TP.nHexes, mh = TP.mHexes, rc0: RC, mrc = { row: 0, col: 0 }) {
    const dL = nh, dS = (nh - 1), dirs = this.linkDirs;
    const nextMetaRC = (rc: RC, nd: number): RC => {
      const dirL = dirs[nd], dirS = dirs[(nd + 5) % 6], metaD = H.nsDirs[(nd + 5) % 6];
      rc = this.forRCsOnLine(dL, rc, dirL); // step (WS) by dist
      rc = this.forRCsOnLine(dS, rc, dirS); // step (S) to center of 0-th metaHex
      mrc = this.nextRowCol(mrc, metaD, H.nsTopo(mrc)); // metaMap uses nsTopo!
      return rc;
    }
    // do metaRing = 0, district 0:
    let district = 0, rc = rc0;
    let hexAry = this.makeMetaHex(nh, district++, rc, mrc); // Central District [0]

    for (let metaRing = 1; metaRing < mh; metaRing++) {
      rc = nextMetaRC(rc, 4); // step in dirs[4] to initial rc (W or WS of previous rc)
      // from rc, for each dir, step dir to center of next metaHex.
      dirs.forEach((dirL, nd) => {
        for (let nhc = 1; nhc <= metaRing; nhc++) {
          rc = nextMetaRC(rc, nd);
          const hexAry2 = this.makeMetaHex(nh, district++, rc, mrc);
          hexAry = hexAry.concat(...hexAry2);
        }
      })
    }
    return hexAry;
  }

  /**
   * Make a single metaHex (district) of order nh, at hex[mr, mc]
   *
   * addHex for center and each of nh rings.
   * @param nh order of the metaHex/district
   * @param district identifying number of district
   * @param rc location of center Hex
   * @param mrc location in meta hex array [undefined: no MetaHex links]
   * @return array containing all the added Hexes
   */
  makeMetaHex(nh: number, district: number, rc: RC, mrc?: RC): T[] {
    const hexAry = Array<Hex>();
    const hex = this.addHex(rc.row, rc.col, district);
    hexAry.push(hex);              // The *center* hex of district
    if (mrc) this.addMetaHex(hex, mrc); // for hexline! (link centers of districts)
    for (let ring = 1; ring < nh; ring++) {
      rc = this.nextRowCol(rc, this.linkDirs[4]);
      // place 'ring' of hexes, addHex along each line:
      rc = this.ringWalk(rc, ring, this.linkDirs, (rc, dir) => {
        hexAry.push(this.addHex(rc.row, rc.col, district));
        return this.nextRowCol(rc, dir);
      });
    }
    this.setDistrictAndPaint(hexAry as T[], district);
    return hexAry as T[];
  }

  /**
   * pickColor and paint all Hexes in hex2Ary
   *
   * Optional special color for center hex of each district
   * @param hex2Aray a Hex2[] of hexes to be colored by pickColor(hexAry)
   * @param district if district == 0, paint with special distColor[0]
   * @param cColor color for center hex, else use dcolor from pickColor(hex2Ary)
   */
  paintDistrict(hex2Ary: IHex2[], district = 0, cColor?: string) {
    let dcolor = (district == 0) ? HexMap.distColor[0] : this.pickColor(hex2Ary)
    hex2Ary.forEach((hex, n) => hex.setHexColor((n == 0) ? cColor ?? dcolor : dcolor));
  }

  /** find color not used by hex adjacent to given hexAry [hexline] */
  pickColor(hexAry: IHex2[]): string {
    let hex = hexAry[0]
    let adjColor: string[] = [HexMap.distColor[0]] // colors not to use
    this.linkDirs.forEach(hd => {
      let nhex = hex;
      while (!!(nhex = nhex.nextHex(hd) as IHex2)) {
        if (nhex.district != hex.district) { adjColor.push(nhex.distColor); return }
      }
    })
    return HexMap.distColor.find(ci => !adjColor.includes(ci)) ?? 'white'; // or undefined or ...
  }


  /** record hexAry in this.district[district];
   *
   * paint each Hex using paintDistrict.
   */
  setDistrictAndPaint(hexAry: T[], district = 0) {
    this.district[district] = hexAry;
    if (Hex.isIHex2(hexAry[0])) {
      this.paintDistrict(hexAry as any as IHex2[], district);
    }
  }

  /**
   * Make rectangle of hexes created with this.hexC.
   *
   * Note: district = 0; hexAry.forEach() to set alternate district.
   *
   * rnd == 1 looks best when nc is odd;
   * @param nr height
   * @param nc width [nr + 1]
   * @param rnd 0: all, 1: rm end of row 0 (& half of last row!)
   * @parma half [(rnd === 1) || (nc % 2 === 1)] force/deny final half-row
   * @param hexAry array in which to push the created Hexes [Array()<T>]
   * @returns hexAry with the created Hexes pushed (row major)
   */
  makeRect(nr: number, nc = nr + 1, rnd = 1, half = (rnd === 1) || (nc % 2 === 1), hexAry: T[] = []): T[] {
    const hexAryNR = [] as any as (T[] & { Nr: number, Nc: number });
    hexAryNR['Nr'] = nr; hexAryNR['Nc'] = nc;         // for debugger
    const district = 0;
    // nr = 9; nc = 11; rnd = 1; half = (rnd === 1) || (nc % 2 === 1);
    const ncOdd = (nc % 2) === 0;
    const c00 = (rnd === 0) ? 0 : 1;
    const nc0 = (rnd === 0) ? 0 : nc - (ncOdd ? 1 : 2 * c00);
    this.addLineOfHex(nc0, 0, c00, district, hexAry);
    for (let row = 1; row < nr - 1; row++) {
      this.addLineOfHex(nc, row, 0, district, hexAry);
    }
    const cf0 = (rnd === 0) ? 0 : 2;
    const ncf = nc - ((rnd === 0) ? 0 : 3);
    const dc = (half) ? 2 : 1;
    this.addLineOfHex(ncf, nr - 1, cf0, district, hexAry, dc);
    this.setDistrictAndPaint(hexAry, district);
    return hexAry;
  }

  /**
   * create horizontal row using hexAry.push(addHex(row, col++dc, district))
   * @param maxc max col to use (esp when dc > 1)
   * @param row
   * @param col
   * @param district
   * @param hexAry
   * @param dc delta to column [1]
   */
  addLineOfHex(maxc: number, row: number, col: number, district: number, hexAry: Hex[], dc = 1) {
    for (let i = 0; i < maxc; i += dc) {
      hexAry.push(this.addHex(row, col + i, district));
    }
  }

  /**
   * Select RC location of each Hex on a line, and eval f(rc) => Hex.
   *
   * Not constrained by existance of Hex, generates a series of RC coordinates.
   *
   * Can be used to construct a Hex at selected RC location.
   *
   * @param n number of Hex locations to select
   * @param rc {row, col} of selected location
   * @param dir from rc, move by dir to next location
   * @param f do 'whatever' based on RC
   * @returns nextRowCol(rc, dir) from the last rc of the line.
   */
  forRCsOnLine(n: number, rc: RC, dir: HexDir, f = (rc: RC) => { }) {
    for (let i = 0; i < n; i++) {
      f(rc);
      rc = this.nextRowCol(rc, dir);
    }
    return rc;
  }

  /**
   * Apply f(rc, dir) to each of 'n' lines of RCs on nth ring.
   * Step from centerHex by dirs[4], do a line for each dir in dirs.
   *
   * - if topoEW: step to W; make lines going NE, E, SE, SW, W, NW
   * - if topoNS: step to WS; make lines going N, EN, ES, S, WS, WN
   * @param rc start of first line (heading dirs[0])
   * @param n ring number; number of hexes per line
   * @param dirs [this.linkDirs] each topo dirs in [clockwise] order.
   * @param f (RC, dir) => void; run f(rc) then step to next RC
   * @return the *next* RC on the final line (so can easily spiral)
   */
  ringWalk(rc: RC, n: number, dirs = this.linkDirs, f: (rc: RC, dir: HexDir) => void) {
    dirs.forEach(dir => {
      rc = this.forRCsOnLine(n, rc, dir, (rc) => f(rc, dir));
    });
    return rc;
  }

}

/** Marker class for HexMap used by GamePlayD */
export class HexMapD extends HexMap<Hex> {

}

