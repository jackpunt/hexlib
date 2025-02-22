import { AT, C, Constructor, F, S, stime, XY, XYWH } from "@thegraid/common-lib";
import { afterUpdate, Dispatcher, Dragger, DragInfo, DropdownStyle, KeyBinder, NamedContainer, NamedObject, ParamGUI, ParamItem, RectShape, ScaleableContainer, UtilButton } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, Graphics, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { EBC, PidChoice } from "./choosers";
import { TileEvent, type GamePlay } from "./game-play";
import type { GameState } from "./game-state";
import { Hex, HexM, HexMap, IdHex, IHex2, RecycleHex } from "./hex";
import { AliasLoader } from "./image-loader";
import { Player } from "./player";
import { PlayerPanel } from "./player-panel";
import { HexShape } from "./shapes";
import { playerColor0, playerColor1, TP } from "./table-params";
import { TextLog } from "./text-log";
import { Tile } from "./tile";
import { TileSource } from "./tile-source";
//import { TablePlanner } from "./planner";

export interface Dragable {
  dragFunc0(hex: IHex2, ctx: DragContext): void;
  dropFunc0(hex: IHex2, ctx: DragContext): void;
}

/** to own file... */
class TablePlanner {
  constructor(gamePlay: GamePlay) { }
}
interface StageTable extends Stage {
  table: Table;
}

export interface DragContext {
  targetHex: IHex2;     // last isLegalTarget() or fromHex; with showMark()
  lastShift?: boolean;  // true if Shift key is down
  lastCtrl?: boolean;   // true if control key is down
  info: DragInfo;       // we only use { first, event }
  tile?: Tile;          // the Tile being dragged (drop -> undefined)
  nLegal: number;       // number of legal drop tiles (excluding recycle)
  gameState: GameState; // gamePlay.gameState; holds .gamePlaye & .table
  phase?: string;       // gameState.state?.Aname: keyof GameState.states
}

/** layout display components, setup callbacks to GamePlay.
 *
 * uses a HexMap\<IHex2\>
 */
export class Table extends Dispatcher {
  /** last created Table */
  static table: Table
  static stageTable(obj: DisplayObject) {
    return (obj.stage as StageTable).table
  }

  gamePlay: GamePlay;
  stage: Stage;
  bgRect: Shape
  hexMap: HexM<IHex2>; // from gamePlay.hexMap

  paramGUIs: ParamGUI[];
  netGUI: ParamGUI; // paramGUIs[2]
  /** initial visibility for toggleText */
  initialVis = false;
  /** scale to radius */
  sr(v = .5) { return v * TP.hexRad / 60 } // scale to hexRad

  undoCont: Container = new NamedContainer('undoCont');
  undoShape: Shape = new Shape();
  skipShape: Shape = new Shape();
  redoShape: Shape = new Shape();
  undoText: Text = new Text('', F.fontSpec(this.sr(30)));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(this.sr(30)));  // length of history stack
  winText: Text = new Text('', F.fontSpec(this.sr(40)), 'green')
  winBack: Shape = new Shape(new Graphics().f(C.nameToRgbaString("lightgrey", .6)).r(this.sr(-180), this.sr(-5), this.sr(360), this.sr(130)))

  dragger: Dragger
  /**
   * constructor for newHex2() off-map Hex.
   *
   * typically: this.hexC = this.hexMap.hexC as Constructor\<IHex2\> */
  hexC: Constructor<IHex2>;

  readonly overlayCont = new NamedContainer('overlay');
  constructor(stage: Stage) {
    super();
    // backpointer so Containers can find their Table (& curMark)
    Table.table = (stage as StageTable).table = this;
    this.stage = stage
    this.scaleCont = this.makeScaleCont() // scaleCont & background
    this.scaleCont.addChild(this.overlayCont); // will add again at top/end of the list.
    if (!!this.stage.canvas) {
      this.bindKeysToScale(this.scaleCont);
      this.bindArrowKeys();
      this.bindKeys();
    }
  }
  /** shows the last TP.numPlayers start of turn lines */
  turnLog = new TextLog('turnLog', TP.numPlayers);
  /** show [13] other interesting log strings */
  textLog = new TextLog('textLog', TP.textLogLines);

  /** write '// ${turn}: ${line}' comment line to TextLog (& console) & logWriter */
  logText(line: string, from = '', toConsole = true) {
    const text = this.textLog.log(`${this.gamePlay.turnNumber}: ${line}`, from || '***', toConsole); // scrolling lines below
    this.gamePlay.logWriter.writeLine(`// ${text}`);
    // JSON string, instead of JSON5 comment:
    // const text = this.textLog.log(`${this.gamePlay.turnNumber}: ${line}`, from); // scrolling lines below
    // this.gamePlay.logWriter.writeLine(`"${line}",`);
  }

  logCurPlayer(plyr: Player) {
    const tn = this.gamePlay.turnNumber
    const robo = plyr.useRobo ? AT.ansiText(['red', 'bold'], "robo") : "----";
    const info = { turn: tn, gamePlay: this.gamePlay, curPlayer: plyr, plyr: plyr.Aname }
    console.log(stime(this, `.logCurPlayer --${robo}--`), info);
    this.logTurnPlayer(`//${tn}: ${plyr.Aname}`);
  }

  logTurnPlayer(line: string) {
    this.turnLog.log(line, 'table.logTurn', false); // in top two lines
  }

  /**
   * also: enableHexInspector(this.undoCont)
   *
   * @param bgr bgRect
   * @param row placement of UndoCont [8]
   * @param col placement of UndoCont [-7]
   *
   * @param undoButtons [false] build the undo/redo buttons:
   * @param xOffs offset to Red & Green arrows [55]
   * @param bSize size of Red & Green arrows [60]
   * @param skipRad size of Skip button/square [45]
   *
     * @returns
   */
  setupUndoButtons(bgr: XYWH, row = 8, col = -7, undoButtons = false, xOffs = 55, bSize = 60, skipRad = 45) {
    const undoC = this.undoCont; // holds the undo buttons.
    this.setToRowCol(undoC, row, col);
    const progressBg = new Shape(), bgw = this.sr(200), bgym = this.sr(140), y0 = 0; // bgym = 240
    const bgc = C.nameToRgbaString(TP.bgColor, .8);
    progressBg.graphics.f(bgc).r(-bgw / 2, y0, bgw, bgym - y0);
    undoC.addChildAt(progressBg, 0)
    this.enableHexInspector()
    this.dragger.makeDragable(undoC)
    if (!undoButtons) return

    this.skipShape.graphics.f("white").dp(0, 0, this.sr(40), 4, 0, skipRad)
    this.undoShape.graphics.f("red").dp(this.sr(-xOffs), 0, this.sr(bSize), 3, 0, 180);
    this.redoShape.graphics.f("green").dp(this.sr(+xOffs), 0, this.sr(bSize), 3, 0, 0);
    this.undoText.x = this.sr(-52); this.undoText.textAlign = "center"
    this.redoText.x = this.sr(+52); this.redoText.textAlign = "center"
    this.winText.x = 0; this.winText.textAlign = "center"
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = this.sr(-14);
    undoC.addChild(this.redoText); this.redoText.y = this.sr(-14);
    let bgrpt = this.bgRect.parent.localToLocal(bgr.x, bgr.h, undoC)
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
    let aiControl = this.aiControl('pink', this.sr(75)); aiControl.x = 0; aiControl.y = this.sr(100);
    let pmy = 0;
    undoC.addChild(aiControl)
    undoC.addChild(this.winBack);
    undoC.addChild(this.winText);
    this.winText.y = Math.min(pmy, bgrpt.y) // 135 = winBack.y = winBack.h
    this.winBack.visible = this.winText.visible = false
    this.winBack.x = this.winText.x; this.winBack.y = this.winText.y;
  }
  showWinText(msg?: string, color = 'green') {
    this.winText.text = msg || "COLOR WINS:\nSTALEMATE (10 -- 10)\n0 -- 0"
    this.winText.color = color
    this.winText.visible = this.winBack.visible = true
    this.hexMap.update()
  }
  enableHexInspector(qY = this.sr(52), cont = this.undoCont) {
    const qShape = new HexShape(this.sr(20));
    qShape.name = 'qShape';
    qShape.paint(C.BLACK);
    qShape.y = qY;  // size of 'skip' Triangles
    cont.addChild(qShape);
    this.dragger.makeDragable(qShape, this,
      // dragFunc:
      (qShape: DisplayObject, ctx?: DragInfo) => { },
      // dropFunc:
      (qShape: DisplayObject, ctx?: DragInfo) => {
        this.downClick = true;
        const hex = this.hexUnderObj(qShape, false);  // also check hexCont!
        qShape.x = 0; qShape.y = qY; // return to regular location
        cont.addChild(qShape);
        if (!hex) return;
        const info = hex; //{ hex, stone: hex.playerColor, InfName }
        console.log(`HexInspector:`, hex.Aname, info)
      })
    qShape.on(S.click, () => this.toggleText(), this); // toggle visible
    return qShape;
  }

  downClick = false;
  isVisible = false;
  /** invoked by enableHexInspector or KeyBinding:
   *
   * gamePlay.allTiles.textVis(vis); hexMap.hex.showText(vis);
   */
  toggleText(vis: boolean = !this.isVisible) {
    if (this.downClick) { this.downClick = false; return } // skip one 'click' when pressup/dropfunc
    this.isVisible = vis;
    this.gamePlay.allTiles?.forEach(tile => tile.textVis(vis));
    this.hexMap?.forEachHex(hex => hex.showText(vis))
    this.hexMap?.update()               // after toggleText & updateCache()
    return;
  }

  cacheScale = TP.cacheTiles;
  /**
   * re-cache all Tiles with alternate cacheScale; improves resolution at high zoom.
   *
   * Alternate invocations return cacheScale to 0 (un-cached)
   * @param setScale [TP.cacheTiles === 0] set true to force setting, undefined to toggle
   * @param cacheScale [max(1, scaleCont.scaleX)] set to use specific scale
   */
  reCacheTiles(setCache = (TP.cacheTiles === 0), cacheScale?: number) {
    this.cacheScale = cacheScale ?? Math.max(1, this.scaleCont.scaleX); // If zoomed in, use that higher scale
    const scale = TP.cacheTiles = setCache ? this.cacheScale : 0;
    console.log(stime('GamePlay', `.reCacheTiles: `), { setCache: setCache, scale, scaleX: this.scaleCont.scaleX.toFixed(2) });
    this.gamePlay.allTiles.forEach(tile => {
      tile.reCache(scale);  // uncache if (scale == 0)
    });
    this.hexMap.update();
  }

  aiControl(color = TP.bgColor, dx = 100, rad = 16) {
    let table = this
    // c m v on buttons
    let makeButton = (dx: number, bc = TP.bgColor, tc = TP.bgColor, text: string, key = text) => {
      let cont = new Container(); cont.name = 'aiControl'
      let circ = new Graphics().f(bc).drawCircle(0, 0, rad)
      let txt = new Text(text, F.fontSpec(rad), tc)
      txt.y = - rad / 2
      txt.textAlign = 'center'
      txt.mouseEnabled = false
      cont.x = dx
      cont.addChild(new Shape(circ))
      cont.addChild(txt)
      cont.on(S.click, (ev) => { KeyBinder.keyBinder.dispatchChar(key) })
      return cont
    }
    let bpanel = new Container(); bpanel.name = 'bpanel';
    let c0 = TP.colorScheme[playerColor0], c1 = TP.colorScheme[playerColor1]
    let cm = "rgba(100,100,100,.5)"
    let bc = makeButton(-dx, c0, c1, 'C', 'c')
    let bv = makeButton(dx, c1, c0, 'V', 'v')
    let bm = makeButton(0, cm, C.BLACK, 'M', 'm'); bm.y -= 10
    let bn = makeButton(0, cm, C.BLACK, 'N', 'n'); bn.y += rad * 2
    let bs = makeButton(0, cm, C.BLACK, ' ', ' '); bs.y += rad * 5
    bpanel.addChild(bc)
    bpanel.addChild(bv)
    bpanel.addChild(bm)
    bpanel.addChild(bn)
    bpanel.addChild(bs)
    return bpanel
  }

  /** all the non-map hexes created by newHex2; included in Tile.markLegal() */
  newHexes: IHex2[] = [];
  /**
   * create an off-map Hex2; push to this.newHexes[]
   * @param row [0] aligned with hexMap
   * @param col [0] aligned with hexMap
   * @param name hex.Aname & hex.distText
   * @param claz extends Hex2
   * @returns the new Hex2
   */
  newHex2(row = 0, col = 0, name: string, claz: Constructor<IHex2> = this.hexC) {
    const hex = new claz(this.hexMap, row, col, name);
    hex.distText.text = name;
    this.newHexes.push(hex);
    return hex
  }

  /** if hextowns wants the half-row offset, they can override as follows: */
  newHex2a(row = 0, col = 0, name: string, claz: Constructor<IHex2> = this.hexC, sy = 0) {
    const hex = this.newHex2(row, col, name, claz); // super.newHex2(...)
    if (row <= 0) {
      hex.y += (sy + row * .5 - .75) * (this.hexMap.radius);
    }
    return hex;
  }

  /**
   * all numbers in units of dxdc or dydr
   * @param x0 frame left [-1]; relative to scaleCont (offset from bgRect to hexCont)
   * @param y0 frame top [.5]; relative to scaleCont
   * @param w0 pad width [10]; width of bgRect, beyond hexCont, centered on hexCont
   * @param h0 pad height [1]; height of bgRect, beyond hexCont, centered on hexCont
   * @param dw extend bgRect to the right, not centered [0]
   * @param dh extend bgRect to the bottom, not centered [0]
   * @returns XYWH of a rectangle around mapCont hexMap
   */
  bgXYWH(x0 = -1, y0 = .5, w0 = 10, h0 = 1, dw = 0, dh = 0) {
    const hexMap = this.hexMap;
    // hexCont is offset to be centered on mapCont (center of hexCont is at mapCont[0,0])
    // mapCont is offset [0,0] to scaleCont
    const mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont);

    // background sized for hexMap:
    const { width, height } = hexCont.getBounds(); // & .setBounds() ??
    const { dxdc, dydr } = hexMap.xywh();
    const { x, y, w, h } = { x: x0 * dxdc, y: y0 * dydr, w: width + w0 * dxdc, h: height + h0 * dydr }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = x + w / 2;
    mapCont.y = y + h / 2;
    // THEN: extend bgRect by (dw, dh):
    return { x, y, w: w + dw * dxdc, h: h + dh * dydr };
  }

  /**
   * @example
   * Inject gamePlay, gamePlay.hexMap and hexC;
   * setBackground(scaleCont, this.bgXYWH)
   * hexCont.cache(hexCont.getBounds());
   * layoutTable2();
   * makePerPlayer();
   * setupUndoButtons();
   * layoutTurnlog();
   */
  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay;
    this.hexMap = gamePlay.hexMap as HexMap<IHex2>;
    this.hexC = this.hexMap.hexC;

    const xywh = this.bgXYWH();              // override bgXYHW() to supply default/arg values
    const hexCont = this.hexMap.mapCont.hexCont, hexp = this.scaleCont;
    this.bgRect = this.setBackground(this.scaleCont, xywh); // bounded by xywh
    const { x, y, width, height } = hexCont.getBounds();
    hexCont.cache(x, y, width, height); // cache hexCont (bounded by bgr)

    this.layoutTable2(); // supply args (mapCont?) if necessary;
    this.makePerPlayer();

    this.setupUndoButtons(xywh) // & enableHexInspector()

    this.layoutTurnlog();

    // this.namedOn("playerMoveEvent", S.add, this.gamePlay.playerMoveEvent, this.gamePlay)// legacy from hexline:
  }

  layoutTurnlog(rowy = 4, colx = -13) {
    const parent = this.scaleCont;
    this.setToRowCol(this.turnLog, rowy, colx);
    this.setToRowCol(this.textLog, rowy, colx);
    this.textLog.y += this.turnLog.height(TP.numPlayers + 1); // allow room for 1 line per player

    parent.addChild(this.turnLog, this.textLog);
    parent.stage.update();
  }

  // col locations, left-right mirrored:
  colf(pIndex: number, icol: number, row: number) {
    const dc = 10 - Math.abs(row) % 2;
    const col = (pIndex == 0 ? (icol) : (dc - icol));
    return { row, col };
  }

  /**
   * After setBackground() & hexCont.cache(); before makePerPlayer();
   *
   * Whatever: make overlays, score panel, extra tracks (auction...)
   */
  layoutTable2() {
    afterUpdate(this.stage, () => setTimeout(() => this.toggleText(this.initialVis), 10));
    return;
  }

  /**
   * Make ParamGUI with a background RectShape, and make it dragable.
   * @param makeGUI a function(Container, x?, y?) to create a ParamGUI
   * @param name of the Container to hold the ParamGUI
   * @param cx location of Container on scaleCont: cx * scale
   * @param cy location of Container on scaleCont: cy * scale
   * @param scale [TP.hexRad / 60] Container scaleX, scaleY
   * @param d border size of background RectShape around/behind GUI Container
   * @returns the gui returned from makeGUI(Table, Ccntainer)
   */
  gpanel(makeGUI: (cont: Container, x?: number, y?: number) => ParamGUI, cx: number, cy: number, scale = 1, d = 5) {
    const gui = makeGUI.call(this, this.scaleCont, cx, cy);
    // gui.x -= (gui.linew + d);         // Chooser-lines go to left, text to right
    gui.scaleX = gui.scaleY = scale;  // make guiC larger when hexRad is larger (b/c scaleC will be zoomed down)
    gui.x *= scale; gui.y *= scale;
    const bgr = new RectShape({ x: -d, y: -d, w: gui.linew + 2 * d, h: gui.ymax + 2 * d }, 'rgb(200,200,200,.5)', '');
    gui.addChildAt(bgr, 0);
    this.dragger.makeDragable(gui);
    this.stage.update()
    return gui;
  }
  /**
   * makeNetworkGUI(parent) -> gui3.ymax
   * makeParamGUI(parent)   -> gui1.ymax
   * makeParamGUI2(parent)  -> gui2.ymax
   */
  makeGUIs(scale = this.sr(1), cx = -200, cy = 250, dy = 20) {
    const scaleCont = this.scaleCont;
    let wmax = 0, ymax = 0;
    const guiWYmax = (gui: ParamGUI) => {
      ymax += (gui.ymax + dy);
      wmax = Math.max(wmax, (gui.children[0] as RectShape).getBounds().width)
      return gui;
    }
    const guis = [this.makeNetworkGUI, this.makeParamGUI, this.makeParamGUI2].map(mgf => {
      return guiWYmax(this.gpanel(mgf, cx, cy + ymax, scale))
    })
    guis.forEach(gui => gui.x -= wmax)
    scaleCont.addChild(...guis.reverse()); // lower y values ABOVE to dropdown is not obscured
    // TODO: dropdown to use given 'top' container!
    scaleCont.stage.update();
  }

  /** height allocated for PlayerPanel scaled in row height [map.rows/3-.2] */
  get panelHeight() { return (2 * TP.nHexes - 1) / 3 - .2; }
  /** width of PlayerPanel, scaled in hex width [4.5] */
  get panelWidth() { return 4.5; }

  /**
   * Center of each Panel location: [row, col, dir][].
   *
   * col==0 is on left edge of hexMap; The *center* hex is col == (nHexes-1)
   * @example
   * P0  ---  P3
   * P1 --C-- P4
   * P2  ---  P5
   */
  getPanelLocs() {
    const { nh, mh } = this.hexMap.getSize();
    const rC = this.hexMap.centerHex.row, ph = this.panelHeight + .2;
    const cc = this.hexMap.centerHex.col, coff = nh + (this.panelWidth / 2);
    // Left of map (dir: +1), Right of map (dir: -1)
    const cL = cc - coff, cR = cc + coff;
    const locs: [row: number, col: number, dir: 1 | -1][] = [
        [rC - ph, cL, +1], [rC, cL, +1], [rC + ph, cL, +1],
        [rC - ph, cR, -1], [rC, cR, -1], [rC + ph, cR, -1]
    ];
    return locs;
  }
  /**
   * Which PanelLocs to use (in order) for a given number of Players
   * @param np number of Players
   * @returns array of indices into PanelLocs (one for each Player)
   */
  panelLocsForNp(np: number) {
    return [[], [0], [0, 3], [0, 3, 1], [0, 3, 4, 1], [0, 3, 4, 2, 1], [0, 3, 4, 5, 2, 1]][np];
  }

  /** Panel location for the nth of nPlayers.
   *
   * @param pIndex Player index (0 .. nPlayers-1)
   * @param nPlayers [allPlayers.length] total number of Players
   * @param panelLocs [getPanelLocs] potential panel locations
   * @return panelLocs[panelLocsForNp(nPlayers)][pIndex]
   */
  panelLoc(pIndex: number, nPlayers = TP.numPlayers, panelLocs = this.getPanelLocs()) {
    const np = Math.min(nPlayers, TP.maxPlayers, panelLocs.length);
    const locs = this.panelLocsForNp(np);
    const ndx = locs[Math.min(pIndex, np - 1)];
    return panelLocs[ndx];
  }

  /**
   *
   * @param table
   * @param player
   * @param high panelHeight
   * @param wide adjust to suit
   * @param row from panelLoc
   * @param col from panelLoc
   * @param dir from panelLoc
   * @returns new PlayerPanel(table, player, high, wide, row - high / 2, col - wide / 2, dir)
   */
  makePlayerPanel(
    table: Table,
    player: Player,
    high: number,
    wide: number,
    row: number,
    col: number,
    dir = -1) {
      return new PlayerPanel(table, player, high, wide, row - high / 2, col - wide / 2, dir)
    }

  readonly allPlayerPanels: PlayerPanel[] = [];
  /** make player panels, placed at panelLoc... */
  makePerPlayer() {
    this.allPlayerPanels.length = 0; // TODO: maybe deconstruct
    const high = this.panelHeight, wide = this.panelWidth;
    const locs = this.getPanelLocs();
    this.gamePlay.forEachPlayer((player, pIndex) => {
      const [row, col, dir] = this.panelLoc(pIndex, TP.numPlayers, locs);
      const panel = this.makePlayerPanel(this, player, high, wide, row, col, dir);
      this.allPlayerPanels[pIndex] = player.panel = panel;
      player.makePlayerBits();
      this.setPlayerScore(player);
    });
  }

  /** move cont to metric [row, col] of hexCont
   *
   * see also: HexMap.xyFromMap(target, row, col)
   * @param cont could be the HexCont of a UnitSourceHex or a panel or ...
   */
  setToRowCol(cont: Container, row = 0, col = 0, hexCont = this.hexMap.mapCont.hexCont) {
    if (!cont.parent) this.scaleCont.addChild(cont); // localToLocal requires being on stage
    //if (cont.parent !== hexCont) debugger;
    const cHex = this.hexMap.centerHex;
    const { x, y, dxdc, dydr } = cHex.xywh(cHex.radius);
    const xx = x + (col - cHex.col) * dxdc;
    const yy = y + (row - cHex.row) * dydr;
    hexCont.localToLocal(xx, yy, cont.parent, cont);
  }

  /** display source [and legalMark] on given hex [Ankh] */
  sourceOnHex(source: TileSource<Tile>, hex: IHex2) {
    if (source?.counter) source.counter.mouseEnabled = false;
    hex.legalMark.setOnHex(hex);
    hex.cont.visible = false;
  }
  /**
   * Make a row of hexC that appear above panel at [row0, 0] (but are not children of panel)
   * Suitable for Tile.makeSource0(...,)
   *
   * The row is centered across the width of panel (based on getBounds().width)
   *
   * Sets hex.visible = false;
   * @param panel offset new Hexes to appear above given Container
   * @param row0 [.75] offset in y direction
   * @param colN [4] number of Hex to create
   * @param hexC [this.hexC]
   * @param opts
   * @param - vis [false] initial visiblity
   * @param - gap [0] space between columns
   *
   * @returns hexC[] with each hex.cont.xy offset to appear over panel
   */
  hexesOnPanel(panel: Container, row0 = .75, colN = 4, hexC: Constructor<IHex2> = this.hexC, opts?: { vis?: boolean, gap?: number }) {
    const { vis, gap } = { vis: false, gap: 0, ...opts }
    const rv = [] as IHex2[], map = this.hexMap;
    const { x: x0, y: y0 } = map.xyFromMap(panel, 0, 0); // offset from hexCont to panel
    const { width: panelw } = panel.getBounds();
    const { x: xn, dydr, dxdc } = this.hexMap.xywh(undefined, 0, colN - 1); // x of last cell
    const gpix = gap < 1 ? gap * dxdc : gap;
    const dx = (panelw - xn - (colN - 1) * gpix) / 2, dy = row0 * dydr; // allocate any extra space (wide-xn) to either side
    for (let col = 0; col < colN; col++) {
      // make hex at row=0, then offset by row0 !? legacy from hextowns half-offset?
      const hex = this.newHex2(0, col, `C${col}`, hexC); // child of map.mapCont.hexCont
      rv.push(hex);
      hex.cont.x += (dx - x0 + col * gpix);
      hex.cont.y += (dy - y0);
      hex.cont.visible = vis;
      hex.legalMark.setOnHex(hex)
    }
    return rv;
  }

  /**
   * newHex2(row, col, name, claz) with the ${name} image on top. [legacy from hextowns]
   *
   * Typically: invoke from layoutTable() or layoutTable2()
   * @param row [TP.nHexes + 3.2] below the centerline
   * @param col [0] toward the left edge
   * @param name ['Recycle'] hex.Aname and name of image to use
   * @param claz [RecycleHex]
   * @returns
   */
  makeRecycleHex(row = TP.nHexes + 3.2, col = 0, name = 'Recycle', claz = RecycleHex) {
    const image = AliasLoader.loader.getBitmap(name);

    const rHex = this.newHex2(row, col, name, claz);
    this.setToRowCol(rHex.cont, row, col);
    rHex.rcText.visible = rHex.distText.visible = false;
    rHex.setHexColor(C.WHITE);
    rHex.cont.addChild(image);
    rHex.cont.updateCache();
    return rHex;
  }

  /** Params that affect the rules of the game & board
   *
   * ParamGUI   --> board & rules []
   * ParamGUI2  --> AI Player     []
   * NetworkGUI --> network       []
   */
  makeParamGUI(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'right' });
    gui.name = (gui as NamedObject).Aname = 'ParamGUI';
    const gameSetup = this.gamePlay.gameSetup;
    gui.makeParamSpec('hexRad', [30, 60, 90, 120], { fontColor: 'red' }); TP.hexRad;
    gui.makeParamSpec('nHexes', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { fontColor: 'red' }); TP.nHexes;
    gui.makeParamSpec('mHexes', [1, 2, 3], { fontColor: 'red' }); TP.mHexes;
    gui.spec("hexRad").onChange = (item: ParamItem) => { gameSetup.restart({ hexRad: item.value }) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { gameSetup.restart({ nh: item.value }) }
    gui.spec("mHexes").onChange = (item: ParamItem) => { gameSetup.restart({ mh: item.value }) }

    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines();
    return gui
  }

  /** configures the AI player */
  makeParamGUI2(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'center' })
    gui.name = (gui as NamedObject).Aname = 'AIGui';
    gui.makeParamSpec("log", [-1, 0, 1, 2], { style: { textAlign: 'right' } }); TP.log
    gui.makeParamSpec("maxPlys", [1, 2, 3, 4, 5, 6, 7, 8], { fontColor: "blue" }); TP.maxPlys
    gui.makeParamSpec("maxBreadth", [5, 6, 7, 8, 9, 10], { fontColor: "blue" }); TP.maxBreadth
    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines()
    return gui
  }

  netColor: string = "rgba(160,160,160, .8)"
  netStyle: DropdownStyle = { textAlign: 'right' };
  /** controls multiplayer network participation */
  makeNetworkGUI(parent: Container, x = 0, y = 0) {
    const gui = this.netGUI = new ParamGUI(TP, this.netStyle)
    gui.name = (gui as NamedObject).Aname = 'NetGUI';
    gui.makeParamSpec("Network", [" ", "new", "join", "no", "ref", "cnx"], { fontColor: "red" })
    gui.makeParamSpec("PlayerId", ["     ", 0, 1, 2, 3, "ref"], { chooser: PidChoice, fontColor: "red" })
    gui.makeParamSpec("networkGroup", [TP.networkGroup], { chooser: EBC, name: 'gid', fontColor: C.GREEN, style: { textColor: C.BLACK } }); TP.networkGroup

    gui.spec("Network").onChange = (item: ParamItem) => {
      if (['new', 'join', 'ref'].includes(item.value)) {
        const chooser = gui.findLine('networkGroup').chooser as EBC;
        const group = chooser.editBox.innerText
        // this.gamePlay.closeNetwork()
        // this.gamePlay.network(item.value, gui, group)
      }
      // if (item.value === "no") this.gamePlay.closeNetwork()     // provoked by ckey
    }
    (this.stage.canvas as HTMLCanvasElement)?.parentElement?.addEventListener('paste', (ev) => {
      const text = ev.clipboardData?.getData('Text');
      const chooser = gui.findLine('networkGroup').chooser as EBC;
      chooser.setValue(text);
    });
    this.showNetworkGroup()
    parent.addChild(gui)
    gui.x = x; gui.y = y;
    gui.makeLines()
    return gui
  }

  showNetworkGroup(group_name = TP.networkGroup) {
    (document.getElementById('group_name') as HTMLInputElement).innerText = group_name;
    const line = this.netGUI.findLine("networkGroup"), chooser = line?.chooser;
    chooser?.setValue(group_name, chooser.items[0], undefined);
  }

  doneButton: UtilButton;
  doneClicked(evt?: any, data?: any) {
    if (this.doneButton) this.doneButton.visible = false;
    this.gamePlay.phaseDone(data);   // <--- main doneButton does not supply 'panel'
  }

  /**
   * Add a [singleton] DoneButton to the given panel/Container.
   * - Single instance: change text, color and even location
   * - still invokes the same onClick callback
   *
   * Modal button to end current phase and proceed to the next.
   *
   * cont._doneListener: S.click invokes this.doneClicked(evt, data);
   * - you can add & manage additional listeners
   * - addDoneButton() to *same* cont removes previous _doneListener.
   *
   * May be contained or placed with ActionSelection buttons [ankh].
   *
   * UtilButton: textColor is BLACK or WHITE to contrast with button.paint(color)
   *
   * @param cont [scaleCont] a Container to hold the DoneButton (& _doneListener)
   * @param cx [0] offset in Container (to 'center', 'left', 'right' per align)
   * @param cy [0] offset in Container (to top of text box)
   * @param align ['center'] 'left' or 'right' for textAlign
   * @param data included in callback to doneClicked(evt, data)
   * @returns this.doneButton
   */
  addDoneButton(cont?: Container, cx = 0, cy = 0, align = 'center', data?: any) {
    cont = cont ?? this.doneButton?.parent ?? this.scaleCont
    // Store the 'on' listener on the parent container:
    const parent = cont as Container & { _doneListener: Function, _doneButton: UtilButton };
    const doneButton = new UtilButton('Done', { bgColor: 'lightgreen', fontSize: this.sr(30) });
    parent._doneButton?.removeEventListener(S.click, parent._doneListener);
    parent._doneButton = this.doneButton = doneButton;
    parent._doneListener = doneButton.on(S.click, (evt, data?: any) => this.doneClicked(evt, data), this, false, data);
    doneButton.label.textAlign = align; // Note: baseline is still 'middle'
    const { x, y, width: w, height: h } = doneButton.getBounds()
    doneButton.name = 'doneButton';
    doneButton.x = cx - 0;     // XY is the top-right corner, align extends to left
    doneButton.y = cy - y;     // XY is the top-right corner, align extends to left
    parent.addChild(doneButton);
    return doneButton;
  }

  /** override to show player score on table/panel */
  setPlayerScore(plyr: Player, score = 0, rank?: number) {
  }

  /** update table when a new Game is started.
   *
   * default: [allTiles.makeDragable(); setNextPlayer(gamePlay.turnNumber)]
   *
   * A Tile or class of Tile may stopDragging() due to noLegalTargets().
   */
  startGame() {
    this.scaleCont.addChild(this.overlayCont); // now at top of the list.
    // All Tiles (& Meeple) are Dragable: (Note: if noLegal then stopDragging)
    this.gamePlay.allTiles.forEach(tile => {
      this.makeDragable(tile);
    });

    // this.stage.enableMouseOver(10);
    this.gamePlay.setNextPlayer(this.gamePlay.turnNumber > 0 ? this.gamePlay.turnNumber : 0);
  }

  /**
   * makeDragable & clickToDrag
   * @param tile a Tile with .dragFunc0() and .markLegal()
   */
  makeDragable(tile: Tile) {
    this.dragger.makeDragable(tile, this, this.dragFunc, this.dropFunc);
    this.dragger.clickToDrag(tile, true); // also enable clickToDrag;
  }

  hexUnderObj(dragObj: DisplayObject, legalOnly = true) {
    return this.hexMap.hexUnderObj(dragObj, legalOnly);
  }

  dragContext: DragContext;
  /** Direct callback from this.dragger. Invoke this.dragFunc0(tile, info, hexUnderTile) */
  dragFunc(tile: DisplayObject, info?: DragInfo) {
    const hex = this.hexUnderObj(tile); // clickToDrag 'snaps' to non-original hex!
    this.dragFunc0(tile as Tile, info, hex);
  }

  /** Table.dragFunc0
   *
   * Version of Table.dragFunc used to inject drag/start actions programatically.
   *
   * Calls out to Tile.dragFunc0(IHex2, DragContext)
   * @param tile is being dragged
   * @param info { first: boolean, event: MouseEvent }
   * @param hex the IHex2 which tile is currently over (may be undefined or off map)
   */
  dragFunc0(tile: Tile, info?: DragInfo, hex = this.hexUnderObj(tile)) {
    let ctx = this.dragContext;
    if (info?.first) {
      if (ctx?.tile) {
        // clickToDrag intercepting a drag in progress!
        // click should have hit the drag target to drop it
        // mouse not over drag object! fix XY in call to dragTarget()
        // OR dragger.dragTarget() invoked while drag in progress...
        // OR fail to clear stageDrag/stagemousemove
        console.warn(stime(this, `.dragFunc0: OOPS! maybe adjust XY on dragTarget`), ctx);
        this.stopDragging(ctx.targetHex); // stop original drag
        this.dragger.stopDrag();          // stop new drag;  this.dropFunc(ctx.tile, ctx.info);
        return;
      }
      const event = info.event?.nativeEvent;
      tile.fromHex = tile.hex as IHex2;  // dragStart: set tile.fromHex when first move!
      // create and record a DragContext for this drag:
      const gameState = this.gamePlay.gameState;
      ctx = {
        tile: tile,                  // ASSERT: hex === tile.hex
        targetHex: tile.fromHex,     // last isLegalTarget() or fromHex
        lastShift: event?.shiftKey,
        lastCtrl: event?.ctrlKey,
        info: info,
        nLegal: 0,
        gameState,   // access to .table, .gamePlay
        phase: gameState.state.Aname, // [ankh]
      }
      this.dragContext = ctx;
      if (!tile.isDragable(ctx)) {
        this.stopDragging(tile.fromHex); // just slide off this tile, no drag, no drop.
        return;
      }
      this.dragStart(tile, ctx);     // canBeMoved, isLegalTarget, tile.dragStart(ctx);
      if (!ctx.tile) return;         // stopDragging() was invoked
    }
    this.checkShift(hex, ctx);
    tile.dragFunc0(hex, ctx);        // tile is dragged over hex
  }

  /** invoke dragShift callback if shift state changes */
  checkShift(hex: IHex2 | undefined, ctx: DragContext) {
    const nativeEvent = ctx.info.event?.nativeEvent
    ctx.lastCtrl = nativeEvent?.ctrlKey;
    // track shiftKey because we don't pass 'event' to isLegalTarget(hex)
    const shiftKey = nativeEvent?.shiftKey;
    if (shiftKey !== ctx.lastShift || (hex && ctx.targetHex !== hex)) {
      ctx.lastShift = shiftKey;
      // do shift-down/shift-up actions...
      this.dragShift(ctx.tile, shiftKey, ctx); // was interesting for hexmarket
    }
  }

  /**
   * Try start dragging.
   * Abort if tile.cantBeMoved(player)
   *
   * Inform tile.dragStart(ctx)
   *
   * Mark all legal Hexes, set ctx.nLegal
   *
   * tile.moveTo(undefined); // dropFunc() will placeTile on targetHex/fromHex.
   *
   * Invoke tile.noLegalTarget(ctx) if nLegal === 0
   *
   * @param tile the Tile to be Dragged
   * @param ctx DragContext with shift/ctrl from table.dragFunc0()
   */
  dragStart(tile: Tile, ctx: DragContext) {
    // press SHIFT to capture [recycle] opponent's Criminals or Tiles
    const reason = tile.cantBeMovedBy(this.gamePlay.curPlayer, ctx);
    if (reason) {
      this.explainReason(tile, ctx, reason)
      this.stopDragging();
    } else {
      // mark legal targets for tile; SHIFT for all hexes, if payCost
      tile.dragStart(ctx); // prepare for isLegalTarget
      ctx.nLegal = this.markLegalHexes(tile, ctx);  // override-able
      tile.moveTo(undefined); // notify source Hex, so it can scale;
      this.hexMap.update();
      if (ctx.nLegal === 0) {
        tile.noLegalTarget(ctx);
      }
    }
  }
  /**
   * explain reason why dragStart cantBeMovedBy(curPlayer, ctx)
   * @param tile
   * @param ctx
   * @param reason as returned from cantBeMovedBy()
   */
  explainReason(tile: Tile, ctx: DragContext, reason?: string | boolean) {
    console.log(stime(this, `.dragStart: ${reason}: ${tile},`), 'ctx=', { ...ctx });
    // this.logText(`${reason}: ${tile}`, 'Table.dragStart');
  }

  /** invoked during dragStart(tile, ctx)
   *
   * set hex.isLegal = v ==> hex.legalMark.visible = v
   *
   * @return number of hexes marked as legal
   */
  markLegalHexes(tile: Tile, ctx: DragContext) {
    let nLegal = 0;
    const countLegalHexes = (hex: IHex2) => {
      if (hex !== tile.hex && tile.isLegalTarget(hex, ctx)) {
        hex.setIsLegal(true); // ==> legalMark.visible = true;
        nLegal += 1;
      }
    };
    tile.markLegal(this, countLegalHexes, ctx);           // delegate to check each potential target
    return nLegal;
  }

  /** state of shiftKey has changed during drag. call tile.dragShift(). */
  dragShift(tile: Tile | undefined, shiftKey: boolean | undefined, ctx: DragContext) {
    tile?.dragShift(shiftKey, ctx);
  }

  /** dropFunc for each Dragable/Tile -> tile.dropFunc0(hex, ctx) */
  dropFunc(dobj: DisplayObject, info?: DragInfo, hex = this.hexUnderObj(dobj)) {
    if (! (dobj instanceof Tile)) { debugger; }
    const tile = dobj as Tile;
    // invoke Tile.dropFunc0() which will delegate to Tile.dropFunc(targetHex, ctx)
    tile.dropFunc0(hex as IHex2, this.dragContext); // generally: hex == ctx.targetHex
    tile.markLegal(this); // hex => hex.isLegal = false;
    // this.gamePlay.recycleHex.isLegal = false;
    this.dragContext.lastShift = undefined;
    this.dragContext.tile = undefined; // mark not dragging
  }

  /** synthesize dragStart(tile), tile.dragFunc0(hex), dropFunc(tile);  */
  dragStartAndDrop(tile: Tile, toHex: Hex) {
    if (!tile) return; // C-q when no EventTile on eventHex
    const toHex2 = toHex as IHex2, info = { first: true } as DragInfo; // event: undefined
    this.dragFunc0(tile, info, tile.hex as IHex2); // table.dragStart(tile)->tile.dragstart(ctx); tile.dragFunc0(fromHex)
    tile.dragFunc0(toHex2, this.dragContext);      // tile.dragFunc0(toHex)
    this.dropFunc(tile, info, toHex2);             // table.dropFunc(toHex)->tile.dropFunc0(toHex,ctx)
  }

  /** the Tile being dragged or undefined. */
  protected get isDragging() { return this.dragger.dragCont.getChildAt(0); }

  /** Force this.dragger to drop the current drag object on given target Hex.
   *
   * without checking isLegalTarget();
   * @param targetHex where to drop Tile [this.dragContext.tile.fromHex]
   */
  stopDragging(targetHex = this.dragContext?.tile?.fromHex) {
    // console.log(stime(this, `.stopDragging: isDragging=`), this.isDragging)
    if (this.isDragging) {
      if (targetHex) this.dragContext.targetHex = targetHex;
      this.dragger.stopDrag(); // ---> dropFunc(this.dragContext.tile, info)
    }
    const data = this.dragger.getDragData(this.scaleCont);
    if (data) data.dragStopped = true;
  }

  /**
   * if (isDragging) stopDragging(targetHex); else startDragging(dragObj);
   * @param dragObj a DisplayObject to start dragging with dragTarget
   * @param xy offset from target to mouse pointer
   */
  dragTarget(dragObj?: DisplayObject, xy: XY = { x: this.sr(30), y: this.sr(30) }) {
    if (this.isDragging) {
      // drop current dragObj on last legal targetHex
      this.stopDragging(this.dragContext.targetHex) // drop and make move
    } else if (dragObj) {
      this.startDragging(dragObj, xy);
    }
  }

  startDragging(dragObj: DisplayObject, xy: XY = { x: 0, y: 0 }) {
    this.dragger.dragTarget(dragObj, xy);
  }

  showRedoUndoCount() {
    this.undoText.text = `${this.gamePlay.undoRecs.length}`
    this.redoText.text = `${this.gamePlay.redoMoves.length}`
  }
  /** log --> comment line to [console], TextLog, logWriter; showRedoUndoCount() */
  showNextPlayer(log: boolean = true) {
    let curPlayer = this.gamePlay.curPlayer // after gamePlay.setNextPlayer()
    if (log) this.logCurPlayer(curPlayer)
    this.showRedoUndoCount()
  }

  _tablePlanner: TablePlanner
  get tablePlanner() {
    return this._tablePlanner ??
      (this._tablePlanner = new TablePlanner(this.gamePlay))
  }
  /**
   * All manual moves feed through this (drop & redo)
   *
   * TablePlanner.logMove(); then dispatchEvent() --> gamePlay.doPlayerMove()
   *
   * New: let Meeple (Drag & Drop) do this.
   */
  doTableMove(ihex: IdHex) {
  }

  /** All moves (GUI & plannerMove) feed through here:
   *
   * gamePlay listens with playerMoveEvent(TileEvent)
   *
   * and eventually get to Player.doPlayerMove()
   */
  moveTileToHex(tile: Tile, ihex: IdHex) {
    const hex = this.hexMap.getHex(ihex);
    this.hexMap.showMark(hex);
    this.dispatchEvent(new TileEvent(S.add, tile, hex)) // -> GamePlay.playerMoveEvent(hex, sc)
  }

  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  scaleParams = { initScale: .125, scale0: .05, scaleMax: 4, steps: 30, zscale: .20, };

  readonly scaleCont: ScaleableContainer;
  /** makeScaleableBack and setup scaleParams
   * @param bindkeys true if there's a GUI/user/keyboard (Canvas)
   */
  makeScaleCont() {
    /** scaleCont: a scalable background */
    const scaleC = new ScaleableContainer(this.stage, this.scaleParams);
    this.dragger = new Dragger(scaleC);
    if (!!scaleC.stage.canvas) {
      // Special case of makeDragable; drag the parent of Dragger!
      this.dragger.makeDragable(scaleC, scaleC, undefined, undefined, true); // THE case where not "useDragCont"
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    return scaleC;
  }

  /** Space => dragTarget; 't' => toggleText */
  bindKeys() {
    KeyBinder.keyBinder.setKey('Space', () => this.dragTarget());
    KeyBinder.keyBinder.setKey('S-Space', () => this.dragTarget());
    KeyBinder.keyBinder.setKey('t', () => this.toggleText());

    // of dubious utility...
    KeyBinder.keyBinder.setKey("p", () => this.stage.getObjectsUnderPoint(500, 100, 1));

  }

  /** put a Rectangle Shape at (0,0) with XYWH bounds as given */
  setBackground(parent: Container, bounds: XYWH, bgColor = TP.bgColor) {
    // specify an Area that is Dragable (mouse won't hit "empty" space)
    const bgRect = new RectShape(bounds, bgColor, '') as RectShape & NamedObject;
    bgRect.Aname = "BackgroundRect";
    parent.addChildAt(bgRect, 0);
    return bgRect
  }

  viewA: View = { x: 436, y: 2, scale: .5, isk: 'a'}
  viewZ: View = { x: 120, y: 118, scale: 0.647, isk: 'z', ssk: 'x' };
  /**
   * Invoked after this.scaleCont has been set.
   *
   * View.x & View.y are screen coordinates for origin of scaleCont (pre-scale)
   *
   * type View = XY & { scale: number, isk: string, ssk?: string }
   * - isk is key to invoke the view; ssk is key to set the view.
   * @param scaleC the ScaleableContainer to be used
   * @param views bind isk (& ssk) for each supplied View
   * - if supplied, invoke views[0].isk to set initial scale.
   */
  bindKeysToScale(scaleC: ScaleableContainer, ...views: View[]) {
    /** save scale & offsets for later */
    const saveView = (view: View) => {
      view.scale = scaleC.scaleX;
      view.x = scaleC.x
      view.y = scaleC.y
    }
    // View holds scale & XY offset, saved by saveScaleZ()
    const invokeView = (view: View) => {
      this.setScaleXY(view.scale, view)
      this.stage.update()
    }
    if (!views.length) {
      views = [this.viewA, this.viewZ];
    }
    views.forEach(view => {
      KeyBinder.keyBinder.setKey(view.isk, () => invokeView(view));
      if (view.ssk)
        KeyBinder.keyBinder.setKey(view.ssk, () => saveView(view));
    })
    if (views?.[0]) KeyBinder.keyBinder.dispatchChar(views[0].isk)

  }
  /** reset scale to nearest index and set origin point directly. */
  setScaleXY(ns = 1.0, pt: XY = { x: 0, y: 0 }): number {
    const sc = this.scaleCont, ndx = sc.findIndex(ns);
    sc.getScale(ndx); // close appx, no side effects.
    sc.scaleInternal(0, ns, pt);
    return ndx;
  }
  setScaleOnly(ns = 1.0, pt = { x: 0, y: 0 }) {
    const sc = this.scaleCont, os = sc.scaleX, ndx = sc.findIndex(ns);
    sc.getScale(ndx); // close appx, no side effects.
    sc.x = (pt.x + (sc.x - pt.x) * ns / os);
    sc.y = (pt.y + (sc.y - pt.y) * ns / os);
    sc.scaleX = sc.scaleY = ns;
    return ndx;
  }

  // TODO: resetScale, zoom and pan as methods of ScaleableContainer?
  zoom(z = 1.1) {
    const stage = this.stage;
    if (!stage) return;
    const pxy = { x: stage.mouseX / stage.scaleX, y: stage.mouseY / stage.scaleY };
    this.setScaleOnly(z * this.scaleCont.scaleX, pxy);
    this.stage?.update();
  }

  pan(xy: XY) {
    this.scaleCont.x += xy.x;
    this.scaleCont.y += xy.y;
    this.stage?.update();
  }
  /**
   * * Left/Right => pan X
   * * S-left/right => pan X
   * * Up/Down => pan Y
   * * S-Up => zoom in
   * * S-Down => zoom out
   */
  bindArrowKeys() {
    // Scale-setting keystrokes:
    KeyBinder.keyBinder.setKey('S-ArrowUp', () => this.zoom(1.03))
    KeyBinder.keyBinder.setKey('S-ArrowDown', () => this.zoom(1 / 1.03))
    KeyBinder.keyBinder.setKey('ArrowLeft', () => this.pan({ x: - 10, y: 0 }))
    KeyBinder.keyBinder.setKey('S-ArrowLeft', () => this.pan({ x: -10, y: 0 }))
    KeyBinder.keyBinder.setKey('ArrowRight', () => this.pan({ x: 10, y: 0 }));
    KeyBinder.keyBinder.setKey('S-ArrowRight', () => this.pan({ x: 10, y: 0 }))
    KeyBinder.keyBinder.setKey('ArrowUp', () => this.pan({ x: 0, y: -10 }))
    KeyBinder.keyBinder.setKey('ArrowDown', () => this.pan({ x: 0, y: 10 }))
  }
}
type View = XY & { scale: number, isk: string, ssk?: string }

