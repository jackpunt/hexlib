import { Constructor, Random, stime } from "@thegraid/common-lib";
import { DropdownChoice, DropdownItem, blinkAndThen, makeStage } from "@thegraid/easeljs-lib";
import { Container, Stage, type DisplayObject } from "@thegraid/easeljs-module";
import JSON5 from 'json5';
import { GamePlay } from "./game-play";
import { Hex, Hex2, HexMap, MapCont } from "./hex";
import { AliasLoader } from "./image-loader";
import { Meeple } from "./meeple";
import { Player } from "./player";
import { ScenarioParser, SetupElt, type StartElt } from "./scenario-parser";
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

/** configuration of HexMap */
export interface HexAspect { mh?: number, nh?: number, hexRad?: number }
/** Specify and initial or current state of game; see also Scenario.SetupElt */
export type Scenario = SetupElt; // {Aname: string, turn: number}

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
   * - this.initialize(canvasId);
   * - this.loadImagesThenStartup();
   *
   * @param canvasId supply undefined for "headless" Stage
   * @param qParams queryParams from StageComponent --> this.qParams;
   */
  constructor(canvasId: string, public qParams: Params = {}) {
    this.initialize(canvasId);
    this.loadImagesThenStartup();
  }

  static random_seed = '';
  get seed() { return GameSetup.random_seed; }
  init_random(seed = `${Math.random()}`.slice(2)) {
    GameSetup.random_seed = seed;
    console.log(stime(this, `.init_random: rand=${seed}&`))
    Random.use_random = Random.mulberry32(seed);
  }

  /** one-time, invoked from new GameSetup(canvasId);
   * typically from StageComponent.ngAfterViewInit2()
   *
   * override should call super.initialize();
   */
  initialize(canvasId: string) {
    stime.fmt = 'MM-DD kk:mm:ss.SSSL';
    this.init_random(this.qParams.rand);
    this.stage = makeStage(canvasId, false);
    this.stage.snapToPixel = TP.snapToPixel;
    this.setupToParseState();                 // restart when/if 'SetState' button is clicked
    this.setupToReadFileState();              // restart when/if 'LoadFile' button is clicked
  }


  /** Label browser page. Typically: nPlayer=n, scenario from file. */
  get pageLabel() {
    const { n, file } = this.qParams as { n?: string, file?: string };
      const sep = (n !== undefined && file !== undefined) ? '&' : '';
      return `${n ? ` n=${n}` : ''}${sep}${file ? `file=${file}` : ''}`;
  }

  loadImagesThenStartup() {
    AliasLoader.loader.loadImages(() => this.startup(this.qParams));
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
  /** for network player vs 'ref' */
  set playerId(val: string) { this.table.netGUI?.selectValue('PlayerId', val ?? '     ') }

  logTime_js: string;
  /** Generally accessed as: gamePlay.logWriter! */
  readonly logWriter = this.makeLogWriter();
  makeLogWriter() {
    const logTime_js = this.logTime_js = `log_${stime.fs('MM-DD_Lkk_mm')}.js`;
    const logWriter = new LogWriter(logTime_js, '[\n', ']\n'); // terminate array, but insert before terminal
    return logWriter;
  }

  restartable = false;
  /** C-s ==> kill game, start a new one, possibly with new stateInfo
   *
   * - p.endGame()
   * - deContainer()
   * - zeroAllArrays()
   * - resetState(stateInfo)
   * - startup(stateInfo as Scenario)
   * @param stateInfo Scenario and/or { hexRad: 60, nHexes: 7, mHexes: 1 }
   */
  // ParamGUI restarts with single: HexAspect;
  // keyBinder(C-s) restarts with empty Scenario: {}; // should be previous Scenario?
  // parseStateButton: restart({ parsed from JSON text element })
  // extractStateFromString: restart({ parsed from file@turn })
  restart(stateInfo: Scenario | HexAspect) {
    if (!this.restartable) return;  // ignore call from within makeGUI
    let netState = this.netState
    // this.gamePlay.closeNetwork('restart') // See: hexcity [aka: CityMap, BoomTown], CgClient
    // this.gamePlay.logWriter?.closeFile()  // maybe put in NetClient, vs GamePlay
    this.gamePlay.forEachPlayer(p => p.endGame())
    this.gamePlay.allTiles.forEach(tile => tile.hex = undefined)
    let deContainer = (cont: Container) => {
      cont.children.forEach(dObj => {
        dObj.removeAllEventListeners()
        if (dObj instanceof Container) deContainer(dObj)
      })
      cont.removeAllChildren()
    }
    deContainer(this.stage);
    this.zeroAllArrays();
    this.startup(stateInfo as Scenario); // was in resetState() but this makes more sense.
    // next tick, new thread...
    setTimeout(() => this.netState = netState, 100) // onChange-> ('new', 'join', 'ref') initiate a new connection
  }

  /**
   * zero gamePlay.allTile/Meeples/Players/etc for deconstruction.
   *
   * Not essential, this.gamePlay will be dropped/replaced in startup().
   */
  zeroAllArrays() {
    this.gamePlay.allTiles.length = 0
    this.gamePlay.allMeeples.length = 0;
    this.gamePlay.allPlayers.length = 0;
  }

  /**
   * set TableParams from HexAspect of ParamGUI
   *
   * could override to edit any Scenario bits before startup() --> startScenario(scenario)
   * @param stateInfo (HexAspect mostly?)
   */
  resetState(stateInfo: Scenario | HexAspect) {
    const { mh, nh, hexRad } = stateInfo as HexAspect;
    TP.mHexes = mh ?? TP.mHexes;
    TP.nHexes = nh ?? TP.nHexes;
    TP.hexRad = hexRad ?? TP.hexRad;
  }

  /** read & parse State from text element: parseStateButton.onClick() => blinkThenRestart() */
  setupToParseState(): void {
    const parseStateButton = document.getElementById('parseStateButton') as HTMLButtonElement;
    parseStateButton.onclick = () => this.blinkThenRestart()
  }

  /** blink DisplayObject [this.table.doneButton] until parseStateAndRestart() completes */
  blinkThenRestart(dispObj: DisplayObject = this.table.doneButton, text?: string) {
    const psb = document.getElementById('parseStateButton') as HTMLButtonElement;
    const bgColor = psb.style.backgroundColor;
    psb.style.backgroundColor = 'pink';
    blinkAndThen(dispObj ?? this.stage, () => {
      this.parseStateTextAndRestart(text, (scenario) => {
        this.restart(scenario)
        psb.style.backgroundColor = bgColor
      });
    });
  }

  /**
   *
   * @param stateText [Element('parseStateText').value.replace(/,$/, '')]
   * @param restart [(s) => this.restart(s)] process the Scenario
   */
  parseStateTextAndRestart(stateText?: string, restart = (scenario: Scenario) => this.restart(scenario)) {
    // JSON5 barfs on trailing ','
    if (!stateText) stateText = (document.getElementById('parseStateText') as HTMLInputElement).value.replace(/,$/, '');
    console.log(stime(this, `.parseStateTextAndRestart`), stateText);
    const scenario = JSON5.parse(stateText) as Scenario;
    scenario.Aname = scenario.Aname ?? `parseStateText`;
    restart(scenario);
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
    const stateInfo = this.extractStateFromLogText(fileText, fileName, turn);
    this.setupToReadFileState();   // another thread to wait for next click
    this.restart(stateInfo);
  }

  /**
   *
   * @param logText contents of the file
   * @param fileName the file that was read
   * @param turn extracted from fileName\@turn
   * @returns stateInfo suitable for restart(stateInfo)
   */
  extractStateFromLogText(logText: string, fileName: string, turn: number) {
    const logArray = JSON5.parse(logText) as SetupElt[];
    const [, ...stateArray] = logArray;
    const state = stateArray.find(state => state.turn === turn) ?? ({}  as SetupElt);
    state.Aname = `${fileName}@${turn}`;
    return state;
  }

  /** compute TP.numPlayers from qParams['n'] */
  getNPlayers(qParams = this.qParams, nDefault = TP.numPlayers) {
    const n = qParams['n'];
    TP.numPlayers = Math.min(TP.maxPlayers, n ? Number.parseInt(n) : nDefault);
    return TP.numPlayers;
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

  /**
   * Make a Table instance [for cross injection] comprising
   * EventDispatcher, ScaleCont, GUI support for gamePlay & Player.
   *
   * startScenario() will call table.layoutTable() to populate it.
   */
  makeTable() {
    return new Table(this.stage);
  }

  /** create a Scenario for a new game; based on qParams.
   *
   * see also: gameSetup.resetState() which can cleanup or extend the Scenario.
   */
  initialScenario(qParams = this.qParams): StartElt {
    // qParams may have: mh, nh, hexRad (as HexAspect; from ParamGUI)
    const n = this.getNPlayers(qParams)
    return { Aname: 'defaultScenario', n, ...qParams, turn: 0,  };
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
   * - makeGamePlay(scenario)
   * - startScenario(scenario)
   *
   * @param scenario [initialScenario(this.qParams), qParams as obtained from URL]
   */
  // loadImagesThenStartup-->startup(qParams)
  // restart(?) --> startup(Param | Scenario)
  startup(scenario?: Scenario ) {
    // maybe qParams has nh, mh?
    this.resetState(scenario as HexAspect); // <-- inject/edit necessary elements: nGods, godNames,...
    this.logWriter.backlog.length = 0; // flush the backlog (assume file is closed)
    // initialScenario produces a StartupElt from qParams
    if (!scenario || scenario.turn == undefined) scenario = this.initialScenario();
    this.scenario = scenario;                  // retain for future reference
    this.nPlayers = this.getNPlayers();        // Scenario may override?
    this.hexMap = this.makeHexMap();           // then copied from gameSetup -> gamePlay
    this.table = this.makeTable();
    // Inject Table into GamePlay;
    // GameState, mouse/keyboard->GamePlay,
    this.gamePlay = this.makeGamePlay(scenario); // scenario provided... maybe not used

    this.startScenario(scenario);
  }
  /** the scenario last used by start(scenario) */
  scenario: Scenario;

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
    const gamePlay = this.gamePlay;
    this.makeAllPlayers(gamePlay);     // Players have: civics & meeples & TownSpec

    // Inject GamePlay to Table; all the GUI components, makeAllDistricts(), addTerrain, initialRegions
    this.table.layoutTable(gamePlay);     // mutual injection & make all panelForPlayer

    this.gamePlay.turnNumber = -1;   // in prep for setNextPlayer or parseScenario
    // Place Tiles and Meeple on HexMap, set GameState.
    this.parseScenario(scenario); // may change gamePlay.turnNumber, gamePlay.phase (& conflictRegion)
    this.gamePlay.logWriterLine0();

    gamePlay.forEachPlayer(p => p.newGame(gamePlay))        // make Planner *after* table & gamePlay are setup
    {
      this.restartable = false;  // block makeGUIs from reentrant restart()
      this.table.makeGUIs();
      this.restartable = true;   // *after* makeLines has stablilized selectValue
    }
    this.table.startGame();           // enable GUI & setNextPlayer()
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
