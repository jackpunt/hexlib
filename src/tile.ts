import { C, Constructor, S, className, stime } from "@thegraid/common-lib";
import { CenterText, NamedContainer, Paintable, PaintableShape } from "@thegraid/easeljs-lib";
import { DisplayObject, MouseEvent, Rectangle, Text } from "@thegraid/easeljs-module";
import { type GamePlay } from "./game-play";
import { Hex1, IHex2 } from "./hex";
import { AliasLoader } from "./image-loader";
import type { Player } from "./player";
import { HexShape, TileShape } from "./shapes";
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
  /**
   * @return [false] override to return true if this to be placed on hex.meep
   */
  get isMeep() { return false; }
  get pColor() { return this.player?.color }
  get recycleVerb(): string { return 'demolished'; }

  get radius() { return TP.hexRad };
  /** set in constructor, can override baseShape!: Paintable; */
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
  paint(colorn = this.pColor ?? C.grey, force?: boolean) {
    this.baseShape.paint(colorn, force); // set or update baseShape.graphics
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
 * Two subspecies: MapTile are 'stationary' on the HexMap, Meeple [.isMeep] are 'mobile'.
 */
export class Tile extends Tile0 implements Dragable {
  static readonly allTiles: Tile[] = [];
  static clearAllTiles() { Tile.allTiles.length = 0; }
  static textSize = 20 * TP.hexRad / 60;
  // static source: TileSource<Tile>[]; // base class Tile does not have a 'source'

  /**
   * @example
   * static TileClass.makeSource(hex: IHex2, player?: Player, n = 0) {
   *   Tile.makeSource0(TileSource<TileClass>, TileClass, hex, player, n);
   * }
   * - Set a new TileSource into [static] TileClass.source;
   * OR: If a Player is supplied:
   * - Set a new TileSource into [static] TileClass.source[player.index]
   *
   * @param TileSource the generic constructor: TileSource<T>
   * @param type the class/Constuctor T, the type of Tile/Unit to be sourced
   * @param hex indicates where nextUnit will place the Unit
   * @param player [undefined] if supplied place new Source in T.source[player.index]
   * @param n [0] create n units of type and insert into source
   * @returns the source; which is also set in T.source
   */
  static makeSource0<T extends Tile, TS extends TileSource<T>>(
    TileSource: new (type: Constructor<T>, hex: IHex2, p?: Player) => TS,
    // IF (per-player) static source: TileSource[] ELSE static source: TileSource
    type: Constructor<T> & { source: TileSource<T>[] | TileSource<T> },
    hex: IHex2,
    player?: Player,
    n = 0,
  ) {
    const unitSource = new TileSource(type, hex, player);
    if (player) {
      if (!type.source) type.source = [] as TileSource<T>[];
      (type.source as TileSource<T>[])[player.index] = unitSource;
    } else {
      (type.source as TileSource<T>) = unitSource;
    }
    // Create initial Tile/Units:
    for (let i = 0; i < n; i++) {
      const unit = new type(player, i + 1, );
      unitSource.availUnit(unit);
    }
    unitSource.nextUnit();  // unit.moveTo(source.hex)
    return unitSource as TS;
  }
  /** When Tile is associated with a TileSource; availUnit() sets this field. */
  source!: TileSource<Tile>;

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
    this.addChild(this.baseShape);
    this.nameText = this.addTextChild(rad / 2);
    if (player !== undefined)
      this.setPlayerAndPaint(player);  // dubious: subclasses are not yet constructed!
    this.reCache();// TP.cacheTiles ? use H.HexBounds()
  }

  nameText: Text;
  /** update nameText; replace(/-/g, '\n'); adjust y for nlines */
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
  homeHex?: Hex1;
  /** location at start-of-drag */
  fromHex: IHex2;
  /** override hook to deselect/stopDragging a Tile. */
  isDragable(ctx?: DragContext) { return true; }

  _hex: Hex1 | undefined;
  /** the map Hex on which this Tile sits. */
  get hex() { return this._hex; }
  /** only one Tile on a Hex, each Tile on only one Hex */
  set hex(hex: Hex1 | undefined) {
    if (this.isMeep ? (this.hex?.meep === this) : (this.hex?.tile === this))
      this.hex?.setUnit(undefined, this.isMeep)
    this._hex = hex;
    hex?.setUnit(this)
  }

  override updateCache(compositeOperation?: string): void {
    if (!this.cacheID) return;
    super.updateCache(compositeOperation)
  }

  /** re-cache Tile if children have changed size or visibility.
   *
   * uncache(), setBoundsNull(), setBounds(getBounds), maybe cache(scale)
   */
  reCache(scale = TP.cacheTiles) {
    if (this.cacheID) this.uncache();
    this.setBoundsNull(); // remove bounds
    const b = this.getBounds();    // of tileShape & InfoBox (vis or !vis, new Info)
    this.setBounds(b.x, b.y, b.width, b.height); // record for debugger
    if (scale > 0) this.cache(b.x, b.y, b.width, b.height, scale);
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

  /** addChild(new CenterText(text, size)); y = y0; visible = vis.
   *
   * from Ankh: text = Aname.replace(/-/g, '\n'); [Andro-sphinx, Cat-Mum]
   */
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
  /** Post-condition: tile.hex == hex; low-level, physical move. */
  moveTo(hex: Hex1 | undefined) {
    // const fromHex = this.fromHex;
    this.hex = hex;       // may collide with source.hex.meep, setUnit, overSet?
    // 13-dec-2024: project's tile.dropFunc() { if (!tile.source?.hex) tile.source?.nextUnit() }
    // if (this.source && fromHex === this.source.hex && fromHex !== hex) {
    //   this.source.nextUnit()   // shift; moveTo(source.hex); update source counter
    // }
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
   *
   * Post-condition: !tile.hex.isOnMap; tile.hex = this.homeHex may be undefined [UnitSource, AuctionTile, BonusTile]
   *
   * Note: v1.3 -- anhk/hextowns need to override to restore:
   * @example s=this.source && (s.availUnit(this), s.sourceHexUnit || s.nextUnit())
   */
  sendHome() {  // Tile
    this.resetTile();
    this.moveTo(this.homeHex) // override for AuctionTile.tileBag & UnitSource<Meeple>
    if (!this.hex) this.parent?.removeChild(this); // Note: Hex1.setUnit() --> addChild()
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
  markLegal(table: Table, setLegal = (hex: IHex2) => { hex.isLegal = false; }, ctx = table.dragContext) {
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

/** a half-sized Tile. [Ankh] */
export class Token extends Tile {

  override makeShape(colorn?: string): PaintableShape {
    return new HexShape(this.radius * .5, undefined, colorn);
  }
}

/**
 * Tiles that can be played to the Map, and generally stay where they are dropped.
 *
 * Tiles that are moved around on the map are classed as Meeple.
 */
export class MapTile extends Tile {

}
