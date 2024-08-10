import { AT, C, CenterText, Constructor, Dragger, DragInfo, DropdownStyle, F, KeyBinder, ParamGUI, ParamItem, S, ScaleableContainer, stime, XY } from "@thegraid/easeljs-lib";
import { Container, DisplayObject, EventDispatcher, Graphics, MouseEvent, Shape, Stage, Text } from "@thegraid/easeljs-module";
import { NamedContainer, NamedObject, type GamePlay } from "./game-play";
import { Scenario } from "./game-setup";
import type { GameState } from "./game-state";
import { Hex, Hex2, HexMap, IdHex, RecycleHex } from "./hex";
import { XYWH } from "./hex-intfs";
import { Player } from "./player";
import { PlayerPanel } from "./player-panel";
import { CircleShape, HexShape, RectShape, UtilButton } from "./shapes";
import { PlayerColor, playerColor0, playerColor1, TP } from "./table-params";
import { Tile } from "./tile";
import { TileSource } from "./tile-source";
import { PidChoice, EBC } from "./choosers";
//import { TablePlanner } from "./planner";

function firstChar(s: string, uc = true) { return uc ? s.substring(0, 1).toUpperCase() : s.substring(0, 1) };

export type EventName = 'Claim' | 'Split' | 'Conflict' | 'merge' | 'redzone';
export interface ActionButton extends Container { isEvent: boolean, pid: number, rollover?: ((b: ActionButton, over: boolean) => void) }

export interface Dragable {
  dragFunc0(hex: Hex2, ctx: DragContext): void;
  dropFunc0(hex: Hex2, ctx: DragContext): void;
}

/** to own file... */
class TablePlanner {
  constructor(gamePlay: GamePlay) {}
}
interface StageTable extends Stage {
  table: Table;
}

type MinDragInfo = { first?: boolean, event?: MouseEvent };

export interface DragContext {
  targetHex: Hex2;      // last isLegalTarget() or fromHex
  lastShift?: boolean;  // true if Shift key is down
  lastCtrl?: boolean;   // true if control key is down
  info: DragInfo;       // we only use { first, event }
  tile?: Tile;          // the DisplayObject being dragged
  nLegal: number;       // number of legal drop tiles (excluding recycle)
  gameState?: GameState;// gamePlay.gameState
  phase?: string;       // keysof GameState.states
}

class TextLog extends NamedContainer {
  constructor(Aname: string, nlines = 6, public size: number = 30, public lead = 3) {
    super(Aname);
    this.lines = new Array<Text>(nlines);
    for (let ndx = 0; ndx < nlines; ndx++) this.lines[ndx] = this.newText(`//0:`)
    this.addChild(...this.lines);
  }

  lines: Text[];
  lastLine = '';
  nReps = 0;

  height(n = this.lines.length) {
    return (this.size + this.lead) * n;
  }

  clear() {
    this.lines.forEach(tline => tline.text = '');
    this.stage?.update();
  }

  private newText(line = '') {
    const text = new Text(line, F.fontSpec(this.size));
    text.textAlign = 'left';
    text.mouseEnabled = false;
    return text;
  }

  private spaceLines(cy = 0, lead = this.lead) {
    this.lines.forEach(tline => (tline.y = cy, cy += tline.getMeasuredLineHeight() + lead))
  }

  log(line: string, from = '', toConsole = true) {
    line = line.replace('/\n/g', '-');
    toConsole && console.log(stime(`${from}:`), line);
    if (line === this.lastLine) {
      this.lines[this.lines.length - 1].text = `[${++this.nReps}] ${line}`;
    } else {
      this.removeChild(this.lines.shift() as Text); // assert is not undefined
      this.lines.push(this.addChild(this.newText(line)));
      this.spaceLines();
      this.lastLine = line;
      this.nReps = 0;
    }
    this.stage?.update();
    return line;
  }
}

/** layout display components, setup callbacks to GamePlay */
export class Table {
  static table: Table
  static stageTable(obj: DisplayObject) {
    return (obj.stage as StageTable).table
  }

  disp: EventDispatcher;
  namedOn(Aname: string, type: string, listener: (eventObj: Object) => boolean, scope?: Object, once?: boolean, data?: any, useCapture = false) {
    const list2 = this.disp.on(type, listener, scope, once, data, useCapture) as NamedObject;
    list2.Aname = Aname;
  }

  gamePlay: GamePlay;
  stage: Stage;
  bgRect: Shape
  hexMap: HexMap<Hex2>; // from gamePlay.hexMap

  paramGUIs: ParamGUI[];
  netGUI: ParamGUI; // paramGUIs[2]
  /** initial visibility for toggleText */
  initialVis = false;

  undoCont: Container = new NamedContainer('undoCont');
  undoShape: Shape = new Shape();
  skipShape: Shape = new Shape();
  redoShape: Shape = new Shape();
  undoText: Text = new Text('', F.fontSpec(30));  // length of undo stack
  redoText: Text = new Text('', F.fontSpec(30));  // length of history stack
  winText: Text = new Text('', F.fontSpec(40), 'green')
  winBack: Shape = new Shape(new Graphics().f(C.nameToRgbaString("lightgrey", .6)).r(-180, -5, 360, 130))

  dragger: Dragger

  overlayCont = new Container();
  constructor(stage: Stage) {
    // super();
    EventDispatcher.initialize(this);
    this.disp = (this as any as EventDispatcher);
    this.overlayCont.name = 'overlay';
    // backpointer so Containers can find their Table (& curMark)
    Table.table = (stage as StageTable).table = this;
    this.stage = stage
    this.scaleCont = this.makeScaleCont(!!this.stage.canvas) // scaleCont & background
    this.scaleCont.addChild(this.overlayCont); // will add again at top/end of the list.
  }
  /** shows the last 2 start of turn lines */
  turnLog = new TextLog('turnLog', 2);
  /** show [13] other interesting log strings */
  textLog = new TextLog('textLog', TP.textLogLines);

  logTurn(line: string) {
    this.turnLog.log(line, 'table.logTurn'); // in top two lines
  }
  logText(line: string, from = '') {
    const text = this.textLog.log(`${this.gamePlay.turnNumber}: ${line}`, from || '***'); // scrolling lines below
    this.gamePlay.logWriter.writeLine(`// ${text}`);
    // JSON string, instead of JSON5 comment:
    // const text = this.textLog.log(`${this.gamePlay.turnNumber}: ${line}`, from); // scrolling lines below
    // this.gamePlay.logWriter.writeLine(`"${line}",`);
  }

  setupUndoButtons(xOffs: number, bSize: number, skipRad: number, bgr: XYWH, row = 8, col = -7) {
    const undoC = this.undoCont; // holds the undo buttons.
    this.setToRowCol(undoC, row, col);
    const progressBg = new Shape(), bgw = 200, bgym = 140, y0 = 0; // bgym = 240
    const bgc = C.nameToRgbaString(TP.bgColor, .8);
    progressBg.graphics.f(bgc).r(-bgw / 2, y0, bgw, bgym - y0);
    undoC.addChildAt(progressBg, 0)
    this.enableHexInspector()
    this.dragger.makeDragable(undoC)
    if (true && xOffs > 0) return

    this.skipShape.graphics.f("white").dp(0, 0, 40, 4, 0, skipRad)
    this.undoShape.graphics.f("red").dp(-xOffs, 0, bSize, 3, 0, 180);
    this.redoShape.graphics.f("green").dp(+xOffs, 0, bSize, 3, 0, 0);
    this.undoText.x = -52; this.undoText.textAlign = "center"
    this.redoText.x = 52; this.redoText.textAlign = "center"
    this.winText.x = 0; this.winText.textAlign = "center"
    undoC.addChild(this.skipShape)
    undoC.addChild(this.undoShape)
    undoC.addChild(this.redoShape)
    undoC.addChild(this.undoText); this.undoText.y = -14;
    undoC.addChild(this.redoText); this.redoText.y = -14;
    let bgrpt = this.bgRect.parent.localToLocal(bgr.x, bgr.h, undoC)
    this.undoText.mouseEnabled = this.redoText.mouseEnabled = false
    let aiControl = this.aiControl('pink', 75); aiControl.x = 0; aiControl.y = 100
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
  enableHexInspector(qY = 52, cont = this.undoCont) {
    const qShape = new HexShape(TP.hexRad/3);
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
  /** method invokes closure defined in enableHexInspector. */
  toggleText(vis?: boolean) {
    if (this.downClick) return (this.downClick = false, undefined) // skip one 'click' when pressup/dropfunc
    if (vis === undefined) vis = this.isVisible = !this.isVisible;
    Tile.allTiles.forEach(tile => tile.textVis(vis));
    this.hexMap.forEachHex<Hex2>(hex => hex.showText(vis))
    this.hexMap.update()               // after toggleText & updateCache()
    return undefined;
  }

  aiControl(color = TP.bgColor, dx = 100, rad = 16) {
    let table = this
    // c m v on buttons
    let makeButton = (dx: number, bc = TP.bgColor, tc = TP.bgColor, text: string, key = text) => {
      let cont = new Container(); cont.name='aiControl'
      let circ = new Graphics().f(bc).drawCircle(0, 0, rad)
      let txt = new Text(text, F.fontSpec(rad), tc)
      txt.y = - rad/2
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
    let bn = makeButton(0, cm, C.BLACK, 'N', 'n'); bn.y += rad*2
    let bs = makeButton(0, cm, C.BLACK, ' ', ' '); bs.y += rad*5
    bpanel.addChild(bc)
    bpanel.addChild(bv)
    bpanel.addChild(bm)
    bpanel.addChild(bn)
    bpanel.addChild(bs)
    return bpanel
  }

  /** all the non-map hexes created by newHex2 */
  newHexes: Hex2[] = [];
  newHex2(row = 0, col = 0, name: string, claz: Constructor<Hex2> = Hex2, sy = 0) {
    const hex = new claz(this.hexMap, row, col, name);
    hex.distText.text = name;
    if (row <= 0) {
      hex.y += (sy + row * .5 - .75) * (this.hexMap.radius);
    }
    this.newHexes.push(hex);
    return hex
  }

  noRowHex(name: string, crxy: { row: number, col: number }, claz?: Constructor<Hex2>) {
    const { row, col } = crxy;
    const hex = this.newHex2(row, col, name, claz);
    return hex;
  }

  /**
   * all number in units of dxdc or dydr
   * @param x0 frame left; relative to scaleCont
   * @param y0 frame top; relative to scaleCont
   * @param w0 pad width; width of bgRect, beyond hexCont, centered on hexCont
   * @param h0 pad height; height of bgRect, beyond hexCont, centered on hexCont
   * @param dw extend bgRect to the right, not centered
   * @param dh extend bgRect to the bottom, not centered
   * @returns XYWH of a rectangle around mapCont hexMap
   */
  bgXYWH(x0 = -1, y0 = .5, w0 = 10, h0 = 1, dw = 0, dh = 0) {
    const hexMap = this.hexMap;
    // hexCont is offset to be centered on mapCont (center of hexCont is at mapCont[0,0])
    // mapCont is offset [0,0] to scaleCont
    const mapCont = hexMap.mapCont, hexCont = mapCont.hexCont; // local reference
    this.scaleCont.addChild(mapCont);

    // background sized for hexMap:
    const { width, height } = hexCont.getBounds();
    const { dxdc, dydr } = hexMap.xywh;
    const { x, y, w, h } = { x: x0 * dxdc, y: y0 * dydr, w: width + w0 * dxdc, h: height + h0 * dydr }
    // align center of mapCont(0,0) == hexMap(center) with center of background
    mapCont.x = x + w / 2;
    mapCont.y = y + h / 2;
    // THEN: extend bgRect by (dw, dh):
    return { x, y, w: w + dw * dxdc, h: h + dh * dydr };
  }

  layoutTable(gamePlay: GamePlay) {
    this.gamePlay = gamePlay;
    const hexMap = this.hexMap = gamePlay.hexMap as any as HexMap<Hex2>;

    const xywh = this.bgXYWH();              // override bgXYHW() to supply default/arg values
    const hexCont = hexMap.mapCont.hexCont, hexp = this.scaleCont;
    this.bgRect = this.setBackground(this.scaleCont, xywh); // bounded by xywh
    const { x, y, width, height } = hexCont.getBounds();
    hexCont.cache(x, y, width, height); // cache hexCont (bounded by bgr)

    /**
     * After setBackground() & hexCont.cache(); before makePerPlayer();
     *
     * Whatever: make overlays, score panel, extra tracks (auction...)
     */
    this.layoutTable2(); // supply args (mapCont?) if necessary;
    this.makePerPlayer();

    this.setupUndoButtons(55, 60, 45, xywh) // & enableHexInspector()

    this.stage.on('drawend', () => setTimeout(() => this.toggleText(this.initialVis), 10), this, true );
    this.hexMap.update();
    this.layoutTurnlog();

    this.namedOn("playerMoveEvent", S.add, this.gamePlay.playerMoveEvent, this.gamePlay)
  }

  layoutTurnlog(rowy = 4, colx = -12) {
    const parent = this.scaleCont;
    this.setToRowCol(this.turnLog, rowy, colx);
    this.setToRowCol(this.textLog, rowy, colx);
    this.textLog.y += this.turnLog.height(Player.allPlayers.length + 1); // allow room for 1 line per player

    parent.addChild(this.turnLog, this.textLog);
    parent.stage.update();
  }

  // col locations, left-right mirrored:
  colf(pIndex: number, icol: number, row: number) {
    const dc = 10 - Math.abs(row) % 2;
    const col = (pIndex == 0 ? (icol) : (dc - icol));
    return { row, col };
  }

  layoutTable2() {

  }
  gpanel(makeGUI: (cont: Container) => ParamGUI, name: string, cx: number, cy: number, scale = 1, d = 5) {
    const guiC = new NamedContainer(name, cx * scale, cy * scale);
    // const map = table.hexMap.mapCont.parent;
    this.scaleCont.addChildAt(guiC);
    guiC.scaleX = guiC.scaleY = scale;
    const gui = makeGUI.call(this, guiC);      // @[0, 0]
    guiC.x -= (gui.linew + d) * scale;
    const bgr = new RectShape({ x: -d, y: -d, w: gui.linew + 2 * d, h: gui.ymax + 2 * d }, 'rgb(200,200,200,.5)', '');
    guiC.addChildAt(bgr, 0);
    this.dragger.makeDragable(guiC);
    return gui;
  }
  /**
   * makeNetworkGUI(parent)
   * makeParamGUI(parent)
   * makeParamGUI2(parent)
   * makeDragable()
   * @param table
   */
  makeGUIs() {
    const scaleCont = this.scaleCont, scale = TP.hexRad / 60, cx = -200, cy = 250, dy = 20;
    let ymax = 0;
    const gui3 = this.gpanel(this.makeNetworkGUI, 'NetGUI', cx, cy + ymax, scale);
    ymax += gui3.ymax + dy;
    const gui1 = this.gpanel(this.makeParamGUI, 'ParamGUI', cx, cy + ymax, scale);
    ymax += gui1.ymax + dy;
    const gui2 = this.gpanel(this.makeParamGUI2, 'AI_GUI', cx, cy + ymax, scale);
    ymax += gui2.ymax + dy;
    scaleCont.addChild(gui2.parent, gui1.parent, gui3.parent); // lower y values ABOVE to dropdown is not obscured
    // TODO: dropdown to use given 'top' container!
    gui1.stage.update();
  }

  get panelHeight() { return (2 * TP.nHexes - 1) / 3 - .2; }
  get panelOffset() { return TP.nHexes + 2; }

  /**
   * six panel locations [row, col, dir][].
   *
   * col==0 is on left edge of hexMap; The *center* hex is col == (nHexes-1)
   */
  setPanelLocs() {
    const r0 = this.hexMap.centerHex.row, dr = this.panelHeight + .2;
    const cc = this.hexMap.centerHex.col, coff = this.panelOffset;
    const c0 = cc - coff, c1 = cc + coff;
    const locs = [
      [r0 - dr, c0, +1], [r0, c0, +1], [r0 + dr, c0, +1],
      [r0 - dr, c1, -1], [r0, c1, -1], [r0 + dr, c1, -1]];
    return locs;
  }

  /** select from setPanelLoc, based on pIndex from total np */
  panelLoc(pIndex: number, np = Math.min(Player.allPlayers.length, 6), locs = this.setPanelLocs()) {
    const seq = [[], [0], [0, 3], [0, 3, 1], [0, 3, 4, 1], [0, 3, 4, 2, 1], [0, 3, 4, 5, 2, 1]];
    const seqn = seq[np], ndx = seqn[Math.min(pIndex, np - 1)];
    return locs[ndx];
  }

  readonly allPlayerPanels: PlayerPanel[] = [];
  /** make player panels, placed at panelLoc... */
  makePerPlayer() {
    this.allPlayerPanels.length = 0; // TODO: maybe deconstruct
    const high = this.panelHeight, wide = 4.5;
    const np = Math.min(Player.allPlayers.length, 6), locs = this.setPanelLocs();
    this.gamePlay.forEachPlayer((player, pIndex) => {
      const [row, col, dir] = this.panelLoc(pIndex, np, locs);
      this.allPlayerPanels[pIndex] = player.panel = new PlayerPanel(this, player, high, wide, row - high / 2, col - wide / 2, dir);
      player.makePlayerBits();
      this.setPlayerScore(player, 0);
    });
  }

  /** move cont to nominal [row, col] of hexCont */
  setToRowCol(cont: Container, row = 0, col = 0, hexCont = this.hexMap.mapCont.hexCont) {
    if (!cont.parent) this.scaleCont.addChild(cont); // localToLocal requires being on stage
    //if (cont.parent === hexCont) debugger;
    const hexC = this.hexMap.centerHex;
    const { x, y, dxdc, dydr } = hexC.xywh();
    const xx = x + (col - hexC.col) * dxdc;
    const yy = y + (row - hexC.row) * dydr;
    hexCont.localToLocal(xx, yy, cont.parent, cont);
    if (cont.parent === hexCont) {
      cont.x = xx; cont.y = yy;
    }
  }

  sourceOnHex(source: TileSource<Tile>, hex: Hex2) {
    if (source?.counter) source.counter.mouseEnabled = false;
    hex.legalMark.setOnHex(hex);
    hex.cont.visible = false;
  }

  makeCircleButton(color = C.WHITE, rad = 20, c?: string, fs = 30) {
    const button = new Container(); button.name = 'circle';
    const shape = new CircleShape(color, rad, '');
    button.addChild(shape);
    if (c) {
      const t = new CenterText(c, fs); t.y += 2;
      button.addChild(t);
    }
    button.setBounds(-rad, -rad, rad * 2, rad * 2);
    button.mouseEnabled = false;
    return button;
  }

  makeSquareButton(color = C.WHITE, xywh: XYWH, c?: string, fs = 30) {
    const button = new Container(); button.name = 'square';
    const shape = new RectShape(xywh, color, '');
    button.addChild(shape);
    if (c) {
      const t = new CenterText(c, fs); t.y += 2;
      button.addChild(t);
    }
    shape.mouseEnabled = false;
    return button;
  }

  makeRecycleHex(row = TP.nHexes + 3.2, col = 0) {
    const name = 'Recycle'
    const image = new Tile(name).addImageBitmap(name); // ignore Tile, get image.
    image.y = 0;              // recenter (undo text offset)

    const rHex = this.newHex2(row, col, name, RecycleHex);
    this.setToRowCol(rHex.cont, row, col);
    rHex.rcText.visible = rHex.distText.visible = false;
    rHex.setHexColor(C.WHITE);
    rHex.cont.addChild(image);
    rHex.cont.updateCache();
    return rHex;
  }

  /** Params that affect the rules of the game & board
   *
   * ParamGUI   --> board & rules [under stats panel]
   * ParamGUI2  --> AI Player     [left of ParamGUI]
   * NetworkGUI --> network       [below ParamGUI2]
   */
  makeParamGUI(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'right'});
    const gamePlay = this.gamePlay.gameSetup;
    gui.makeParamSpec('hexRad', [30, 60, 90, 120], { fontColor: 'red'}); TP.hexRad;
    gui.makeParamSpec('nHexes', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { fontColor: 'red' }); TP.nHexes;
    gui.makeParamSpec('mHexes', [1, 2, 3], { fontColor: 'red' }); TP.mHexes;
    gui.spec("hexRad").onChange = (item: ParamItem) => { gamePlay.restart({ hexRad: item.value }) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { gamePlay.restart({ nh: item.value }) }
    gui.spec("mHexes").onChange = (item: ParamItem) => { gamePlay.restart({ mh: item.value }) }

    parent.addChild(gui)
    gui.x = x // (3*cw+1*ch+6*m) + max(line.width) - (max(choser.width) + 20)
    gui.y = y
    gui.makeLines();
    return gui
  }

  /** configures the AI player */
  makeParamGUI2(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'center' })
    gui.makeParamSpec("log", [-1, 0, 1, 2], { style: { textAlign: 'right' } }); TP.log
    gui.makeParamSpec("maxPlys", [1, 2, 3, 4, 5, 6, 7, 8], { fontColor: "blue" }); TP.maxPlys
    gui.makeParamSpec("maxBreadth", [5, 6, 7, 8, 9, 10], { fontColor: "blue" }); TP.maxBreadth
    parent.addChild(gui)
    gui.x = x; gui.y = y
    gui.makeLines()
    gui.stage.update()
    return gui
  }

  netColor: string = "rgba(160,160,160, .8)"
  netStyle: DropdownStyle = { textAlign: 'right' };
  /** controls multiplayer network participation */
  makeNetworkGUI(parent: Container, x = 0, y = 0) {
    const gui = this.netGUI = new ParamGUI(TP, this.netStyle)
    gui.makeParamSpec("Network", [" ", "new", "join", "no", "ref", "cnx"], { fontColor: "red" })
    gui.makeParamSpec("PlayerId", ["     ", 0, 1, 2, 3, "ref"], { chooser: PidChoice, fontColor: "red" })
    gui.makeParamSpec("networkGroup", [TP.networkGroup], { chooser: EBC, name: 'gid', fontColor: C.GREEN, style: { textColor: C.BLACK } }); TP.networkGroup

    gui.spec("Network").onChange = (item: ParamItem) => {
      if (['new', 'join', 'ref'].includes(item.value)) {
        const group = (gui.findLine('networkGroup').chooser as EBC).editBox.innerText
        // this.gamePlay.closeNetwork()
        // this.gamePlay.network(item.value, gui, group)
      }
      // if (item.value === "no") this.gamePlay.closeNetwork()     // provoked by ckey
    }
    (this.stage.canvas as HTMLCanvasElement)?.parentElement?.addEventListener('paste', (ev) => {
      const text = ev.clipboardData?.getData('Text');
      ;(gui.findLine('networkGroup').chooser as EBC).setValue(text)
    });
    this.showNetworkGroup()
    parent.addChild(gui)
    gui.makeLines()
    gui.x = x; gui.y = y;
    parent.stage.update()
    return gui
  }

  showNetworkGroup(group_name = TP.networkGroup) {
    (document.getElementById('group_name') as HTMLInputElement).innerText = group_name;
    const line = this.netGUI.findLine("networkGroup"), chooser = line?.chooser;
    chooser?.setValue(group_name, chooser.items[0], undefined);
  }

  doneButton: UtilButton;
  doneClicked = (evt?: any) => {
    if (this.doneButton) this.doneButton.visible = false;
    this.gamePlay.phaseDone();   // <--- main doneButton does not supply 'panel'
  }

  addDoneButton(actionCont: Container, rh: number) {
    const w = 90, h = 56;
    const doneButton = this.doneButton = new UtilButton('lightgreen', 'Done', 36, C.black);
    doneButton.name = 'doneButton';
    doneButton.x = -(w);
    doneButton.y = 3 * rh;
    doneButton.label.textAlign = 'right';
    doneButton.on(S.click, this.doneClicked, this);
    actionCont.addChild(doneButton);

    // prefix advice: set text color
    const o_cgf = doneButton.shape.cgf;
    const cgf = (color: string) => {
      const tcolor = (C.dist(color, C.WHITE) < C.dist(color, C.black)) ? C.black : C.white;
      doneButton.label.color = tcolor;
      return o_cgf(color);
    }
    doneButton.shape.cgf = cgf; // invokes shape.paint(cgf) !!
    return actionCont;
  }

  /** show player player score on table */
  setPlayerScore(plyr: Player, score: number, rank?: number) {
  }

  /** update table when a new Game is started. */
  startGame(scenario: Scenario) {
    // All Tiles (& Meeple) are Dragable:
    Tile.allTiles.forEach(tile => {
      this.makeDragable(tile);
    });

    // this.stage.enableMouseOver(10);
    this.scaleCont.addChild(this.overlayCont); // now at top of the list.
    this.gamePlay.setNextPlayer(this.gamePlay.turnNumber > 0 ? this.gamePlay.turnNumber : 0);
  }

  makeDragable(tile: DisplayObject) {
    const dragger = this.dragger;
    dragger.makeDragable(tile, this, this.dragFunc, this.dropFunc);
    dragger.clickToDrag(tile, true); // also enable clickToDrag;
  }

  hexUnderObj(dragObj: DisplayObject, legalOnly = true ) {
    return this.hexMap.hexUnderObj(dragObj, legalOnly);
  }

  dragContext: DragContext;
  dragFunc(tile: DisplayObject, info?: DragInfo) {
    const hex = this.hexUnderObj(tile); // clickToDrag 'snaps' to non-original hex!
    this.dragFunc0(tile as Tile, info, hex);
  }

  /** Table.dragFunc0 (Table.dragFunc to inject drag/start actions programatically)
   * @param tile is being dragged
   * @param info { first: boolean, event: MouseEvent }
   * @param hex the Hex that tile is currently over (may be undefined or off map)
   */
  dragFunc0(tile: Tile, info?: DragInfo, hex = this.hexUnderObj(tile)) {
    let ctx = this.dragContext;
    if (info?.first) {
      if (ctx?.tile) {
        // clickToDrag intercepting a drag in progress!
        // mouse not over drag object! fix XY in call to dragTarget()
        console.log(stime(this, `.dragFunc: OOPS! adjust XY on dragTarget`), ctx);
        this.stopDragging(ctx.targetHex); // stop original drag
        this.dragger.stopDrag();          // stop new drag;  this.dropFunc(ctx.tile, ctx.info);
        return;
      }
      const event = info.event?.nativeEvent;
      tile.fromHex = tile.hex as Hex2;  // dragStart: set tile.fromHex when first move!
      ctx = {
        tile: tile,                  // ASSERT: hex === tile.hex
        targetHex: tile.fromHex,     // last isLegalTarget() or fromHex
        lastShift: event?.shiftKey,
        lastCtrl:  event?.ctrlKey,
        info: info,
        nLegal: 0,
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
    tile.dragFunc0(hex, ctx);
  }

  // invoke dragShift 'event' if shift state changes
  checkShift(hex: Hex2 | undefined, ctx: DragContext) {
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

  dragStart(tile: Tile, ctx: DragContext) {
    // press SHIFT to capture [recycle] opponent's Criminals or Tiles
    const reason = tile.cantBeMovedBy(this.gamePlay.curPlayer, ctx);
    if (reason) {
      console.log(stime(this, `.dragStart: ${reason}: ${tile},`), 'ctx=', { ...ctx });
      // this.logText(`${reason}: ${tile}`, 'Table.dragStart');
      this.stopDragging();
    } else {
      // mark legal targets for tile; SHIFT for all hexes, if payCost
      tile.dragStart(ctx); // prepare for isLegalTarget

      const countLegalHexes = (hex: Hex2) => {
        if (hex !== tile.hex && tile.isLegalTarget(hex, ctx)) {
          hex.isLegal = true;
          ctx.nLegal += 1;
        }
      };
      tile.markLegal(this, countLegalHexes, ctx);           // delegate to check each potential target
      tile.moveTo(undefined); // notify source Hex, so it can scale; also triggers nextUnit !!
      this.hexMap.update();
      if (ctx.nLegal === 0) {
        tile.noLegal();
        if (!this.gamePlay.recycleHex?.isLegal) {
          this.stopDragging(); // actually, maybe let it drag, so we can see beneath...
        }
      }
    }
  }

  /** state of shiftKey has changed during drag */
  dragShift(tile: Tile | undefined, shiftKey: boolean | undefined, ctx: DragContext) {
    tile?.dragShift(shiftKey, ctx);
  }

  dropFunc(dobj: DisplayObject, info?: DragInfo, hex = this.hexUnderObj(dobj)) {
    const tile = dobj as Tile;
    tile.dropFunc0(hex as Hex2, this.dragContext);
    tile.markLegal(this); // hex => hex.isLegal = false;
    // this.gamePlay.recycleHex.isLegal = false;
    this.dragContext.lastShift = undefined;
    this.dragContext.tile = undefined; // mark not dragging
  }

  /** synthesize dragStart(tile), tile.dragFunc0(hex), dropFunc(tile);  */
  dragStartAndDrop(tile: Tile, toHex: Hex) {
    if (!tile) return; // C-q when no EventTile on eventHex
    const hex = toHex as Hex2, info = { first: true } as DragInfo; // event: undefined
    this.dragFunc0(tile, info, tile.hex as Hex2);  // dragStart()
    tile.dragFunc0(hex, this.dragContext);
    this.dropFunc(tile, info, hex);
  }

  private isDragging() { return this.dragContext?.tile !== undefined; }

  /** Force this.dragger to drop the current drag object on given target Hex */
  stopDragging(target = this.dragContext?.tile?.fromHex) {
    //console.log(stime(this, `.stopDragging: dragObj=`), this.dragger.dragCont.getChildAt(0), {noMove, isDragging: this.isDragging()})
    if (this.isDragging()) {
      if (target) this.dragContext.targetHex = target;
      this.dragger.stopDrag(); // ---> dropFunc(this.dragContext.tile, info)
    }
    const data = this.dragger.getDragData(this.scaleCont);
    if (data) data.dragStopped = true;
  }

  /** Toggle dragging: dragTarget(target) OR stopDragging(targetHex)
   * - attach supplied target to mouse-drag (default is eventHex.tile)
   * @param target the DisplayObject being dragged
   * @param xy offset from target to mouse pointer
   */
  dragTarget(target = this.gamePlay.recycleHex?.tile as DisplayObject, xy: XY = { x: TP.hexRad / 2, y: TP.hexRad / 2 }) {
    if (this.isDragging()) {
      this.stopDragging(this.dragContext.targetHex) // drop and make move
    } else if (target) {
      this.dragger.dragTarget(target, xy);
    }
  }

  logCurPlayer(plyr: Player) {
    const tn = this.gamePlay.turnNumber
    const robo = plyr.useRobo ? AT.ansiText(['red','bold'],"robo") : "----";
    const info = { turn: tn, plyr: plyr.Aname, gamePlay: this.gamePlay, curPlayer: plyr }
    console.log(stime(this, `.logCurPlayer --${robo}--`), info);
    this.logTurn(`//${tn}: ${plyr.Aname}`);
  }
  showRedoUndoCount() {
    this.undoText.text = `${this.gamePlay.undoRecs.length}`
    this.redoText.text = `${this.gamePlay.redoMoves.length}`
  }
  showNextPlayer(log: boolean = true) {
    let curPlayer = this.gamePlay.curPlayer // after gamePlay.setNextPlayer()
    if (log) this.logCurPlayer(curPlayer)
    this.showRedoUndoCount()
  }

  _tablePlanner: TablePlanner
  get tablePlanner() {
    return this._tablePlanner ||
    (this._tablePlanner = new TablePlanner(this.gamePlay))
  }
  /**
   * All manual moves feed through this (drop & redo)
   * TablePlanner.logMove(); then dispatchEvent() --> gamePlay.doPlayerMove()
   *
   * New: let Ship (Drag & Drop) do this.
   */
  doTableMove(ihex: IdHex) {
  }
  /** All moves (GUI & player) feed through this: */
  moveStoneToHex(ihex: IdHex, sc: PlayerColor) {
    // let hex = Hex.ofMap(ihex, this.hexMap)
    // this.hexMap.showMark(hex)
    // this.dispatchEvent(new HexEvent(S.add, hex, sc)) // -> GamePlay.playerMoveEvent(hex, sc)
  }

  /** default scaling-up value */
  upscale: number = 1.5;
  /** change cont.scale to given scale value. */
  scaleUp(cont: Container, scale = this.upscale) {
    cont.scaleX = cont.scaleY = scale;
  }
  scaleParams = { initScale: .125, scale0: .05, scaleMax: 4, steps: 30, zscale: .20,  };

  readonly scaleCont: ScaleableContainer2;
  /** makeScaleableBack and setup scaleParams
   * @param bindkeys true if there's a GUI/user/keyboard
   */
  makeScaleCont(bindKeys: boolean) {
    /** scaleCont: a scalable background */
    const scaleC = new ScaleableContainer2(this.stage, this.scaleParams);
    this.dragger = new Dragger(scaleC);
    if (!!scaleC.stage.canvas) {
      // Special case of makeDragable; drag the parent of Dragger!
      this.dragger.makeDragable(scaleC, scaleC, undefined, undefined, true); // THE case where not "useDragCont"
      //this.scaleUp(Dragger.dragCont, 1.7); // Items being dragged appear larger!
    }
    if (bindKeys) {
      this.bindKeysToScale(scaleC, "a", 436, 2);
      KeyBinder.keyBinder.setKey('Space',   { thisArg: this, func: () => this.dragTarget() });
      KeyBinder.keyBinder.setKey('S-Space', { thisArg: this, func: () => this.dragTarget() });
      KeyBinder.keyBinder.setKey('t', { thisArg: this, func: () => { this.toggleText(); } })
    }
    return scaleC;
  }

  /** put a Rectangle Shape at (0,0) with XYWH bounds as given */
  setBackground(parent: Container, bounds: XYWH, bgColor = TP.bgColor) {
    // specify an Area that is Dragable (mouse won't hit "empty" space)
    const bgRect = new RectShape(bounds, bgColor, '') as RectShape & NamedObject;
    bgRect.Aname = "BackgroundRect";
    parent.addChildAt(bgRect, 0);
    return bgRect
  }

  zoom(z = 1.1) {
    const stage = this.stage;
    const pxy = { x: stage.mouseX / stage.scaleX, y: stage.mouseY / stage.scaleY };
    this.scaleCont.setScale(this.scaleCont.scaleX * z, pxy);
    // would require adjusting x,y offsets, so we just scale directly:
    // TODO: teach ScaleableContainer to check scaleC.x,y before scroll-zooming.

    // this.scaleCont.scaleX = this.scaleCont.scaleY = this.scaleCont.scaleX * z;
    this.stage?.update();
  }
  pan(xy: XY) {
    this.scaleCont.x += xy.x;
    this.scaleCont.y += xy.y;
    this.stage?.update();
  }

  /**
   * invoked before this.scaleC has been set
   * @param scaleC same Container as this.scaleC
   * @param char keybinding to set initial scale
   * @param xos x-offset of scaleC in screen coords (pre-scale)
   * @param yos y-offset of scaleC in screen coords (pre-scale)
   * @param scale0 imitial scale [.5]
   */
  // bindKeysToScale('a', scaleC, 436, 0, .5)
  bindKeysToScale(scaleC: ScaleableContainer2, char: string, xos: number, yos: number, scale0 = .5) {
    const nsA = scale0;
    const apt = { x: xos, y: yos }
    let nsZ = 0.647; //
    const zpt = { x: 120, y: 118 }

    // set Keybindings to reset Scale:
    /** save scale & offsets for later: */
    const saveScaleZ = () => {
      nsZ = scaleC.scaleX;
      zpt.x = scaleC.x; zpt.y = scaleC.y;
    }
    // xy is the fixed point, but is ignored because we set xy directly.
    // sxy is the final xy offset, saved by saveScaleZ()
    const setScaleXY = (ns?: number, sxy: XY = { x: 0, y: 0 }) => {
      scaleC.setScale(ns);
      //console.log({si, ns, xy, sxy, cw: this.canvas.width, iw: this.map_pixels.width})
      scaleC.x = sxy.x; scaleC.y = sxy.y;
      this.stage.update()
    }
    const getOop = () => {
      this.stage.getObjectsUnderPoint(500, 100, 1)
    }

    // Scale-setting keystrokes:
    KeyBinder.keyBinder.setKey("a", { func: () => setScaleXY(nsA, apt) });
    KeyBinder.keyBinder.setKey("z", { func: () => setScaleXY(nsZ, zpt) });
    KeyBinder.keyBinder.setKey("x", { func: () => saveScaleZ() });
    KeyBinder.keyBinder.setKey("p", { func: () => getOop(), thisArg: this});
    KeyBinder.keyBinder.setKey('S-ArrowUp', { thisArg: this, func: this.zoom, argVal: 1.03 })
    KeyBinder.keyBinder.setKey('S-ArrowDown', { thisArg: this, func: this.zoom, argVal: 1/1.03 })
    KeyBinder.keyBinder.setKey('S-ArrowLeft', { thisArg: this, func: this.pan, argVal: {x: -10, y:0} })
    KeyBinder.keyBinder.setKey('ArrowRight', { thisArg: this, func: this.pan, argVal: {x: 10, y: 0} })
    KeyBinder.keyBinder.setKey('ArrowLeft', { thisArg: this, func: this.pan, argVal: {x: -10, y:0} })
    KeyBinder.keyBinder.setKey('S-ArrowRight', { thisArg: this, func: this.pan, argVal: {x: 10, y: 0} })
    KeyBinder.keyBinder.setKey('ArrowUp', { thisArg: this, func: this.pan, argVal: { x: 0, y: -10 } })
    KeyBinder.keyBinder.setKey('ArrowDown', { thisArg: this, func: this.pan, argVal: { x: 0, y: 10 } })

    KeyBinder.keyBinder.dispatchChar(char)
  }
}

class ScaleableContainer2 extends ScaleableContainer {

}
