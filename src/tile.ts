import { C, Constructor, S, className, stime } from "@thegraid/common-lib";
import { CenterText, NamedContainer } from "@thegraid/easeljs-lib";
import { DisplayObject, MouseEvent, Rectangle, Text } from "@thegraid/easeljs-module";
import { type GamePlay } from "./game-play";
import { Hex1, IHex2 } from "./hex";
import { AliasLoader } from "./image-loader";
import type { Player } from "./player";
import { C1, HexShape, Paintable, PaintableShape, TileShape } from "./shapes";
import type { DragContext, Dragable, Table } from "./table";
import { TP } from "./table-params";
import { TileSource } from "./tile-source";

export function rightClickable(dobj: DisplayObject, onRightClick: (evt: MouseEvent) => void) {
  const ifRightClick = (evt: MouseEvent) => {
    const nevt = evt.nativeEvent;
    if (nevt.button === 2) {
      onRightClick(evt);
      nevt.preventDefault();           // evt is non-cancelable, but stop the native event...
      nevt.stopImmediatePropagation(); // TODO: prevent Dragger.clickToDrag() when button !== 0
    }
  };
  dobj.on(S.click, ifRightClick as any, dobj, false, {}, true); // TS fails with overload
}

/** Someday refactor: all the cardboard bits (Tiles, Meeples & Coins) */
class Tile0 extends NamedContainer {
  /** Easy access to single/current GamePlay. */
  static gamePlay: GamePlay;

  constructor(Aname: string) {
    super(Aname);
    this.baseShape = this.makeShape();
  }

  public gamePlay = Tile.gamePlay;
  public player?: Player;
  get pColor() { return this.player?.color }
  get recycleVerb(): string { return 'demolished'; }

  get radius() { return TP.hexRad };
  baseShape: Paintable;

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
  addImageBitmap(name: string, at = this.numChildren - 1, size?: number) {
    const bm = AliasLoader.loader.getBitmap(name, size);
    bm.y -= Tile.textSize / 2;
    this.addChildAt(bm, at);
    return bm;      // bm.image undefined if image not loaded!
  }

  /** Default is TileShape; a HexShape with translucent disk.
   * add more graphics with paint(colorn)
   * also: addImageBitmap() to add child image from AliasLoader
   */
  makeShape(): Paintable {
    return new TileShape(this.radius);
  }

  /** paint with PlayerColor; updateCache()
   * @param colorn [pColor ?? grey] color for this Tile
   */
  paint(colorn = this.pColor ?? C1.grey) {
    this.baseShape.paint(colorn); // set or update baseShape.graphics
    this.updateCache();           // push graphics to bitmapCache
  }

  /**
   * reset bounds and cache
   * @param b [undefined] new bounds or undefined to use computed bounds
   * @param uncached [false] if true: set bounds but do not set cache (unusual)
   * @returns the new bounds
   */
  setCache(b?: Rectangle, uncached = false ) {
    const rad = this.radius;
    this.setBoundsNull(); // remove old bounds
    if (this.cacheID) {
      this.uncache();             // remove bounds from old cache
    }
    // use given bounds OR computed bounds OR default minimal bounds
    b = b ?? this.getBounds() ?? { x: -rad, y: -rad, width: 2 * rad, height: 2 * rad };
    this.setBounds(b.x, b.y, b.width, b.height);    // set computed bounds
    this.cache(b.x, b.y, b.width, b.height, TP.cacheTiles); // cache & bounds
    return b;
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
    unitSource: new (type: Constructor<Tile>, p: Player, hex: IHex2) => TS,
    // IF (per-player) static source: TileSource[] ELSE static source: TileSource
    type: Constructor<T> & { source: TileSource<T>[] | TileSource<T> },
    player: Player,
    hex: IHex2,
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
  /** When Tile is associated with a TileSource. */
  source: TileSource<Tile>;

  // Tile
  constructor(
    /** typically: className-serial; may be supplied as 'name' or undefined */
    Aname: string,
    /** the owning Player. */
    player?: Player,
  ) {
    super(Aname)
    Tile.allTiles.push(this);
    const cName = Aname?.split('-')[0] ?? className(this); // className is subject to uglification!
    this.name = cName;  // used for saveState!
    if (!Aname) this.Aname = `${cName}-${Tile.allTiles.length}`;
    const rad = this.radius;
    if (TP.cacheTiles > 0) this.cache(-rad, -rad, 2 * rad, 2 * rad, TP.cacheTiles);
    this.addChild(this.baseShape);
    this.nameText = this.addTextChild(rad / 2);
    if (player !== undefined)
      this.setPlayerAndPaint(player);  // dubious: subclasses are not yet constructed!
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
  fromHex: IHex2;
  /** override hook to deselect/stopDragging a Tile. */
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

  /** Tile is owned by Player: color it */
  setPlayerAndPaint(player: Player | undefined) {
    this.player = player;
    this.paint(player?.color);
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

  /**
   * Install onRightClick(evt) handler on this Tile.
   * @param onRightClick [(evt)=this.onRightClick(evt)]
   */
  rightClickable(onRightClick = (evt: MouseEvent) => this.onRightClick(evt)) {
    rightClickable(this, onRightClick);
  }

  /** default rightClick handler for this Tile. */
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

  /** map.showMark(ctx.targetHex); override for alternate showMark. */
  showTargetMark(hex: IHex2 | undefined, ctx: DragContext) {
    ctx.targetHex?.map.showMark(ctx.targetHex); // else prev mark still showing
  }

  /**
   * Invoked for each mouseMove when dragging this Tile.
   *
   * hex.isLegal was already set by dragStart [for ALL Hex]
   *
   * set ctx.targetHex = hex?.isLegal ? hex : this.fromHex;
   *
   * then this.dragFunc(hex, ctx);
   *
   * @param hex Hex under this Tile
   * @param ctx
   */
  dragFunc0(hex: IHex2 | undefined, ctx: DragContext): void {
    ctx.targetHex = hex?.isLegal ? hex : this.fromHex;
    this.showTargetMark(hex, ctx);
    this.dragFunc(hex, ctx);
  }

  /**
   * this Tile is being dragged.
   *
   * default: [return] just let it drag until it's dropped.
   * @param hex Hex under this Tile
   * @param ctx full context: ctrl/shift, nLegal, info, targetHex
   */
  dragFunc(hex: IHex2 | undefined, ctx: DragContext) {
    return;
  }

  /**
   * entry point from Table.dropFunc;
   *
   * Invoke this.dropFunc() then showMark(undefined);
   */
  dropFunc0(hex: IHex2, ctx: DragContext) {
    this.dropFunc(ctx.targetHex, ctx);
    ctx.targetHex?.map.showMark(undefined); // if (this.fromHex === undefined)
  }

  /**
   * Tile.dropFunc; override to give game-specific or tile-specific behavior.
   *
   * default: this.placeTile(targetHex)
   * @param targetHex last legal Hex this Tile was over. (may be fromHex)
   * @param ctx DragContext
   */
  dropFunc(targetHex: IHex2, ctx: DragContext) {
    this.placeTile(targetHex);
  }

  /**
   * Indicates if given Player is allowed to dragStart this Tile.
   * @param player typically: this.gamePlay.curPlayer
   * @param ctx the dragStart context
   * @returns a 'reason' string if cant be moved, undefined if can be moved.
   */
  cantBeMovedBy(player: Player, ctx: DragContext): string | boolean | undefined {
    return (ctx?.lastShift || this.player === undefined || this.player === player) ? undefined : 'Not your Tile';
  }

  /**
   * Invoked before checking isLegalTarget;
   *
   * Tile has not yet been moved: tile.hex is still tile.fromHex.
   *
   * default: [return] override as necessary.
   */
  dragStart(ctx: DragContext) {
    return;
  }

  /** state of shiftKey has changed during drag */
  dragShift(shiftKey: boolean | undefined, ctx: DragContext) { }

  /**
   * When this Tile starts a drag,
   * run setLegal() on all Hex of given Table to identify legal targets.
   *
   * All Hex is table.newHexes and table.hexMap.hexAry.
   * - does not include table.recycleHex, so that may need special treatment.
   *
   * @param table acces to newHexes and hexMap
   * @param setLegal [default: hex.isLegal = false] or countLegalHexes/isLegalTarget
   * @param ctx DragContext if needed
   */
  markLegal(table: Table, setLegal = (hex: IHex2) => { hex.isLegal = false; }, ctx: DragContext = table.dragContext) {
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
    if ((this.hex as IHex2)?.isOnMap && !ctx?.lastShift) return false;
    return true;
  }

  isLegalRecycle(ctx: DragContext) {
    return true;
  }

  /** Called by table.dragStart() if there are no legal targets for this Tile.
   *
   * unless recycleHex.isLegal, stopDragging();
   */
  noLegalTarget(ctx: DragContext) {
    if (!this.gamePlay.recycleHex?.isLegal) {
      this.gamePlay.table.stopDragging(); // actually, maybe let it drag, so we can see beneath...
    }
    // const cause = this.gamePlay.failToBalance(this) ?? '';
    // const [infR, coinR] = this.gamePlay.getInfR(this);
    // this.gamePlay.logText(`No placement for ${this.andInfStr} ${cause} infR=${infR} coinR=${coinR}`, 'Tile.noLegal')
  }

  logRecycle(verb: string) {
    const cp = this.gamePlay.curPlayer;
    const loc = this.hex?.isOnMap ? 'onMap' : 'offMap';
    const info = { Aname: this.Aname, fromHex: this.fromHex?.Aname, cp: cp.plyrId, tile: {...this} }
    console.log(stime(this, `.recycleTile[${loc}]: ${verb}`), info);
    this.gamePlay.logText(`${cp.Aname} ${verb} ${this}`, `GamePlay.recycle`);
  }
}

/** A plain WHITE tile; for Debt */
export class WhiteTile extends Tile {
  // TileShape does not work here:
  override makeShape() { return new HexShape(this.radius); }

  /** always C.WHITE */
  override paint(colorn?: string): void {
    super.paint(C.WHITE); // TODO: using cgf
  }
}

/** a half-sized Tile. */
export class Token extends Tile {

  override makeShape(): PaintableShape {
    return new HexShape(this.radius * .5);
  }

}

/**
 * Tiles that can be played to the Map, and generally stay where they are dropped.
 *
 * Tiles that are moved around on the map are classed as Meeple.
 */
export class MapTile extends Tile {

}
