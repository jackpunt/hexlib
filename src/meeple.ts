import { C } from "@thegraid/common-lib";
import { PaintableShape, type NamedObject, type Paintable } from "@thegraid/easeljs-lib";
import { Shape } from "@thegraid/easeljs-module";
import type { Hex1 } from "./hex";
import type { Player } from "./player";
import type { DragContext } from "./table";
import { TP } from "./table-params";
import { Tile } from "./tile";

export class MeepleShape extends PaintableShape {
  static fillColor = 'rgba(225,225,225,.7)';
  static backColor = 'rgba(210,210,120,.5)'; // transparent light green

  constructor(public player: Player, public radius = TP.meepleRad) {
    super((color) => this.mscgf(color));
    this.y = TP.meepleY0;
    this.setMeepleBounds();
    this.backSide = this.makeOverlay();
  }
  /** extent of mscgf */
  setMeepleBounds(r = this.radius) {
    this.setBounds(-r, -r, 2 * r, 2 * r);
  }

  backSide: Shape;  // visible when Meeple is 'faceDown' after a move.
  makeOverlay(y0 = this.y) {
    const { x, width: r2 } = this.getBounds(); // x at left edge
    const over = new Shape();
    over.graphics.f(MeepleShape.backColor).dc(x + r2 / 2, y0, r2 / 2);
    over.visible = false;
    over.name = (over as NamedObject).Aname = 'backSide';
    return over;
  }

  /** stroke a ring of colorn, stroke-width = 2, r = radius-2; fill disk with (~WHITE,.7) */
  mscgf(color = this.player?.color ?? C.grey, ss = 2 * TP.hexRad / 60, rs = 0) {
    const r = this.radius;
    const g = this.graphics.c().ss(ss).s(color).f(MeepleShape.fillColor).dc(0, 0, r - rs - ss/2);  // disk & ring
    return g;
  }
}

/**
 * canonical base class for Meeples; ASSERT (.isMeep === true)
 */
export class Meeple extends Tile {
  static allMeeples: Meeple[] = [];

  override get isMeep() { return true; }
  get backSide() { return this.baseShape.backSide; }
  override get recycleVerb() { return 'dismissed'; }

  /**
   * Meeple - Leader, Police, Criminal
   * @param Aname
   * @param player (undefined for Chooser)
   */
  constructor(
    Aname: string,
    player?: Player,
  ) {
    super(Aname, player);
    this.addChild(this.backSide);
    this.player = player;
    this.nameText.visible = true;
    this.nameText.y = this.baseShape.y;
    // this.paint();
    Meeple.allMeeples.push(this);
  }


  /** Meeple.radius == TP.meepleRad; same for all instances */
  override get radius() { return TP.meepleRad } // 31.578 vs 60*.4 = 24
  override textVis(v: boolean) { super.textVis(true); }
  override makeShape(): Paintable { return new MeepleShape(this.player as Player, this.radius); }
  declare baseShape: MeepleShape;

  /** location at start-of-turn; for Meeples.unMove() */
  startHex?: Hex1;

  // we need to unMove meeples in the proper order; lest we get 2 meeps on a hex.
  // meepA -> hexC, meepB -> hexA; undo: meepA -> hexA (collides with meepB), meepB -> hexB
  // Assert: if meepA.startHex is occupied by meepB, then meepB is NOT on meepB.startHex;
  // So: recurse to move meepB to its startHex;
  // Note: with multiple/illegal moves, meepA -> hexB, meepB -> hexA; infinite recurse
  // So: remove meepA from hexB before moving meepB -> hexB
  unMove() {
    if (this.hex === this.startHex) return;
    this.placeTile(undefined, false);       // take meepA off the map;
    ;(this.startHex!.meep as Meeple)?.unMove(); // recurse to move meepB to meepB.startHex
    this.placeTile(this.startHex, false);   // Move & update influence; Note: no unMove for Hire! (sendHome)
    this.faceUp();
  }

  /** start of turn, faceUp(undefined) --> faceUp; moveTo(true|false) --> faceUp|faceDn */
  faceUp(up = true) {
    if (this.backSide) this.backSide.visible = !up;
    if (up && this.hex) this.startHex = this.hex; // set at start of turn.
    this.updateCache();
    if (this.hex?.isOnMap) this.gamePlay.hexMap.update();
  }

  override moveTo(hex: Hex1) {
    const destMeep = hex?.meep as Meeple;
    if (destMeep && destMeep !== this) {
      destMeep.x += 10; // make double occupancy apparent [until this.unMove()][hextowns]
      destMeep.unMove();
    }
    const fromHex = this.fromHex;
    super.moveTo(hex); // hex.set(meep) = this; this.x/y = hex.x/y
    this.faceUp(!(hex?.isOnMap && fromHex?.isOnMap && hex !== this.startHex));
  }

  /**
   * For Meeples that are constrained to move along a line from current hex.
   * @param toHex
   * @param fromHex [this.hex]
   * @returns true if hex0 and fromHex are on a line
   */
  isOnLine(toHex: Hex1, fromHex = this.hex as Hex1) {
    return !!fromHex.linkDirs.find(dir => fromHex.hexesInDir(dir).includes(toHex));
    // [from hextowns]
  }

  isLegalTarget0(hex: Hex1, ctx?: DragContext) {  // Meeple
    if (!hex) return false;
    if (hex.meep) return false;
    if (!hex.isOnMap) return false; // RecycleHex is "on" the map?
    if (!ctx?.lastShift && this.backSide.visible) return false;
    return true;
  }

  override isLegalTarget(toHex: Hex1, ctx?: DragContext) {  // Meeple
    return this.isLegalTarget0(toHex, ctx);
  }

  override isLegalRecycle(ctx: DragContext) {
    if (this.player === this.gamePlay.curPlayer) return true;
    return false;
  }

  override resetTile(): void {   // Meeple faceUp
    this.faceUp();
    this.startHex = undefined;
  }
}
