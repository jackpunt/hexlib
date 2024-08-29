import { Constructor } from "@thegraid/common-lib";
import { DropdownChoice, DropdownItem, blinkAndThen, makeStage, stime } from "@thegraid/easeljs-lib";
import { Container, Stage } from "@thegraid/easeljs-module";
import { parse as JSON5_parse } from 'json5';
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap, MapCont } from "./hex";
import { AliasLoader } from "./image-loader";
import { Meeple } from "./meeple";
import { Player } from "./player";
import { ScenarioParser, SetupElt } from "./scenario-parser";
import { LogReader, LogWriter } from "./stream-writer";
import { Table } from "./table";
import { TP } from "./table-params";
import { Tile } from "./tile";

/** OR: import { Params } from "@angular/router"; */
declare type Params = Record<string, any>;

/** show ' R' for ' N' */
stime.anno = (obj: string | { constructor: { name: string; }, stage?: Stage, table?: Table }) => {
  let stage = (typeof obj !== 'string') ? (obj?.stage || obj?.table?.stage) : undefined;
  return !!stage ? (!!stage.canvas ? ' C' : ' R') : ' -' as string;
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
  hexMap: HexMap<Hex>;
  gamePlay: GamePlay;
  table: Table;        // here so GameSetup can override type? all uses are from GamePlay.table;

  /**
   * ngAfterViewInit2() --> start here!
   *
   * - this.initialize(canvasId, qParams);
   * - this.loadImagesThenStartup(qParams);
   *
   * @param canvasId supply undefined for "headless" Stage
   * @param qParams queryParams from StageComponent -> this.qParams;
   */
  constructor(canvasId: string, public qParams: Params = {}) {
    this.initialize(canvasId);
    this.loadImagesThenStartup(qParams);
  }

  /** one-time, invoked from new GameSetup(canvasId); typically from StageComponent.ngAfterViewInit2() */
  initialize(canvasId: string) {
    stime.fmt = 'MM-DD kk:mm:ss.SSSL';
    this.stage = makeStage(canvasId, false);
    this.stage.snapToPixel = TP.snapToPixel;
    this.setupToParseState();                 // restart when/if 'SetState' button is clicked
    this.setupToReadFileState();              // restart when/if 'LoadFile' button is clicked
  }


  /** Label browser page. Typically: nPlayer=n, scenario from file. */
  get pageLabel() {
    const { n, file } = this.qParams;
      const sep = (n !== undefined && file !== undefined) ? '&' : '';
      return `${n ? ` n=${n}` : ''}${sep}${file ? `file=${file}` : ''}`;
  }

  loadImagesThenStartup(qParams: Params = this.qParams) {
    AliasLoader.loader.loadImages(() => this.startup(qParams));
  }

  makePlayer(ndx: number, gamePlay: GamePlay) {
    new Player(ndx, gamePlay);
  }

  /** set from qParams['n'] */
  nPlayers = 2;
  makeAllPlayers(gamePlay: GamePlay) {
    // Create and Inject all the Players:
    const allPlayers = gamePlay.allPlayers;
    allPlayers.length = 0;
    for (let ndx = 0; ndx < this.nPlayers; ndx++) {
      this.makePlayer(ndx, gamePlay); // make real Players...
    }
    gamePlay.curPlayerNdx = 0; // gamePlay.setNextPlayer(0); ???
    gamePlay.curPlayer = allPlayers[gamePlay.curPlayerNdx];
  }

  _netState = ' ' // or 'yes' or 'ref'
  set netState(val: string) {
    this._netState = (val == 'cnx') ? this._netState : val ?? ' '
    this.gamePlay.ll(2) && console.log(stime(this, `.netState('${val}')->'${this._netState}'`))
    this.table.netGUI?.selectValue('Network', val)
  }
  get netState() { return this._netState }
  set playerId(val: string) { this.table.netGUI?.selectValue('PlayerId', val ?? '     ') }

  logTime_js: string;
  readonly logWriter = this.makeLogWriter();
  makeLogWriter() {
    const logTime_js = this.logTime_js = `log_${stime.fs('MM-DD_Lkk_mm')}.js`;
    const logWriter = new LogWriter(logTime_js, '[\n', ']\n'); // terminate array, but insert before terminal
    return logWriter;
  }

  restartable = false;
  /** C-s ==> kill game, start a new one, possibly with new stateInfo
   * @param stateInfo typically TP fields like {hexRad: 60, nHexes: 7, mHexes: 1}
   */
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
    this.startup();             // was in resetState() but this makes more sense. maybe startup(stateInfo)?
    // next tick, new thread...
    setTimeout(() => this.netState = netState, 100) // onChange-> ('new', 'join', 'ref') initiate a new connection
  }

  /** override: invoked by restart(); with stateInfo JSON5_parse(stateText) */
  resetState(stateInfo: any) {
    const { mh, nh, hexRad } = stateInfo as { mh?: number, nh: number, hexRad: number }; // for example
    TP.mHexes = mh ?? TP.mHexes;
    TP.nHexes = nh ?? TP.nHexes;
    TP.hexRad = hexRad ?? TP.hexRad;
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

  /** compute nPlayers from qParams['n'] */
  getNPlayers(qParams = this.qParams, nDef = 2) {
    const n = qParams['n'];
    return Math.min(TP.maxPlayers, n ? Number.parseInt(n) : nDef);
  }

  /**
   * create a HexMap<hexC>; addToMapCont(); makeAllDistricts(); return
   *
   * Invoked from GameSetup.startup() with NO arg.
   *
   * Typical:
   * @example
   * ```
   * override makeHexMap(hexMC: Constructor<HexMap<Hex>> = LocalHexMap, hexC: Constructor<Hex> = LocalHex) {
   *   const cNames = ...;
   *   super.makeHexMap(hexMC, hexC, cNames);
   * }
   * ```
   * We create hexMap here, and store it in gameSetup,
   * then copy it to this.gamePlay.hexMap in GamePlay.constructor.
   *
   * It is also copied from gamePlay to table.hexMap in Table.layoutTable()
   *
   * gamePlay.hexMap is used for most references [mostly hexMap.update()]
   *
   * @param hexMC Constructor of a HexMap<Hex>(radius, addToMapCont, hexC) [HexMap]
   * @param hexC Constructor of Hex in the HexMap [hexlib.Hex2]
   * @param cNames add fields & Containers to MapCont [MapCont.cNames.concat()]
   */
  makeHexMap(
    hexMC: Constructor<HexMap<Hex>> = HexMap,
    hexC: Constructor<Hex> = Hex2,
    cNames = MapCont.cNames.concat() as string[])
  {
    const hexMap = new hexMC(TP.hexRad, true, hexC);
    hexMap.addToMapCont(hexC, cNames);       // addToMapCont(hexC, cNames)
    hexMap.makeAllDistricts();               // determines size for this.bgRect
    return hexMap;
  }

  /** EventDispatcher, ScaleCont, GUI-Player */
  makeTable() {
    return new Table(this.stage);
  }

  initialScenario(qParams: Params = this.qParams): Scenario {
    return { turn: 0, Aname: 'defaultScenario' };
  }

  makeGamePlay(scenario: Scenario) {
    return new GamePlay(this, scenario);
  }

  /**
   * Make new Table/layout & gamePlay/hexMap & Players.
   *
   * - getNPlayers()
   * - makeHexMap()
   * - makeTable()
   * - initialScenario()
   * - makeGamePlay(scenario)
   * - startScenario(scenario)
   * @param qParams from URL
   */
  startup(qParams: Params = this.qParams) {
    Tile.allTiles = [];
    Meeple.allMeeples = [];
    Player.allPlayers = [];

    this.nPlayers = this.getNPlayers();        // Scenario may override?
    this.hexMap = this.makeHexMap();           // only reference is in GamePlay constructor!
    this.table = this.makeTable();
    const scenario = this.initialScenario();
    // Inject Table into GamePlay;
    // GameState, mouse/keyboard->GamePlay,
    this.gamePlay = this.makeGamePlay(scenario);

    this.startScenario(scenario);
  }

  /**
   * Given hexMap, table, and gamePlay, setup/layout everything for the game scenario.
   *
   * - gamePlay = this.gamePlay
   * - makeAllPlayers(gamePlay)
   * - layoutTable(gamePlay)
   * - gamePlay.turnNumber = -1
   * - setPlayerScore()
   * - parseScenario(scenario) // scenario.turn set on a FULL/SAVED scenario
   * - forEachPlayer(p.newGame(gamePlay))
   * - with (restartable = false) table.makeGUIs() QQQQ: keep in GameSetup ?
   * - table.startGame(scenario)
   */
  startScenario(scenario: Scenario) {
    const gamePlay = this.gamePlay, table = this.table;
    this.makeAllPlayers(gamePlay);     // Players have: civics & meeples & TownSpec

    // Inject GamePlay to Table; all the GUI components, makeAllDistricts(), addTerrain, initialRegions
    table.layoutTable(gamePlay);     // mutual injection & make all panelForPlayer

    this.gamePlay.turnNumber = -1;   // in prep for setNextPlayer or parseScenario
    // Place Tiles and Meeple on HexMap, set GameState.
    this.parseScenario(scenario); // may change gamePlay.turnNumber, gamePlay.phase (& conflictRegion)
    this.gamePlay.logWriterLine0();

    gamePlay.forEachPlayer(p => p.newGame(gamePlay))        // make Planner *after* table & gamePlay are setup
    this.restartable = false;
    this.table.makeGUIs();
    this.restartable = true;   // *after* makeLines has stablilized selectValue
    table.scaleCont.addChild(table.overlayCont); // now at top of the list.
    table.startGame(scenario); // parseScenario; allTiles.makeDragable(); setNextPlayer();
    return gamePlay;
  }

  makeScenarioParser(hexMap: HexMap<Hex>, gamePlay = this.gamePlay) {
    return new ScenarioParser(hexMap, this.gamePlay);
  }
  scenarioParser: ScenarioParser;
  /**
   * Place Tiles and Meeples on HexMap, set GameState.
   *
   * new ScenarioParser(hexMap, gamePlay).parseScenario(scenario);
   */
  parseScenario(scenario: SetupElt) {
    const hexMap = this.gamePlay.hexMap;
    const scenarioParser = this.scenarioParser = this.makeScenarioParser(hexMap, this.gamePlay);
    this.gamePlay.logWriter.writeLine(`// GameSetup.parseScenario: ${scenario.Aname}`)
    scenarioParser.parseScenario(scenario);
  }

}
