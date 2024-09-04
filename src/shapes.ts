import { C, F, XYWH, className } from "@thegraid/common-lib";
import { afterUpdate, CenterText } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, Rectangle, Shape, Text } from "@thegraid/easeljs-module";
import type { IHex2 } from "./hex";
import { H, HexDir } from "./hex-intfs";
import { TP } from "./table-params";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey2 = 'rgb(225,225,225)' // needs to contrast with WHITE influence lines
  static lightgrey_8 = 'rgb(225,225,225,.8)' // needs to contrast with WHITE influence lines
}

export interface Paintable extends DisplayObject {
  /** paint with new player color; updateCache() */
  paint(colorn: string, force?: boolean): Graphics;

  /** Paintable can compute its own Bounds. setBounds(undefined, 0, 0, 0) */
  setBounds(x: undefined | null | number, y: number, width: number, height: number): void;
  /** compute bounds of this Paintable */
  calcBounds(): XYWH;
  /** ensure Paintable is cached; expect setBounds() already done. */
  setCacheID(): void;
}

/** Create/Color Graphics Function (color, g0); extend graphics with additional instructions.
 * g0 is clone of "baseline" Graphics. (may be clear)
 */
export type CGF = (color: string, g?: Graphics) => Graphics;

/**
 * Usage: ??? [obsolete?]
 * - ps = super.makeShape(); // ISA PaintableShape
 * - ps.cgf = (color) => new CGF(color);
 * - ...
 * - ps.paint(red); --> ps.graphics = gf(red) --> new CG(red);
 * -
 * - const cgf: CGF = (color: string, g = new Graphics()) => {
 * -     return g.f(this.color).dc(0, 0, rad);
 * -   }
 * - }
 */
// The "origin story" was to create new Shapes without subclassing.
// Just make a new PaintableShape with its CGF
// can even compose by passing/invoking the CGF of other Shapes.
// the tricky bit for that is finding the 'inherited' CGF;
// maybe a known static; or constructor arg: either a CGF or a PS instance.
export class PaintableShape extends Shape implements Paintable {
  /** if supplied in contructor, cgf extends a clone [otherwise use new Graphics()] */
  _g0?: Graphics;
  /** initial/baseline Graphics, cgf extends to create cgfGraphics */
  get g0() {
    return this._g0?.clone() ?? new Graphics(); // clone, so original is not mutated.
  }
  /** previous/current Graphics that were rendered. (optimization... paint(color, true) to override) */
  cgfGraphics: Graphics; // points to this.graphics after cgf runs.
  /**
   *
   * @param _cgf Create Graphics Function
   * @param colorn paint with this color
   * @param g0 Graphics to clone (or create); used as baseline Graphics for each paint()
   */
  constructor(public _cgf: CGF, public colorn: string = C.BLACK, g0?: Graphics) {
    super();
    this._g0 = g0;
    this.name = className(this); // visible in debugger
  }
  // if caller is buiding a Graphics that will operate on existing cache, may be false.
  updateCacheInPaint = true;      // except for unusual cases
  get cgf() { return this._cgf; }
  /** set new cgf; and clear "previously rendered Graphics" */
  set cgf(cgf: CGF) {
    this._cgf = cgf;
    if (this.cgfGraphics) {
      this.paint(this.colorn, true);
    }
  }
  /** render graphics from cgf. */
  paint(colorn: string = this.colorn, force = false): Graphics {
    if (force || this.graphics !== this.cgfGraphics || this.colorn !== colorn) {
      // need to repaint, even if same color:
      this.graphics = this.g0;  // reset to initial Graphics.
      this.graphics = this.cgfGraphics = this.cgf(this.colorn = colorn); // apply this.cgf(color)
      if (this.updateCacheInPaint && this.cacheID) this.updateCache();
    }
    return this.graphics;
  }
  // easeljs does: BitMap, Sprite (Frame?), Text, Filter, BitmapCache, BlurFilter
  // easeljs does Container as union of bounds provided by children.
  /**
   * Paintable shape can & should calculate its Bounds.
   *
   * Subclasses should override to calculate their bounds.
   * @param x
   * * undefined -> calculate bounds,
   * * null -> remove bounds,
   * * number -> set to {x, y, width, height}
   * @param y
   * @param width
   * @param height
   */
  override setBounds(x: number | undefined | null, y: number, width: number, height: number): void {
    if (x === undefined) {
      const cached = this.cacheID; // undefined | number >= 1
      this.uncache();              // setBounds(null, 0, 0, 0);   // not nec'sary/useful
      const { x, y, w, h } = this.calcBounds()
      super.setBounds(x, y, w, h);
      if (cached) this.cache(x, y, w, h); // recache if previously cached
    } else {
      super.setBounds(x as any as number, y, width, height);
    }
  }

  /** subclass to override to compute actual bounds of their Shape. */
  calcBounds(): XYWH {
    return { x: 0, y: 0, w: 5, h: 5 }
  }

  /** ensure PaintableShape is cached; expect setBounds() already done. */
  setCacheID() {
    if (this.cacheID) return;  // also: if already cached, get/setBounds is useless
    let b = this.getBounds() as Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>
    if (!b) {
      const { x, y, w, h } = this.calcBounds();
      b = { x, y, width: w, height: h }
    }
    this.cache(b.x, b.y, b.width, b.height);
  }

}

/** an n-sided Polygon, tilted */
export class PolyShape extends PaintableShape {
  public rad = TP.hexRad;
  public nsides = 4;
  public pSize = 0;
  public tilt = 0;
  public fillc = C.grey;
  public strokec = C.black;

  /**
   * pscgf() invokes drawPoly(0,0,...);
   *
   * To adjust (x,y): supply g0 = new Graphics().mt(x,y)
   * @param params \{ rad, nsides, pSize, tilt, fillc, strokec }
   * @param g0 Graphics base
   */
  constructor({ rad, nsides, pSize, tilt, fillc, strokec }:
    { rad?: number, nsides?: number, pSize: number, tilt?: number, fillc?: string, strokec?: string }, g0?: Graphics) {
    super((fillc) => this.pscgf(fillc), fillc, g0);

    this.nsides = nsides ?? 4;
    this.rad = rad ?? TP.hexRad;
    this.pSize = pSize ?? 0;
    this.tilt = tilt ?? 0;
    this.fillc = fillc ?? C.grey;
    this.strokec = strokec ?? C.black;
    this._cgf = this.pscgf;
    this.paint(fillc);
  }

  /** set fillc and strokec, invoke drawPoly(0, 0, ...) */
  pscgf(fillc: string, g = this.g0) {
    ((this.fillc = fillc) ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    g.dp(0, 0, this.rad, this.nsides, this.pSize, this.tilt * H.degToRadians);
    return g;
  }

  override setBounds(x: number | undefined | null, y: number, width: number, height: number): void {
    if (x === undefined) {
      // overestimate: without nsides & tilt
      this.setBounds(-this.rad, -this.rad, 2 * this.rad, 2 * this.rad)
    } else {
      super.setBounds(x, y, width, height)
    }
  }
}

/**
 * A colored PaintableShape that fills a Hex.
 *
 * @param radius in call to drawPolyStar()
 */
export class HexShape extends PaintableShape {
  /**
   *
   * @param radius [TP.hexRad] radius of hexagon
   * @param tilt [EwTopo ? 30 : 0] tilt to align EW as vertical
   */
  constructor(
    readonly radius = TP.hexRad,
    readonly tilt = TP.useEwTopo ? 30 : 0,  // ewTopo->30, nsTopo->0
  ) {
    super((fillc) => this.hscgf(fillc));
    this.setBounds(undefined, 0, 0, 0); // ASSERT: radius & tilt are readonly, so bounds never changes!
  }

  /**
   * @deprecated use setBounds(undefined, 0, 0, 0)
   * @param r [this.radius]
   * @param tilt [this.tilt]
   */
  setHexBounds(r = this.radius, tilt = this.tilt) {
    const b = H.hexBounds(r, tilt);
    this.setBounds(b.x, b.y, b.width, b.height);
  }

  /**
   * Draw a Hexagon 1/60th inside the given radius.
   */
  hscgf(color: string, g0 = this.graphics) {
    return g0.f(color).dp(0, 0, Math.floor(this.radius * 59 / 60), 6, 0, this.tilt); // 30 or 0
  }

  override setBounds(x: number | undefined | null, y: number, width: number, height: number): void {
    if (x === undefined) {
      const b = H.hexBounds(this.radius, this.tilt)
      this.setBounds(b.x, b.y, b.width, b.height);
    } else {
      super.setBounds(x, y, width, height)
    }
  }

}



export class EllipseShape extends PaintableShape {
  /**
   * ellipse centered on (0,0), axis is NS/EW, rotate after.
   * @param radx radius in x dir
   * @param rady radisu in y dir
   * retain g0, to use as baseline Graphics for each paint()
   */
  constructor(public fillc = C.white, public radx = TP.hexRad / 2, public rady = TP.hexRad / 2, public strokec = C.black, g0?: Graphics) {
    super((fillc) => this.cscgf(fillc), strokec, g0);
    this._cgf = this.cscgf; // overwrite to remove indirection...
    this.paint(fillc);
  }

  cscgf(fillc: string, g = this.g0) {
    ((this.fillc = fillc) ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    g.de(-this.radx, -this.rady, 2 * this.radx, 2 * this.rady);
    return g;
  }

  override setBounds(x: number | undefined | null, y: number, width: number, height: number): void {
    if (x === undefined) {
      this.setBounds(-this.radx, -this.rady, 2 * this.radx, 2 * this.rady)
    } else {
      super.setBounds(x, y, width, height)
    }
  }
}

/**
 * Circle centered on (0,0)
 * @param rad radius
 * retain g0, to use as baseline Graphics for each paint()
 */
export class CircleShape extends EllipseShape {
  constructor(fillc = C.white, rad = TP.hexRad / 2, strokec = C.black, g0?: Graphics) {
    super(fillc, rad, rad, strokec, g0);
  }
}


/** a Rectangular Shape, maybe with rounded corners */
export class RectShape extends PaintableShape {

  // compare to Bounds;
  // this._bounds: Rectangle === { x, y, width, height }
  // this._rectangle: Rectangle === { x, y, width, height }
  _rect: XYWH;
  _cRad = 0;

  /**
   * Paint a rectangle (possibly with rounded corners) with fillc and stroke.
   * @param rect \{ x=0, y=0, w=hexRad, h=hexRad, r=0 } origin, extent and corner radius of Rectangle
   * @param fillc [C.white] color to fill the rectangle, '' for no fill
   * @param strokec [C.black] stroke color, '' for no stroke
   * @param g0 [new Graphics()] Graphics to clone and extend during paint()
   */
  constructor(
    { x = 0, y = 0, w = TP.hexRad, h = TP.hexRad, r = 0 }: {x?: number, y?: number, w?: number, h?: number, r?: number },
    public fillc = C.white,
    public strokec = C.black,
    g0?: Graphics,
  ) {
    super((fillc) => this.rscgf(fillc), fillc, g0);
    this._cgf = this.rscgf;
    this._cRad = r;
    this._rect = { x, y, w, h };
    this.setBounds(x, y, w, h);
    this.paint(fillc, true); // this.graphics = rscgf(...)
  }

  /** update any of {x, y, w, h, r} for future paint() or setBounds(...) */
  setRectRad({ x = this._rect.x, y = this._rect.y, w = this._rect.w, h = this._rect.h, r = this._cRad }: Partial<XYWH & { r: number }>) {
    this._cRad = r ?? this._cRad
    this._rect = { x, y, w, h }
  }

  override setBounds(x: number | undefined | null, y: number, width: number, height: number): void {
    if (x === undefined) {
      const b = this._rect;
      this.setBounds(b.x, b.y, b.w, b.h) // TODO: include strokeSize, which we don't have.. being in user-supplied g0
    } else {
      super.setBounds(x, y, width, height) // can be different from _rect
    }
  }

  rscgf(fillc: string, g = this.g0) {
    const { x, y, w, h } = this._rect;
    (fillc ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    if (this._cRad === 0) {
      g.dr(x, y, w, h);
    } else {
      g.rr(x, y, w, h, this._cRad);
      // note: there is also a drawRoundRectComplex(x,y,w,h,rTL,rTR,rBR,rBL)
    }
    return g;
  }
}


/** from hextowns, with translucent center circle. */
export class TileShape extends HexShape {
  static fillColor = C1.lightgrey_8;// 'rgba(200,200,200,.8)'

  constructor(radius?: number, tilt?: number) {
    super(radius, tilt); // sets Bounnds & this.cgf
    this.cgf = this.tscgf;
  }

  replaceDisk(colorn: string, r2 = this.radius) {
    if (!this.cacheID) this.setCacheID();
    else this.updateCache();               // write curent graphics to cache
    const g = this.graphics;
    g.c().f(C.BLACK).dc(0, 0, r2);       // bits to remove
    this.updateCache('destination-out'); // remove disk from solid hexagon
    g.c().f(colorn).dc(0, 0, r2);        // fill with translucent disk
    this.updateCache('source-over');     // update with new disk
    return g;
  }

  readonly bgColor = C.nameToRgbaString(C.WHITE, .8);
  /** colored HexShape filled with very-lightgrey disk: interpose on cgf with replaceDisk */
  tscgf(colorn: string, g0 = this.cgfGraphics?.clone() ?? new Graphics(), super_cgf = (color: string) => new Graphics()) {
    const g = this.graphics = super_cgf.call(this, this.bgColor); // HexShape.cgf(rgba(C.White, .8))
    const fillColor = C.nameToRgbaString(colorn, .8);
    this.replaceDisk(fillColor, this.radius * H.sqrt3_2 * (55 / 60));
    return this.graphics = g;
  }
}

export class LegalMark extends Shape { // TODO: maybe someday CircleShape?
  hex2: IHex2;
  setOnHex(hex: IHex2) {
    this.hex2 = hex;
    const parent = hex.mapCont.markCont;
    this.graphics.f(C.legalGreen).dc(0, 0, TP.hexRad/2);
    hex.cont.parent.localToLocal(hex.x, hex.y, parent, this);
    this.hitArea = hex.hexShape; // legal mark is used for hexUnderObject, so need to cover whole hex.
    this.mouseEnabled = true;
    this.visible = false;
    parent.addChild(this);
  }
}

/** Container with a colored RectShape behind the given DisplayObject. */
export class RectWithDisp extends Container implements Paintable {
  /** draws a RectShape around disp, with border, no strokec */
  rectShape: RectShape = new RectShape({ x: 0, y: 0, w: 8, h: 8, r: 0 }, C.WHITE, '');
  /** DisplayObject displayed above a RectShape of color  */
  readonly disp: DisplayObject;

  _border: number;
  /** extend RectShape around DisplayObject bounds. */
  get border() { return this._border; }
  set border(b: number) {
    this._border = b;
    this.setBounds(undefined, 0, 0, 0)
  }

  _corner: number;
  /** corner radius, does not repaint/recache */
  get corner() { return this._corner; }
  set corner(r: number) {
    this._corner = r;
    this.rectShape.setRectRad({ r })
  }

  /**
   * Create Container a RectShape behind the given DisplayOBject.
   * @param disp a DisplayObject
   * @param color [WHITE] of background RectShape.
   * @param border [5] extend RectShape around Text
   * @param corner [0] corner radius
   * @param cgf [tscgf] CGF for the RectShape
   */
  constructor(disp: DisplayObject, color = C.WHITE, border = 5, corner = 0, cgf?: CGF) {
    super();                             // ISA new Container()
    if (cgf) this.rectShape._cgf = cgf;  // HasA RectShape & DisplayObject
    this.disp = disp;
    this.border = border;
    this.corner = corner;               // _rShape._cRad = corner
    this.setBounds(undefined, 0, 0, 0); // calc (disp + border) -> rectShape -> this
    this.rectShape.paint(color);        // set initial color, Graphics
    this.addChild(this.rectShape, this.disp);
  }

  /** RectWithDisp.paint(color) paints new color for the backing RectShape. */
  paint(color = this.rectShape.colorn, force = false ) {
    this.rectShape.rscgf;
    return this.rectShape.paint(color, force);
  }

  /** uses PaintableShape.setCacheID. */
  setCacheID() {
    this.rectShape.setCacheID.call(this); //invoke from a PaintableShape
  }

  // override here if you don't like (label.bounds + border)
  calcBounds(): XYWH {
    const { x, y, width: w, height: h } = this.disp.getBounds();
    const db = this.border, { x: dx, y: dy } = this.disp;
    const b = { x: dx + x - db, y: dy + y - db, w: w + 2 * db, h: h + 2 * db };
    return b;
  }

  // Bounds = calcBounds (disp.bounds + border) -> rectShape._rect [& cRad] -> this._bounds
  /**
   * Note: if you addChild() to this Container, setBounds(undefined) won't consider them
   * unless you override calcBounds() to do a Rectangle.union()
   */
  override setBounds(x: number | undefined | null, y: number, width: number, height: number): void {
    if (x === undefined) {
      const cached = this.cacheID;
      this.uncache();
      const { x, y, w, h } = this.calcBounds();
      this.rectShape.setRectRad({ x, y, w, h });
      this.rectShape.setBounds(x, y, w, h); // setBounds to _rect
      super.setBounds(x, y, w, h);
      if (cached) this.cache(x, y, w, h); // recache if previously cached
    } else {
      super.setBounds(x as any as number, y, width, height);
    }
  }
}

/** A Text label above a colored RectShape.
 *
 * Configure the border width [.3] and corner radius [0].
 */
export class TextInRect extends RectWithDisp implements Paintable {
  declare disp: Text;
  /** Text object displayed above a RectShape of color */
  get label() { return this.disp; }

  /** extend RectShape around Text bounds; fraction of line height. */
  override get border() { return this._border * this.disp.getMeasuredLineHeight(); }
  override set border(tb: number) {
    this._border = tb;
    this.setBounds(undefined, 0, 0, 0);
  }

  /** corner radius; fraction of line height. */
  override get corner() { return this._corner; }
  override set corner(tr: number) {
    this._corner = tr;     // get corner() returns this unscaled value
    // but internally, _cRad is scaled by lineHeight
    const r = tr * this.disp.getMeasuredLineHeight();
    this.rectShape.setRectRad({ r })
  }
  /** the string inside the Text label. */
  get label_text() { return this.disp.text; }
  set label_text(txt: string | undefined) {
    this.disp.text = txt as string;
    this.setBounds(undefined, 0, 0, 0)
    this.paint(undefined, true);
  }

  /**
   * Create Container with Text above a RectShape.
   * @param text label
   * @param color [C.WHITE] of background RectShape.
   * @param border [.3] extend RectShape around Text; fraction of fontSize
   * @param corner [0] corner radius as fraction of fontSize
   * @param cgf [tscgf] CGF for the RectShape
   */
  constructor(label: Text, color?: string, border = .3, corner = 0, cgf?: CGF) {
    super(label, color, border, corner, cgf);  // ISA new Container()
  }
}

// From ankh, 'done' button to move to next phase or action.
/** Construct a CenterText for a TextInRect. */
export class UtilButton extends TextInRect {

  /**
   * Create Container with CenterText above a RectShape.
   *
   * on(rollover|rollout, this.rollover(mouseIn))
   *
   * initially visible & mouseEnabled, but deactivated.
   * @param label if not instanceof Text: new CenterText(label, fontSize, textColor)
   * @param color [C.WHITE] of background RectShape.
   * @param fontSize [TP.hexRad/2] or text.getMeasuredLineHeight()
   * @param textColor [C.black] or text.color
   * @param border [.3]
   * @param cgf [tscgf] CGF for the RectShape
   */
  constructor(label: string | Text, color?: string, public fontSize = TP.hexRad / 2, public textColor = C.black, border = .3, cgf?: CGF) {
    const text = (label instanceof Text) ? label : new CenterText(label, fontSize, textColor);
    super(text, color, border, 0, cgf)
    if (label instanceof Text) {
      this.fontSize = label.getMeasuredLineHeight()
      this.textColor = label.color;
    }
    this.on('rollover', () => this._active && this.rollover(true), this);
    this.on('rollout', () => this._active && this.rollover(false), this);
  }
  /** When activated, this.rollover(mouseIn) is invoked when mouse enter/exits this button. */
  rollover(mouseIn: boolean) {}
  /** If defined, paint(hlColor) & position over this button when activated. */
  highlight: PaintableShape;
  /** indicates if this button is currently activated. */
  _active = false;
  /** When activated: display highlight, visible, mouseEnabled, enable rollover(mouseIn).
   *
   * @param hlColor [C.WHITE] highlight?.paint(hlColor)
   * @returns
   */
  activate(hlColor = C.WHITE) {
    const hl = this.highlight;
    if (hl) {
      hl.paint(hlColor);
      hl.x = this.x; // a common hightlight will move between buttons
      hl.y = this.y;
      hl.visible = true;
    }
    this.mouseEnabled = this._active = true;
    this.stage?.update();
    return this;
  }
  /** deactivate this button, not visible, not mouseEnabled. */
  deactivate() {
    this.highlight && (this.highlight.visible = false);
    this.mouseEnabled = this._active = false;
    this.stage?.update();
  }

  /**
   * Repaint the stage with button visible or not.
   *
   * Allow Chrome to finish stage.update before proceeding with after().
   *
   * Other code can watch this.blocked; then call updateWait(false) to reset.
   * @param after [() => {}] callback on('drawend') when stage.update is done [none]
   * @param scope [this] thisArg for after [this UtilButton]
   * @param hide [false] true to deactivate this UtilButton
   * @deprecated use easeljs-lib.afterUpdate(cont, after, scope) directly
   */
  updateWait(after?: () => void, scope: any = this, hide = false) {
    if (hide) this.deactivate()
    // using @thegraid/easeljs-module@^1.1.8: on(once=true) will now 'just work'
    // using @thegraid/common-lib@^1.3.12: afterUpdate will always update
    afterUpdate(this, after, scope)
  }
}
