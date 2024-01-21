import { C, Constructor, S, className, stime } from "@thegraid/common-lib";
import { CenterText } from "@thegraid/easeljs-lib";
import { Bitmap, Container, MouseEvent, Text } from "@thegraid/easeljs-module";
import type { GamePlay } from "./game-play";
import { Hex1, Hex2 } from "./hex";
import { AliasLoader } from "./image-loader";
import type { Player } from "./player";
import { C1, HexShape, PaintableShape, TileShape } from "./shapes";
import type { DragContext, Dragable, Table } from "./table";
import { PlayerColor, TP } from "./table-params";
import { TileSource } from "./tile-source";


/** Someday refactor: all the cardboard bits (Tiles, Meeples & Coins) */
class Tile0 extends Container {
  static gamePlay: GamePlay;
  // constructor() { super(); }

  public gamePlay = Tile.gamePlay;
  public player?: Player;
  get pColor() { return this.player?.color }
  get recycleVerb(): string { return 'demolished'; }

  /**
   * this.addChildAt(new Bitmap(loader.getImage(name)), at);
   *
   * image is scaled to fit given size.
   * centered above Tile.textSize
   * @param name from AliasLoader.loader.imap.keys();
   * @param at [numChildern - 1]
   * @param size [TP.hexRad] bitmap.scale = size / max(img.width, img.height)
   * @return new Bitmap() containing the named image (no image if name was not loaded)
   */
  addImageBitmap(name: string, at = this.numChildren - 1, size = TP.hexRad) {
    const bm = AliasLoader.loader.getBitmap(name);
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, at);
    return bm;      // bm.image undefined if image not loaded!
  }

  get radius() { return TP.hexRad };
  baseShape: PaintableShape = this.makeShape();

  /** Default is TileShape; a HexShape with translucent disk.
   * add more graphics with paint(colorn)
   * also: addBitmapImage()
   */
  makeShape(): PaintableShape {
    return new TileShape(this.radius);
  }

  /** paint with PlayerColor; updateCache()
   * @param pColor the 'short' PlayerColor
   * @param colorn the actual color (default = TP.colorScheme[pColor])
   */
  paint(pColor = this.player?.color, colorn = pColor ?? C1.grey) {
    this.baseShape.paint(colorn); // set or update baseShape.graphics
    this.updateCache();           // push graphics to bitmapCache
  }

}

/** all the [Hexagonal] game pieces that appear; can be dragged/dropped.
 *
 * Two subspecies: MapTile are 'stationary' on the HexMap, Meeple are 'mobile'.
 */
export class Tile extends Tile0 implements Dragable {
  static allTiles: Tile[] = [];
  static textSize = 20 * TP.hexRad / 60;
  // static source: any[] = [];

  static makeSource0<T extends Tile, TS extends TileSource<T>>(
    unitSource: new (type: Constructor<Tile>, p: Player, hex: Hex2) => TS,
    // IF (per-player) static source: TileSource[] ELSE static source: TileSource
    type: Constructor<T> & { source: TileSource<T>[] | TileSource<T> },
    player: Player,
    hex: Hex2,
    n = 0,
  ) {
    const source = new unitSource(type, player, hex);
    if (player) {
      (type.source as TileSource<T>[])[player.index] = source;
    } else {
      (type.source as TileSource<T>) = source;
    }
    // Create initial Tile/Units:
    for (let i = 0; i < n; i++) {
      const unit = new type(player, i + 1, );
      source.availUnit(unit);
    }
    source.nextUnit();  // unit.moveTo(source.hex)
    return source as TS;
  }
  source: TileSource<Tile>;

  // Tile
  constructor(
    /** typically: className-serial; may be supplied as 'name' or undefined */
    public readonly Aname?: string,
    /** the owning Player. */
    player?: Player,
  ) {
    super()
    Tile.allTiles.push(this);
    const cName = Aname?.split('-')[0] ?? className(this); // className is subject to uglification!
    this.name = cName;  // used for saveState!
    if (!Aname) this.Aname = `${cName}-${Tile.allTiles.length}`;
    const rad = this.radius;
    if (TP.cacheTiles > 0) this.cache(-rad, -rad, 2 * rad, 2 * rad, TP.cacheTiles);
    this.addChild(this.baseShape);
    this.setPlayerAndPaint(player);
    this.nameText = this.addTextChild(rad / 2);
  }

  nameText: Text;
  setNameText(name: string) {
    this.nameText.text = name.replace(/-/g, '\n');
    const nlines = this.nameText.text.split('\n').length - 1;
    this.nameText.y = (nlines == 0) ? 0 : - nlines * this.nameText.getMeasuredHeight() / 4;
    this.updateCache();
  }
  // for BalMark:
  // get nB() { return 0; }
  // get nR() { return 0; }
  // get fB() { return 0; }
  // get fR() { return 0; }

  /** location at start-of-game & after-Recycle; Meeple & Civic; Policy: sendHome -> sendToBag */
  homeHex!: Hex1;
  /** location at start-of-drag */
  fromHex: Hex2;
  isDragable(ctx?: DragContext) { return true; }

  _hex: Hex1 | undefined;
  /** the map Hex on which this Tile sits. */
  get hex() { return this._hex; }
  /** only one Tile on a Hex, Tile on only one Hex */
  set hex(hex: Hex1 | undefined) {
    if (this.hex?.tile === this) this.hex.tile = undefined;
    this._hex = hex;
    if (hex !== undefined) hex.tile = this;
  }

  override updateCache(compositeOperation?: string): void {
    if (!this.cacheID) return;
    super.updateCache(compositeOperation)
  }

  setPlayerAndPaint(player: Player | undefined) {
    this.player = player;
    this.paint(undefined, player?.color);
    return this;
  }

  override toString(): string {
    return `${this.Aname}@${this.hex?.Aname ?? this.fromHex?.Aname ?? '?'}`;
  }


  /** name in set of filenames loaded in GameSetup
   * @param at = 2; above HexShape
   */
  override addImageBitmap(name: string, at = 2) {
    let bm = super.addImageBitmap(name, at);
    this.updateCache();
    return bm;
  }

  addTextChild(y0 = this.radius / 2, text = this.Aname?.replace(/-/g, '\n'), size = Tile.textSize, vis = false) {
    const nameText = new CenterText(text, size);
    nameText.y = y0;         // Meeple overrides in constructor!
    nameText.visible = vis;
    this.addChild(nameText);
    return nameText;
  }

  textVis(vis = !this.nameText.visible) {
    this.nameText.visible = vis
    this.updateCache()
  }

  rightClickable() {
    const ifRightClick = (evt: MouseEvent) => {
      const nevt = evt.nativeEvent;
      if (nevt.button === 2) {
        this.onRightClick(evt);
        nevt.preventDefault();           // evt is non-cancelable, but stop the native event...
        nevt.stopImmediatePropagation(); // TODO: prevent Dragger.clickToDrag() when button !== 0
      }
    };
    this.on(S.click, ifRightClick as any, this, false, {}, true); // TS fails with overload
  }

  onRightClick(evt: MouseEvent) {
    console.log(stime(this, `.rightclick: ${this}`), this);
  }

  overSet(tile: Tile) {
    tile.parent && console.log(stime(this, `.overSet: removeChild: ${tile}`), tile)
    tile.parent?.removeChild(tile);         // moveBonusTo/sendHome may do this.
  }

  // Tile
  /** Post-condition: tile.hex == hex; low-level, physical move.
   *
   * calls this.source.nextUnit() if tile was dragged from this.source.
   */
  moveTo(hex: Hex1 | undefined) {
    const fromHex = this.fromHex;
    this.hex = hex;       // may collide with source.hex.meep, setUnit, overSet?
    if (this.source && fromHex === this.source.hex && fromHex !== hex) {
      this.source.nextUnit()   // shift; moveTo(source.hex); update source counter
    }
  }

  /** Tile.dropFunc() --> placeTile (to Map, reserve, ~>auction; not Recycle); semantic move/action. */
  placeTile(toHex: Hex1 | undefined, payCost = false) {
    this.gamePlay.placeEither(this, toHex, payCost);
  }

  resetTile() {            // Tile: x,y = 0;
    this.x = this.y = 0;
  }

  /**
   * After Capture or Recycle/Replace.
   * Post-condition: !tile.hex.isOnMap; tile.hex = this.homeHex may be undefined [UnitSource, AuctionTile, BonusTile]
   */
  sendHome() {  // Tile
    this.resetTile();
    this.moveTo(this.homeHex) // override for AuctionTile.tileBag & UnitSource<Meeple>
    if (!this.homeHex) this.parent?.removeChild(this);
    const source = this.source;
    if (source) {
      source.availUnit(this);
      if (!source.hex.tile) source.nextUnit();
    }
  }

  showTargetMark(hex: Hex2 | undefined, ctx: DragContext) {
    ctx.targetHex = hex?.isLegal ? hex : this.fromHex;
    ctx.targetHex?.map.showMark(ctx.targetHex);
  }

  /**
   * Augment Table.dragFunc0().
   *
   * isLegal already set;
   * record ctx.targetHex & showMark() when Tile is over a legal targetHex.
   */
  dragFunc0(hex: Hex2 | undefined, ctx: DragContext) {
    this.showTargetMark(hex, ctx);
  }

  /** entry point from Table.dropFunc; delegate to this.dropFunc() */
  dropFunc0(hex: Hex2, ctx: DragContext) {
    this.dropFunc(ctx.targetHex, ctx);
    ctx.targetHex?.map.showMark(undefined); // if (this.fromHex === undefined)
  }

  cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    return (ctx?.lastShift || this.player === undefined || this.player === player) ? undefined : "Not your Tile";
  }

  /** override as necessary. */
  dragStart(ctx: DragContext) {  }

  /** state of shiftKey has changed during drag */
  dragShift(shiftKey: boolean | undefined, ctx: DragContext) { }

  /** with recycleHex: override with:
   *
   * - this.gamePlay.recycleHex.isLegal = this.isLegalRecycle(ctx); // do not increment ctx.nLegal!
   * - OR! class RecycleHex override markLegal to handle this!
   */
  markLegal(table: Table, setLegal = (hex: Hex2) => { hex.isLegal = false; }, ctx: DragContext = table.dragContext) {
    table.newHexes.forEach(setLegal);
    table.hexMap.forEachHex(setLegal);
  }

  /**
   * Override in AuctionTile, Civic, Meeple/Leader
   * @param toHex a potential targetHex (table.hexUnderObj(dragObj.xy))
   */
  isLegalTarget(toHex: Hex1, ctx?: DragContext) {
    if (!toHex) return false;
    if (!!toHex.tile) return false; // note: from AuctionHexes to Reserve overrides this.
    if (toHex.meep && !(toHex.meep.player === this.gamePlay.curPlayer)) return false; // QQQ: can place on non-player meep?
    if ((this.hex as Hex2)?.isOnMap && !ctx?.lastShift) return false;
    return true;
  }

  isLegalRecycle(ctx: DragContext) {
    return true;
  }

  /**
   * Tile.dropFunc; Override in AuctionTile, Civic, Meeple/Leader.
   * @param targetHex Hex2 this Tile is over when dropped (may be undefined; see also: ctx.targetHex)
   * @param ctx DragContext
   */
  dropFunc(targetHex: Hex2, ctx: DragContext) {
    this.placeTile(targetHex);
  }

  noLegal() {
    // const cause = this.gamePlay.failToBalance(this) ?? '';
    // const [infR, coinR] = this.gamePlay.getInfR(this);
    // this.gamePlay.logText(`No placement for ${this.andInfStr} ${cause} infR=${infR} coinR=${coinR}`, 'Tile.noLegal')
  }

  logRecycle(verb: string) {
    const cp = this.gamePlay.curPlayer;
    const loc = this.hex?.isOnMap ? 'onMap' : 'offMap';
    const info = { Aname: this.Aname, fromHex: this.fromHex?.Aname, cp: cp.colorn, tile: {...this} }
    console.log(stime(this, `.recycleTile[${loc}]: ${verb}`), info);
    this.gamePlay.logText(`${cp.Aname} ${verb} ${this}`, `GamePlay.recycle`);
  }
}

/** A plain WHITE tile; for Debt */
export class WhiteTile extends Tile {
  // TileShape does not work here:
  override makeShape() { return new HexShape(this.radius); }

  override paint(pColor?: PlayerColor, colorn?: string): void {
    super.paint(pColor, C.WHITE); // TODO: using cgf
  }
}

/** a half-sized Tile. */
export class Token extends Tile {

  override makeShape(): PaintableShape {
    return new HexShape(this.radius * .5);
  }

}

/** Tiles that can be played to the Map: AuctionTile, Civic, Monument, BonusTile */
export class MapTile extends Tile {

}
