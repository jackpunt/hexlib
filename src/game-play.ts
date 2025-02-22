import { S, Undo, json, stime } from "@thegraid/common-lib";
import { KeyBinder, NamedObject, blinkAndThen } from "@thegraid/easeljs-lib";
import { Event } from "@thegraid/easeljs-module";
import type { GameSetup, Scenario } from "./game-setup";
import { GameState } from "./game-state";
import { Hex, Hex1, HexMap, IdHex } from "./hex";
import { Meeple } from "./meeple";
import { Planner } from "./plan-proxy";
import { Player } from "./player";
import { Table } from "./table";
import { PlayerColor, TP } from "./table-params";
import { Tile } from "./tile";
import { ScenarioParser, SetupElt } from "./scenario-parser";

/**
 * Event indicating a Tile has been placed on a Hex.
 *
 * Dispatched by Table
 *
 * Not actually related to the display list
 */
export class TileEvent extends Event {
  constructor(type: string, public tile: Tile, public hex: Hex) {
    super(type, false, true)
  }
}

/** moves also identified by IHex | Hex, indicating where stone was placed. */
class Move {
  Aname: string = '';
  ind: number = 0;
  board: any = {};
}

/**
 * Implement game, enforce the rules, manage GameState & hexMap; no GUI/Table required.
 */
export class GamePlay0 {

  static gpid = 0
  readonly id = GamePlay0.gpid++; // instance id of this GamePlay [debug help?]

  readonly gameState!: GameState;
  get gamePhase() { return this.gameState.state; }
  isPhase(name: string) { return this.gamePhase === this.gameState.states[name]; }
  phaseDone(...args: any[]) { this.gameState.done(...args); }
  recycleHex: Hex1;
  ll(n: number) { return TP.log > n }

  get logWriter() { return this.gameSetup.logWriter; }
  _allPlayers: Player[] = []
  get allPlayers() { return this._allPlayers; }
  _allTiles: Tile[] = []
  get allTiles() { return this._allTiles; }
  _allMeeples: Meeple[] = []
  get allMeeples() { return this._allMeeples; }

  readonly hexMap: HexMap<Hex>;          // created by GameSetup; no districts until Table.layoutTable!
  readonly redoMoves: { hex: Hex | IdHex }[] = []
  // 2 models: move-by-move undo/redo OR write scenario-state to file and reload
  // [or keep 'state' in-memory and reload from there]
  // hexline originally did undo/redo; ankh writes/reads Scenario object log_date_time.json

  /** log a json line of the form {${key}: ${line}}   */
  logWriterLine0(key = 'start', line: Record<string, any> = { time: stime.fs(), turn: this.turnNumber }) {
    let line0 = json(line, true); // machine readable starting conditions
    console.log(`-------------------- ${line0}`)
    this.logWriter.writeLine(`{${key}: ${line0}},`)
  }

  /** GamePlay0 - supply GodNames for each: new Player(...). */
  constructor(public gameSetup: GameSetup) {
    this.hexMap = gameSetup.hexMap;
    const [nr, nc] = this.hexMap.nRowCol
    this.nRows = nr;
    this.nCols = nc;
  }
  nCols: number
  nRows: number

  turnNumber: number = 0    // = history.lenth + 1 [by this.setNextPlayer]
  curPlayerNdx: number = 0  // curPlayer defined in GamePlay extends GamePlay0
  curPlayer: Player;
  preGame = true;

  nextPlayer(plyr: Player = this.curPlayer) {
    return plyr.nthPlayer();
  }

  forEachPlayer(f: (p: Player, index: number, players: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }

  /** table.logText(line, from) ONLY-IF instanceof GamePlay */
  logText(line: string, from = '') {
    if (this instanceof GamePlay) this.table.logText(line, from);
  }

  /**
   * When player has completed Actions and Event, do next player.
   */
  endTurn() {
    // Jubilee if win condition:
    if (this.isEndOfGame()) {
      this.endGame();
    } else {
      this.setNextPlayer();
    }
  }

  endGame() {
    const scores: number[] = [];
    let topScore = -1, winner: Player;
    console.log(stime(this, `.endGame: Game Over`), );

    // console.log(stime(this, `.endGame: Winner = ${winner.Aname}`), scores);
  }

  /**
   * hook invoked by GamePlay0.setNextPlayer() increments turnNumber.
   *
   * override to [for ex] saveState at beginning of this turn.
   * @param the NEW turnNumber
   */
  newTurnNumber(turnNumber: number) {}

  /**
   * Advance to given turnNumber
   * @param turnNumber [undefined -> auto-incr; curPlayer.newTurn()]
   */
  setNextPlayer(turnNumber?: number): void {
    if (turnNumber === undefined) {
      turnNumber = this.turnNumber + 1;
      this.newTurnNumber(turnNumber);
      this.turnNumber = turnNumber;
    }
    this.turnNumber = turnNumber;
    this.preGame = false;
    this.setCurPlayer(this.allPlayers[0].nthPlayer(turnNumber));
    this.curPlayer.newTurn();
  }

  setCurPlayer(player: Player) {
    this.curPlayer = player;
    this.curPlayerNdx = player.index;
  }

  isEndOfGame() {
    // can only win at the end of curPlayer's turn:
    const endp = false;
    if (endp) console.log(stime(this, `.isEndOfGame:`), );
    return endp;
  }

  /** Planner may override with alternative impl. */
  newMoveFunc: ((hex: Hex, sc: PlayerColor, caps: Hex[], gp: GamePlay0) => Move) | undefined
  newMove(hex: Hex, sc: PlayerColor, caps: Hex[], gp: GamePlay0) {
    return this.newMoveFunc? this.newMoveFunc(hex,sc, caps, gp) : new Move()
  }
  undoRecs: Undo = new Undo().enableUndo();
  addUndoRec(obj: NamedObject, name: string, value: any | Function = obj.name) {
    this.undoRecs.addUndoRec(obj, name, value);
  }

  /** update Counters (econ, expense, vp) for ALL players. */
  updateCounters() {       // TODO: find users of hexMap.update()
    // this.allPlayers.forEach(player => player.setCounters(false));
    this.hexMap.update();
  }

  logFailure(type: string, reqd: number, avail: number, toHex: Hex) {
    const failText = `${type} required: ${reqd} > ${avail}`;
    console.log(stime(this, `.failToPayCost:`), failText, toHex.Aname);
    this.logText(failText, `GamePlay.failToPayCost`);
  }

  /**
   * Move tile to hex
   *
   * - hexline/anhk would check recycleHex; (see placeEither2)
   * - hexline would then update influence;
   *
   * Tile.dropFunc() -> Tile.placeTile() -> gp.placeEither() -> tile.moveTo(toHex)
   * @param tile ignore if undefined [tile IS defined]
   * @param toHex tile.moveTo(toHex)
   * @param payCost commit and verify payment
   */
  placeEither(tile: Tile, toHex: Hex1 | undefined, payCost?: boolean) {
    tile?.moveTo(toHex);  // placeEither(tile, hex) --> moveTo(hex)
  }

  // advise or overload placeEither to look for RecycleHex...
  placeEither2(tile: Tile, toHex: Hex1 | undefined, payCost?: boolean) {
    if (!tile) return;
    const fromHex = tile.fromHex;
    if (toHex !== fromHex) this.logText(`${tile} -> ${toHex}`, `gamePlay.placeEither`)
    // super.placeEither(tile, toHex, payCost);
    this.placeEither(tile, toHex, payCost);
    if (toHex === this.recycleHex) {
      this.logText(`Recycle ${tile} from ${fromHex?.Aname || '?'}`, `gamePlay.placeEither`)
      this.recycleTile(tile);    // Score capture; log; return to homeHex
    }
    this.updateCounters();
  }

  // pro'ly specific to hextowns or ankh;
  recycleTile(tile: Tile) {
    if (!tile) return;    // no prior reserveTile...
    let verb = tile.recycleVerb ?? 'recycled';
    if (tile.fromHex?.isOnMap) {
      if (tile.player !== this.curPlayer) {
        verb = 'defeated'; // anhk
      } else if (tile.isMeep) {
      }
    }
    tile.logRecycle(verb);
    tile.sendHome();  // recycleTile
  }
}

/**
 * GamePlay with Table & GUI (KeyBinder, ParamGUI & Dragger)
 *
 * TODO: probably need to make this a Mixin;
 * so games can extend the non-GUI GamePlay0
 */
export class GamePlay extends GamePlay0 {
  readonly table: Table   // access to GUI (drag/drop) methods.
  override gameState: GameState = new GameState(this);
  /** GamePlay is the GUI-augmented extension of GamePlay0; uses Table */
  constructor(gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup);            // hexMap, history, gStats...
    Tile.gamePlay = this;        // provide pointer for all Tiles created.
    this.table = gameSetup.table;
    if (this.table.stage.canvas) this.bindKeys();
  }

  /** suitable for keybinding */
  unMove() {
    this.curPlayer.meeples.forEach((meep: Meeple) => meep.hex?.isOnMap && meep.unMove());
  }


  bindKeys() {
    let table = this.table
    let roboPause = () => { this.forEachPlayer(p => this.pauseGame(p) )}
    let roboResume = () => { this.forEachPlayer(p => this.resumeGame(p) )}
    let roboStep = () => {
      let p = this.curPlayer, op = this.nextPlayer(p)
      this.pauseGame(op); this.resumeGame(p);
    }
    // KeyBinder.keyBinder.setKey('p', { thisArg: this, func: roboPause })
    // KeyBinder.keyBinder.setKey('r', { thisArg: this, func: roboResume })
    // KeyBinder.keyBinder.setKey('s', { thisArg: this, func: roboStep })
    // KeyBinder.keyBinder.setKey('R', { thisArg: this, func: () => this.runRedo = true })
    // KeyBinder.keyBinder.setKey('q', { thisArg: this, func: () => this.runRedo = false })
    // KeyBinder.keyBinder.setKey(/1-9/, { thisArg: this, func: (e: string) => { TP.maxBreadth = Number.parseInt(e) } })

    KeyBinder.keyBinder.setKey('M-z', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('b', { thisArg: this, func: this.undoMove })
    KeyBinder.keyBinder.setKey('f', { thisArg: this, func: this.redoMove })
    //KeyBinder.keyBinder.setKey('S', { thisArg: this, func: this.skipMove })
    KeyBinder.keyBinder.setKey('Escape', () => this.table.stopDragging()) // Escape
    KeyBinder.keyBinder.setKey('C-c', { thisArg: this, func: this.stopPlayer })// C-c Stop Planner
    KeyBinder.keyBinder.setKey('u', { thisArg: this, func: this.unMove })
    // KeyBinder.keyBinder.setKey('n', () => { this.endTurn(); this.gameState.phase('BeginTurn') });
    KeyBinder.keyBinder.setKey('C', () => this.table.reCacheTiles()) // toggle-update cache

    KeyBinder.keyBinder.setKey('c', { thisArg: this, func: this.clickConfirm, argVal: false })
    KeyBinder.keyBinder.setKey('y', { thisArg: this, func: this.clickConfirm, argVal: true })
    KeyBinder.keyBinder.setKey('d', { thisArg: this, func: this.clickDone, argVal: true })

    KeyBinder.keyBinder.setKey('l', () => this.logWriter.pickLogFile());
    KeyBinder.keyBinder.setKey('L', () => this.logWriter.showBacklog());
    KeyBinder.keyBinder.setKey('M-l', () => this.logWriter.closeFile());
    KeyBinder.keyBinder.setKey('C-l', () => this.readFileState());
    KeyBinder.keyBinder.setKey('r', () => this.readFileState());
    KeyBinder.keyBinder.setKey('h', () => {this.table.textLog.visible = !this.table.textLog.visible; this.hexMap.update()});
    KeyBinder.keyBinder.setKey('P', () => this.selectBacklog(-1));
    KeyBinder.keyBinder.setKey('N', () => this.selectBacklog(1));
    KeyBinder.keyBinder.setKey('S', () => this.gameSetup.blinkThenRestart());
    KeyBinder.keyBinder.setKey('C-s', () => this.gameSetup.blinkThenRestart(undefined, '{}'));
    // blinkAndThen(this.hexMap.mapCont.markCont, () => this.gameSetup.restart({}));

    KeyBinder.keyBinder.setKey('D', () => this.debug())

    // diagnostics:
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
  }

  /** override! new ScenarioParser() when GameSetup -> parseScenario() */
  makeScenarioParser(hexMap: HexMap<Hex> = this.hexMap) {
    return new ScenarioParser(hexMap, this);
  }
  scenarioParser: ScenarioParser;
  /**
   * Place Tiles and Meeples on HexMap, set GameState.
   *
   * new ScenarioParser(hexMap, gamePlay).parseScenario(scenario);
   */
  parseScenario(scenario: SetupElt) {
    const scenarioParser = this.scenarioParser = this.makeScenarioParser();
    this.logWriter.writeLine(`// GameSetup.parseScenario: ${scenario.Aname}`)
    scenarioParser.parseScenario(scenario);
  }
  saveState() {
    this.scenarioParser.saveState(this)
  }

  backlogIndex = 1;
  selectBacklog(incr = -1) {
    const parseStateText = document.getElementById('parseStateText') as HTMLInputElement;
    const backlog = this.logWriter.backlog;
    const ndx = Math.max(0, Math.min(backlog.length - 1, this.backlogIndex + incr));
    this.backlogIndex = ndx;
    const logElt = backlog[ndx]; // .replace(/,\n$/,'');
    parseStateText.value = logElt;
  }

  /** enter debugger, with interesting values in local scope */
  debug() {
    const table = this.table, player = this.curPlayer
    const hexMap = this.hexMap
    console.log(stime(this, `.fixit:`), { player, table, hexMap });
    table.toggleText(true);
    debugger;
    return;
  }

  /** when turnNumber auto-increments. */
  override newTurnNumber(): void {
  }

  readFileState() {
    document.getElementById('fsReadFileButton')?.click(); // --> window.showOpenFilePicker()
  }

  // async fileState() {
  //   // Sadly, there is no way to suggest the filename for read?
  //   // I suppose we could do a openToWrite {suggestedName: ...} and accept the 'already exists'
  //   // seek to end, ...but not clear we could ever READ from the file handle.
  //   const turn = this.gameSetup.fileTurn;
  //   const [startelt, ...stateArray] = await this.gameSetup.injestFile(`log/${this.gameSetup.fileName}.js`, turn);
  //   const state = stateArray.find(state => state.turn === turn);
  //   this.backStates.length = this.nstate = 0;
  //   this.backStates.unshift(state);
  //   console.log(stime(this, `.fileState: logArray =\n`), stateArray);
  //   this.gameSetup.restart(state);
  // }

  clickDone() {
    this.table.doneClicked({})
  }
  clickConfirm(val: boolean) {
    this.curPlayer.panel.clickConfirm(val);
  }

  useReferee = true

  async waitPaused(p = this.curPlayer, ident = '') {
    this.hexMap.update()
    let isPaused = !(p.planner as Planner).pauseP.resolved
    if (isPaused) {
      console.log(stime(this, `.waitPaused: ${p.plyrId} ${ident} waiting...`))
      await p.planner?.waitPaused(ident)
      console.log(stime(this, `.waitPaused: ${p.plyrId} ${ident} running`))
    }
    this.hexMap.update();
  }
  pauseGame(p = this.curPlayer) {
    p.planner?.pause();
    this.hexMap.update();
    console.log(stime(this, `.pauseGame: ${p.plyrId}`))
  }
  resumeGame(p = this.curPlayer) {
    p.planner?.resume();
    this.hexMap.update();
    console.log(stime(this, `.resumeGame: ${p.plyrId}`))
  }
  /** tell [robo-]Player to stop thinking and make their Move; also set useRobo = false */
  stopPlayer() {
    this.autoMove(false)
    this.curPlayer.stopMove();
    console.log(stime(this, `.stopPlan:`), { planner: this.curPlayer.planner }, '----------------------')
    setTimeout(() => { this.table.showWinText(`stopPlan`) }, 400)
  }
  /** undo and makeMove(incb=1) */
  makeMoveAgain(arg?: boolean, ev?: any) {
    if (this.curPlayer.plannerRunning) return
    this.undoMove();
    this.makeMove(true, undefined, 1)
  }

  /**
   * Current Player takes action.
   *
   * after setNextPlayer: enable Player (GUI or Planner) to respond
   * with playerMove() [table.moveTileToHex()]
   *
   * Note: 1st move: player = otherPlayer(curPlayer)
   * @param auto this.runRedo || undefined -> player.useRobo
   * @param ev KeyBinder event, not used.
   * @param incb increase Breadth of search
   */
  makeMove(auto?: boolean, ev?: any, incb = 0) {
    let player = this.curPlayer
    if (this.runRedo) {
      this.waitPaused(player, `.makeMove(runRedo)`).then(() => setTimeout(() => this.redoMove(), 10))
      return
    }
    if (auto === undefined) auto = player.useRobo
    player.playerMove(auto, incb) // make one robo move
  }
  /** if useRobo == true, then Player delegates to robo-player immediately. */
  autoMove(useRobo = false) {
    this.forEachPlayer(p => {
      this.roboPlay(p.index, useRobo)
    })
  }
  autoPlay(pid = 0) {
    this.roboPlay(pid, true)  // KeyBinder uses arg2
    if (this.curPlayerNdx == pid) this.makeMove(true)
  }
  roboPlay(pid = 0, useRobo = true) {
    let p = this.allPlayers[pid]
    p.useRobo = useRobo
    console.log(stime(this, `.autoPlay: ${p.plyrId}.useRobo=`), p.useRobo)
  }
  /** when true, run all the redoMoves. */
  set runRedo(val: boolean) { (this._runRedo = val) && this.makeMove() }
  get runRedo() { return this.redoMoves.length > 0 ? this._runRedo : (this._runRedo = false) }
  _runRedo = false

  /** invoked by GUI or Keyboard */
  undoMove(undoTurn: boolean = true) {
    this.table.stopDragging() // drop on fromHex (no Move)
    //
    // undo state...
    //
    this.showRedoMark()
    this.hexMap.update()
  }
  /** doTableMove(redoMoves[0]) */
  redoMove() {
    this.table.stopDragging() // drop on fromHex (no Move)
    let move = this.redoMoves[0]// addStoneEvent will .shift() it off
    if (!move) return
    this.table.doTableMove(move.hex)
    this.showRedoMark()
    this.hexMap.update()
  }
  showRedoMark(hex: IdHex | Hex = this.redoMoves[0]?.hex) {
    if (!!hex) { // unless Skip or Resign...
      this.hexMap.showMark((hex instanceof Hex) ? hex : Hex.ofMap(hex, this.hexMap))
    }
  }


  override endTurn(): void {
    // vvvv maybe unnecessary: prompted by other confusion in save/restore:
    // this.table.activateActionSelect(true, undefined); // resetToFirstButton() before newTurn->saveState.
    super.endTurn();
  }

  /** parse logWriter: fileName, turnNumber, backLog.
   *
   * if logWriter.fileName not set, use gameSetup.logTime_js
   */
  logWriterInfo() {
    const fileName = this.logWriter.fileName;
    const [logName, ext] = (fileName ?? this.gameSetup.logTime_js)?.split('.');
    const backLog = fileName ? '' : ' **';
    const logAt = `${logName}@${this.turnNumber}${backLog}`;
    return { fileName, logName, ext, backLog, logAt, }
  }
  /**
   * invoked by GamePlay.setNextPlayer(turnNumber);
   * after super.setNextPlayer: {set curPlayer & curPlayer.newTurn() }
   * before showCurPlayer()
   *
   * @param from annotation indicating the origin of this log line
   * @param toConsole [true] false to not log on console
   */
  logNextPlayer(from: string, toConsole?: boolean) {
    const { logAt } = this.logWriterInfo();
    this.table.logText(`&file=${logAt} ${this.curPlayer.Aname} ${stime.fs()}`, from, toConsole);
    ; (document.getElementById('readFileName') as HTMLTextAreaElement).value = logAt;
  }

  override setNextPlayer(turnNumber?: number) {
    this.curPlayer.panel.showPlayer(false);
    super.setNextPlayer(turnNumber); // update player.coins
    this.logNextPlayer(`GamePlay.setNextPlayer`);
    this.curPlayer.panel.showPlayer(true);
    this.paintForPlayer(); // hextowns repaints the AuctionTiles
    this.updateCounters(); // hextowns recomputes econ, expense, vp (hexcity: range, etc)
    this.curPlayer.panel.visible = true;
    this.table.showNextPlayer(); // logCurPlayer, update redo/undo counts
    this.startTurn();            // hook function
    this.hexMap.update();
    this.makeMove();             // runRedo or playerMove(useRobo) [planner or GUI-drop]
  }

  /** After setNextPlayer() */
  startTurn() {
  }

  paintForPlayer() {
  }

  /**
   * Update board/game-state to accont for player's move (tile->hex)
   *
   * if terminating this player's turn: closeUndo()
   * @param hex
   * @param tile
   * @returns
   */
  doPlayerMove(hex: Hex, tile: Tile) {
    return;
  }

  /** dropFunc | eval_sendMove -- indicating new Move attempt
   *
   * All moves funnel through here;
   *
   * adjust 'redo';
   * doPlayerMove();
   *
   * Send move to network
   */
  localMoveEvent(hev: TileEvent) {
    let redo = this.redoMoves.shift()   // pop one Move, maybe pop them all:
    if (!!redo && redo.hex !== hev.hex) this.redoMoves.splice(0, this.redoMoves.length)
    this.doPlayerMove(hev.hex, hev.tile)
    this.undoRecs.closeUndo()
    this.setNextPlayer()
    this.ll(2) && console.log(stime(this, `.localMoveEvent: after doPlayerMove - setNextPlayer =`), this.curPlayer.color)
  }

  /** local Player has moved (S.add); network ? (sendMove.then(removeMoveEvent)) : localMoveEvent() */
  playerMoveEvent(hev: TileEvent) {
    this.localMoveEvent(hev)
    return false;
  }
}
