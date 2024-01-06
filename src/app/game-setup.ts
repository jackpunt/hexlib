import { C, DropdownChoice, DropdownItem, DropdownStyle, ParamGUI, ParamItem, blinkAndThen, makeStage, stime } from "@thegraid/easeljs-lib";
import { Container, Stage } from "@thegraid/easeljs-module";
import { parse as JSON5_parse } from 'json5';
import { EBC, PidChoice } from "./choosers";
import { GamePlay, NamedContainer } from "./game-play";
import { Meeple } from "./meeple";
import { Player } from "./player";
import { ScenarioParser, SetupElt } from "./scenario-parser";
import { RectShape } from "./shapes";
import { LogReader, LogWriter } from "./stream-writer";
import { Table } from "./table";
import { TP } from "./table-params";
import { Tile } from "./tile";

/** OR: import { Params } from "@angular/router"; */
declare type Params = {
  [key: string]: any;
};

/** show " R" for " N" */
stime.anno = (obj: string | { constructor: { name: string; }, stage?: Stage, table?: Table }) => {
  let stage = (typeof obj !== 'string') ? (obj?.stage || obj?.table?.stage) : undefined;
  return !!stage ? (!!stage.canvas ? " C" : " R") : " -" as string;
}

export interface Scenario { turn: number, Aname: string };

interface MultiItem extends DropdownItem { }
class MultiChoice extends DropdownChoice {
  // constructor(items: MultiItem[], item_w: number, item_h: number, style?: DropdownStyle) {
  //   super(items, item_w, item_h, style);
  // }

  override select(item: MultiItem): MultiItem {
    this.changed(item);
    return item;
  }
}

/** initialize & reset & startup the application/game. */
export class GameSetup {
  stage: Stage;
  gamePlay: GamePlay
  paramGUIs: ParamGUI[]
  netGUI: ParamGUI // paramGUIs[2]

  /**
   * ngAfterViewInit --> start here!
   * @param canvasId supply undefined for 'headless' Stage
   */
  constructor(canvasId: string, public qParams: Params = []) {
    stime.fmt = "MM-DD kk:mm:ss.SSSL"
    this.stage = makeStage(canvasId, false);
    this.stage.snapToPixel = TP.snapToPixel;
    this.setupToParseState();                 // restart when/if 'SetState' button is clicked
    this.setupToReadFileState();              // restart when/if 'LoadFile' button is clicked
    Tile.loader.loadImages(() => this.startup(qParams));
  }
  /** set from qParams['n'] */
  nPlayers = 2;
  makeNplayers(gamePlay: GamePlay) {
    // Create and Inject all the Players:
    const allPlayers = gamePlay.allPlayers;
    allPlayers.length = 0;
    for (let ndx = 0; ndx < this.nPlayers; ndx++) {
      new Player(ndx, gamePlay); // make real Players...
    }
    gamePlay.curPlayerNdx = 0; // gamePlay.setNextPlayer(0); ???
    gamePlay.curPlayer = allPlayers[gamePlay.curPlayerNdx];
  }

  _netState = " " // or "yes" or "ref"
  set netState(val: string) {
    this._netState = (val == "cnx") ? this._netState : val || " "
    this.gamePlay.ll(2) && console.log(stime(this, `.netState('${val}')->'${this._netState}'`))
    this.netGUI?.selectValue("Network", val)
  }
  get netState() { return this._netState }
  set playerId(val: string) { this.netGUI?.selectValue("PlayerId", val || "     ") }

  logTime_js: string;
  readonly logWriter = this.makeLogWriter();
  makeLogWriter() {
    const logTime_js = this.logTime_js = `log_${stime.fs('MM-DD_Lkk_mm')}.js`;
    const logWriter = new LogWriter(logTime_js, '[\n', ']\n'); // terminate array, but insert before terminal
    return logWriter;
  }

  restartable = false;
  /** C-s ==> kill game, start a new one, possibly with new dbp */
  restart(stateInfo: any) {
    if (!this.restartable) return;
    let netState = this.netState
    // this.gamePlay.closeNetwork('restart')
    // this.gamePlay.logWriter?.closeFile()
    this.gamePlay.forEachPlayer(p => p.endGame())
    Tile.allTiles.forEach(tile => tile.hex = undefined)
    let deContainer = (cont: Container) => {
      cont.children.forEach(dObj => {
        dObj.removeAllEventListeners()
        if (dObj instanceof Container) deContainer(dObj)
      })
      cont.removeAllChildren()
    }
    deContainer(this.stage);
    this.resetState(stateInfo);
    // next tick, new thread...
    setTimeout(() => this.netState = netState, 100) // onChange-> ("new", "join", "ref") initiate a new connection
  }

  /** override: invoked by restart(); with stateInfo JSON5_parse(stateText) */
  resetState(stateInfo: any) {
    const { mh, nh, hexRad } = stateInfo as { mh?: number, nh: number, hexRad: number }; // for example
    TP.mHexes = mh ?? TP.mHexes;
    TP.nHexes = nh ?? TP.nHexes;
    TP.hexRad = hexRad ?? TP.hexRad;
    this.startup();
  }

  /** read & parse State from text element */
  setupToParseState() {
    const parseStateButton = document.getElementById('parseStateButton') as HTMLElement;
    const parseStateText = document.getElementById('parseStateText') as HTMLInputElement;
    parseStateButton.onclick = () => {
      const stateText = parseStateText.value;
      const state = JSON5_parse(stateText);
      state.Aname = state.Aname ?? `parseStateText`;
      blinkAndThen(this.gamePlay.hexMap.mapCont.markCont, () => this.restart(state))
    }
  }

  fileReadPromise: Promise<File>;
  async setupToReadFileState() {
    const logReader = new LogReader(`log/date_time.js`, 'fsReadFileButton');
    this.fileReadPromise = logReader.setButtonToReadFile();
    const fileHandle = await this.fileReadPromise;
    const fileText = await logReader.readFile(fileHandle);
    const fullName = (fileHandle as any as FileSystemFileHandle).name;
    const [fileName, ext] = fullName.split('.');
    const readFileNameElt = document.getElementById('readFileName') as HTMLInputElement;
    const readFileName = readFileNameElt.value;
    const [fname, turnstr] = readFileName.split('@'); // fileName@turn
    const turn = Number.parseInt(turnstr);
    const state = this.extractStateFromString(fileName, fileText, turn);
    this.setupToReadFileState();   // another thread to wait for next click
    this.restart(state);
  }

  extractStateFromString(fileName: string, fileText: string, turn: number) {
    const logArray = JSON5_parse(fileText) as Scenario[];
    const [, ...stateArray] = logArray;
    const state = stateArray.find(state => state.turn === turn) ?? {}  as Scenario;
    state.Aname = `${fileName}@${turn}`;
    return state;
  }

  /**
   * Make new Table/layout & gamePlay/hexMap & Players.
   * @param qParams from URL
   */
  startup(qParams: Params = this.qParams) {
    this.nPlayers = Math.min(TP.maxPlayers, qParams?.['n'] ? Number.parseInt(qParams?.['n']) : 2);
    this.startScenario({turn: 0, Aname: 'defaultScenario'});
  }

  /** scenario.turn indicate a FULL/SAVED scenario */
  startScenario(scenario: Scenario) {
    Tile.allTiles = [];
    Meeple.allMeeples = [];
    Player.allPlayers = [];
    const table = new Table(this.stage)        // EventDispatcher, ScaleCont, GUI-Player

    // Inject Table into GamePlay & make allPlayers:
    const gamePlay = new GamePlay(scenario, table, this) // hexMap, players, fillBag, gStats, mouse/keyboard->GamePlay
    this.gamePlay = gamePlay;
    this.makeNplayers(gamePlay);     // Players have: civics & meeples & TownSpec

    // Inject GamePlay to Table; all the GUI components, makeAllDistricts(), addTerrain, initialRegions
    table.layoutTable(gamePlay);     // mutual injection & make all panelForPlayer
    gamePlay.forEachPlayer(p => table.setPlayerScore(p, 0));

    this.gamePlay.turnNumber = -1;   // in prep for setNextPlayer or parseScenario
    // Place Pieces and Figures on map:
    this.parseScenenario(scenario); // may change gamePlay.turnNumber, gamePlay.phase (& conflictRegion)
    this.gamePlay.logWriterLine0();

    gamePlay.forEachPlayer(p => p.newGame(gamePlay))        // make Planner *after* table & gamePlay are setup
    this.restartable = false;
    this.makeGUIs(table);
    this.restartable = true;   // *after* makeLines has stablilized selectValue
    table.startGame(scenario); // parseScenario; allTiles.makeDragable(); setNextPlayer();
    return gamePlay
  }

  makeGUIs(table: Table) {
    const scaleCont = table.scaleCont, scale = TP.hexRad / 60, cx = -200, cy = 250, d = 5;
    // this.makeParamGUI(table.scaleCont, -400, 250);
    const gpanel = (makeGUI: (cont: Container) => ParamGUI, name: string, cx: number, cy: number, scale = 1) => {
      const guiC = new NamedContainer(name, cx * scale, cy * scale);
      // const map = table.hexMap.mapCont.parent;
      scaleCont.addChildAt(guiC);
      guiC.scaleX = guiC.scaleY = scale;
      const gui = makeGUI.call(this, guiC);      // @[0, 0]
      guiC.x -= (gui.linew + d) * scale;
      const bgr = new RectShape({ x: -d, y: -d, w: gui.linew + 2 * d, h: gui.ymax + 2 * d }, 'rgb(200,200,200,.5)', '');
      guiC.addChildAt(bgr, 0);
      table.dragger.makeDragable(guiC);
      return gui;
    }
    let ymax = 0;
    const gui3 = gpanel(this.makeNetworkGUI, 'NetGUI', cx, cy + ymax, scale);
    ymax += gui3.ymax + 20;
    const gui1 = gpanel(this.makeParamGUI, 'ParamGUI', cx, cy + ymax, scale);
    ymax += gui1.ymax + 20;
    const gui2 = gpanel(this.makeParamGUI2, 'AI_GUI', cx, cy + ymax, scale);
    ymax += gui2.ymax + 20;
    scaleCont.addChild(gui2.parent, gui1.parent, gui3.parent); // lower y values ABOVE to dropdown is not obscured
    // TODO: dropdown to use given 'top' container!
    gui1.stage.update();
  }

  scenarioParser: ScenarioParser;
  parseScenenario(scenario: SetupElt) {
    const hexMap = this.gamePlay.hexMap;
    const scenarioParser = this.scenarioParser = new ScenarioParser(hexMap, this.gamePlay);
    this.gamePlay.logWriter.writeLine(`// GameSetup.parseScenario: ${scenario.Aname}`)
    scenarioParser.parseScenario(scenario);
  }

  /** affects the rules of the game & board
   *
   * ParamGUI   --> board & rules [under stats panel]
   * ParamGUI2  --> AI Player     [left of ParamGUI]
   * NetworkGUI --> network       [below ParamGUI2]
   */
  makeParamGUI(parent: Container, x = 0, y = 0) {
    const gui = new ParamGUI(TP, { textAlign: 'right'});
    gui.makeParamSpec('hexRad', [30, 60, 90, 120], { fontColor: 'red'}); TP.hexRad;
    gui.makeParamSpec('nHexes', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { fontColor: 'red' }); TP.nHexes;
    gui.makeParamSpec('mHexes', [1, 2, 3], { fontColor: 'red' }); TP.mHexes;
    gui.spec("hexRad").onChange = (item: ParamItem) => { this.restart({ hexRad: item.value }) }
    gui.spec("nHexes").onChange = (item: ParamItem) => { this.restart({ nh: item.value }) }
    gui.spec("mHexes").onChange = (item: ParamItem) => { this.restart({ mh: item.value }) }

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
    (document.getElementById('group_name') as HTMLInputElement).innerText = group_name
    const line = this.netGUI.findLine("networkGroup"), chooser = line?.chooser
    chooser?.setValue(group_name, chooser.items[0], undefined);
  }
}
