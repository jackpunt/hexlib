import { C } from "@thegraid/common-lib";
import { afterUpdate, PaintableShape, TextInRect, type CGF, type TextInRectOptions, type TextStyle } from "@thegraid/easeljs-lib";
import { Graphics, Shape, Text } from "@thegraid/easeljs-module";
import type { IHex2 } from "./hex";
import { H } from "./hex-intfs";
import { TP } from "./table-params";

export class C1 {
  static GREY = 'grey';
  static grey = 'grey';
  static lightgrey2 = 'rgb(225,225,225)' // needs to contrast with WHITE influence lines
  static lightgrey_8 = 'rgb(225,225,225,.8)' // needs to contrast with WHITE influence lines
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

export type UtilButtonOptions = TextStyle & TextInRectOptions & {
  rollover?: (mouseIn: boolean) => void,
  active?: boolean,
  visible?: boolean,
}
// From ankh, 'done' button to move to next phase or action.
/** A CenterText in a TextInRect. */
export class UtilButton extends TextInRect {
  /**
   * Create Container with CenterText above a RectShape.
   *
   * on(rollover|rollout, this.rollover(mouseIn))
   *
   * initially visible & mouseEnabled, but deactivated.
   * @param label if string: new CenterText(label, fontSize, textColor)
   * @param options
   * * bgColor [undefined = C.WHITE] of the background
   * * border: [undefined = .3] for background, fraction of fontSize
   * * corner: [undefined = 0] corner radius of background
   * * fontSize: [TP.hexRad/2] if Text not supplied
   * * textColor: [C.BLACK] if Text not supplied
   * * visible: [false] initial visibility
   * * active: [false] supply true|false to activate(active, visible) including stage?.update()
   * @param cgf [tscgf] CGF for the RectShape
   */
  constructor(label: string | Text, options: UtilButtonOptions = {}, cgf?: CGF) {
    super(label, options, cgf)
    const { rollover, active, visible } = options;
    this.rollover = rollover ?? (() => {});

    this.on('rollover', () => this._active && this.rollover(true), this);
    this.on('rollout', () => this._active && this.rollover(false), this);
    this.mouseEnabled = this.mouseChildren = this._active = false;
    if (active !== undefined) {
      this.activate(active, visible); // this.stage?.update()
    } else {
      this.visible = !!options.visible;
    }
  }
  /** When activated, this.rollover(mouseIn) is invoked when mouse enter/exits this button. */
  rollover: (mouseIn: boolean) => void;
  _active = false;
  /** indicates if this button is currently activated. */
  get isActive() { return this._active; }
  /**
   * Activate (or deactivate) this UtilButton.
   *
   * When activated: visible, mouseEnabled, enable rollover(mouseIn).
   *
   * @param active [true] false to deactivate
   * @param visible [active] true or false to set this.visible
   * @returns this
   */
  activate(active = true, visible = active) {
    this.mouseEnabled = this._active = active;
    this.visible = visible;
    this.stage?.update();
    return this;
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
    if (hide) this.activate(false)
    // using @thegraid/easeljs-module@^1.1.8: on(once=true) will now 'just work'
    // using @thegraid/common-lib@^1.3.12: afterUpdate will always update
    afterUpdate(this, after, scope)
  }
}
