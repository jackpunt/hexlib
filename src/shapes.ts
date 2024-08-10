import { C, XYWH, className } from "@thegraid/common-lib";
import { CenterText } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, Shape, Text } from "@thegraid/easeljs-module";
import type { Hex2 } from "./hex";
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
}

/**
 * The colored PaintableShape that fills a Hex.
 * @param radius in call to drawPolyStar()
 */
export class HexShape extends PaintableShape {
  constructor(
    readonly radius = TP.hexRad,
    readonly tilt = TP.useEwTopo ? 30 : 0,  // ewTopo->30, nsTopo->0
  ) {
    super((fillc) => this.hscgf(fillc));
    this.setHexBounds(); // Assert radius & tilt are readonly, so bounds never changes!
  }

  setHexBounds(r = this.radius, tilt = this.tilt) {
    const b = H.hexBounds(r, tilt);
    this.setBounds(b.x, b.y, b.width, b.height);
  }

  setCacheID() {
    const b = this.getBounds();              // Bounds are set
    this.cache(b.x, b.y, b.width, b.height);
  }

  /**
   * Draw a Hexagon 1/60th inside the given radius.
   * overrides should include call to setHexBounds(radius, angle)
   * or in other way setBounds().
   */
  hscgf(color: string, g0 = this.graphics) {
    return g0.f(color).dp(0, 0, Math.floor(this.radius * 59 / 60), 6, 0, this.tilt); // 30 or 0
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
    g.de(-this.radx, -this.rady, 2 * this.radx, 2 * this.rady);  // easlejs can determine Bounds of Ellipse
    return g;
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

export class PolyShape extends PaintableShape {
  constructor(public nsides = 4, public tilt = 0, public fillc = C.white, public rad = TP.hexRad / 2, public strokec = C.black, g0?: Graphics) {
    super((fillc) => this.pscgf(fillc), fillc, g0);
    this._cgf = this.pscgf;
    this.paint(fillc);
  }

  pscgf(fillc: string, g = this.g0) {
    ((this.fillc = fillc) ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    g.dp(0, 0, this.rad, this.nsides, 0, this.tilt * H.degToRadians);
    return g;
  }
}

export class RectShape extends PaintableShape {
  static rectWHXY(w: number, h: number, x = -w / 2, y = -h / 2, g0 = new Graphics()) {
    return g0.dr(x, y, w, h)
  }

  static rectWHXYr(w: number, h: number, x = -w / 2, y = -h / 2, r = 0, g0 = new Graphics()) {
    return g0.rr(x, y, w, h, r);
  }

  /** draw rectangle suitable for given Text; with border, textAlign. */
  static rectText(t: Text | string, fs?: number, b?: number, align = (t instanceof Text) ? t.textAlign : 'center', g0 = new Graphics()) {
    const txt = (t instanceof Text) ? t : new CenterText(t, fs ?? 30);
    txt.textAlign = align;
    if (txt.text === undefined) return g0; // or RectShape.rectWHXY(0,0,0,0); ??
    if (fs === undefined) fs = txt.getMeasuredHeight();
    if (b === undefined) b = fs * .1;
    const txtw = txt.getMeasuredWidth(), w = b + txtw + b, h = b + fs + b;
    const x = (align == 'right') ? w-b : (align === 'left') ? -b : w / 2;
    return RectShape.rectWHXY(w, h, -x, -h / 2, g0);
  }

  rect: XYWH;
  rc: number = 0;
  constructor(
    { x = 0, y = 0, w = TP.hexRad / 2, h = TP.hexRad / 2, r = 0 }: XYWH & { r?: number },
    public fillc = C.white,
    public strokec = C.black,
    g0?: Graphics,
  ) {
    super((fillc) => this.rscgf(fillc as string), fillc, g0);
    this._cgf = this.rscgf;
    this.rect = { x, y, w, h };
    this.setBounds(x, y, w, h);
    this.rc = r;
    this.paint(fillc, true); // this.graphics = rscgf(...)
  }

  rscgf(fillc: string, g = this.g0) {
    const { x, y, w, h } = this.rect, r = TP.hexRad / 2;
    (fillc ? g.f(fillc) : g.ef());
    (this.strokec ? g.s(this.strokec) : g.es());
    if (this.rc === 0) {
      g.dr(x ?? 0, y ?? 0, w ?? r, h ?? r);
    } else {
      g.rr(x ?? 0, y ?? 0, w ?? r, h ?? r, this.rc);
    }
    return g;
  }
}


/** from hextowns, with translucent center. */
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
    this.updateCache("destination-out"); // remove disk from solid hexagon
    g.c().f(colorn).dc(0, 0, r2);        // fill with translucent disk
    this.updateCache("source-over");     // update with new disk
    return g;
  }

  readonly bgColor = C.nameToRgbaString(C.WHITE, .8);
  /** colored HexShape filled with very-lightgrey disk: */
  tscgf(colorn: string, g0 = this.cgfGraphics?.clone() ?? new Graphics(), super_cgf = (color: string) => new Graphics()) {
    // HexShape.cgf(rgba(C.WHITE, .8))
    const g = this.graphics = super_cgf.call(this, this.bgColor); // paint HexShape(White)
    const fillColor = C.nameToRgbaString(colorn, .8);
    this.replaceDisk(fillColor, this.radius * H.sqrt3_2 * (55 / 60));
    return this.graphics = g;
  }
}

export class LegalMark extends Shape {
  hex2: Hex2;
  setOnHex(hex: Hex2) {
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

export class UtilButton extends Container implements Paintable {
  blocked: boolean = false
  shape: PaintableShape;
  label: CenterText;
  get label_text() { return this.label.text; }
  set label_text(t: string | undefined) {
    this.label.text = t as string;
    this.paint(undefined, true);
  }

  constructor(color: string, text: string, public fontSize = TP.hexRad / 2, public textColor = C.black, cgf?: CGF) {
    super();
    this.label = new CenterText(text, fontSize, textColor);
    this.shape = new PaintableShape(cgf ?? ((c) => this.ubcsf(c)));
    this.shape.paint(color);
    this.addChild(this.shape, this.label);
  }

  ubcsf(color: string, g = new Graphics()) {
    return RectShape.rectText(this.label.text, this.fontSize, this.fontSize * .3, this.label.textAlign, g.f(color))
  }

  paint(color = this.shape.colorn, force = false ) {
    return this.shape.paint(color, force);
  }

  /**
   * Repaint the stage with button visible or not.
   *
   * Allow Chrome to finish stage.update before proceeding with afterUpdate().
   *
   * Other code can watch this.blocked; then call updateWait(false) to reset.
   * @param hide true to hide and disable the turnButton
   * @param afterUpdate callback ('drawend') when stage.update is done [none]
   * @param scope thisArg for afterUpdate [this TurnButton]
   * @deprecated use easeljs-lib afterUpdate(container, function)
   */
  updateWait(hide: boolean, afterUpdate?: (evt?: Object, ...args: any) => void, scope: any = this) {
    this.blocked = hide;
    this.visible = this.mouseEnabled = !hide
    // using @thegraid/easeljs-module@^1.1.8: on(once=true) will now 'just work'
    afterUpdate && this.stage.on('drawend', afterUpdate, scope, true)
    this.stage.update()
  }
}

export class EdgeShape extends Shape {
  constructor(public color: string, public hex: Hex2, public dir: HexDir, parent: Container) {
    super()
    this.reset()
    parent.addChild(this);
  }
  reset(color = this.color) { this.graphics.c().ss(12, 'round', 'round').s(color) }
}
