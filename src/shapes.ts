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
