import { json } from "@thegraid/common-lib";
import { KeyBinder, S, Undo, blinkAndThen, stime } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import type { GameSetup, Scenario } from "./game-setup";
import { GameState } from "./game-state";
import { Hex, Hex1, HexMap, IdHex } from "./hex";
import { Meeple } from "./meeple";
import { Planner } from "./plan-proxy";
import { Player } from "./player";
import { SetupElt } from "./scenario-parser";
import { Table } from "./table";
import { PlayerColor, TP } from "./table-params";
import { Tile } from "./tile";

export type NamedObject = { name?: string, Aname?: string };
export class NamedContainer extends Container implements NamedObject {
  Aname: string;
  constructor(name: string, cx = 0, cy = 0) {
    super();
    this.Aname = this.name = name;
    this.x = cx; this.y = cy;
  }
}

class HexEvent {}

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
  /** the latest GamePlay instance in this VM/context/process */
  static gamePlay: GamePlay0;
  static gpid = 0
  readonly id = GamePlay0.gpid++

  readonly gameState: GameState = (this instanceof GamePlay) ? new GameState(this as GamePlay) : undefined as any as GameState;
  get gamePhase() { return this.gameState.state; }
  isPhase(name: string) { return this.gamePhase === this.gameState.states[name]; }
  phaseDone(...args: any[]) { this.gameState.done(...args); }
  recycleHex: Hex1;
  ll(n: number) { return TP.log > n }

  get logWriter() { return this.gameSetup.logWriter; }

  get allPlayers() { return Player.allPlayers; }
  get allTiles() { return Tile.allTiles; }

  readonly hexMap: HexMap<Hex>;          // created by GameSetup; no districts until Table.layoutTable!
  readonly redoMoves: { hex: Hex | IdHex }[] = []
  // 2 models: move-by-move undo/redo OR write scenario-state to file and reload
  // [or keep 'state' in-memory and reload from there]
  // hexline originally did undo/redo; ankh writes/reads Scenario object log_date_time.json

  logWriterLine0() {
    const setup = this.gameSetup, thus = this as any as GamePlay, turn = thus.turnNumber;
    let line = { time: stime.fs(), turn };
    let line0 = json(line, true); // machine readable starting conditions
    console.log(`-------------------- ${line0}`)
    this.logWriter.writeLine(`{start: ${line0}},`)
  }

  /** GamePlay0 - supply GodNames for each: new Player(...). */
  constructor(public gameSetup: GameSetup) {
    this.hexMap = gameSetup.hexMap;
  }

  turnNumber: number = 0    // = history.lenth + 1 [by this.setNextPlayer]
  curPlayerNdx: number = 0  // curPlayer defined in GamePlay extends GamePlay0
  curPlayer: Player;
  preGame = true;

  nextPlayer(plyr: Player = this.curPlayer) {
    const nxt = (plyr.index + 1) % Player.allPlayers.length;
    return Player.allPlayers[nxt];
  }

  forEachPlayer(f: (p: Player, index: number, players: Player[]) => void) {
    this.allPlayers.forEach((p, index, players) => f(p, index, players));
  }

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

  newTurn() {}

  setNextPlayer(turnNumber?: number): void {
    if (turnNumber === undefined) {
      this.turnNumber = turnNumber = this.turnNumber + 1;
      this.newTurn();  // override calls saveState()
    }
    this.turnNumber = turnNumber;
    const index = (turnNumber % this.allPlayers.length);
    this.preGame = false;
    this.curPlayerNdx = index;
    this.curPlayer = this.allPlayers[index];
    this.curPlayer.newTurn();
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
    // Player.allPlayers.forEach(player => player.setCounters(false));
    this.hexMap.update();
  }

  logFailure(type: string, reqd: number, avail: number, toHex: Hex) {
    const failText = `${type} required: ${reqd} > ${avail}`;
    console.log(stime(this, `.failToPayCost:`), failText, toHex.Aname);
    this.logText(failText, `GamePlay.failToPayCost`);
  }

  /**
   * Move tile to hex (or recycle).
   *
   * - hexline/anhk would check recycleHex; (see placeEither2)
   * - hexline would then update influence;
   *
   * Tile.dropFunc() -> Tile.placeTile() -> gp.placeEither()
   * @param tile ignore if undefined
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

  recycleTile(tile: Tile) {
    if (!tile) return;    // no prior reserveTile...
    let verb = tile.recycleVerb ?? 'recycled';
    if (tile.fromHex?.isOnMap) {
      if (tile.player !== this.curPlayer) {
        verb = 'defeated';
      } else if (tile instanceof Meeple) {
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
  /** GamePlay is the GUI-augmented extension of GamePlay0; uses Table */
  constructor(gameSetup: GameSetup, scenario: Scenario) {
    super(gameSetup);            // hexMap, history, gStats...
    Tile.gamePlay = this; // table
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

    // KeyBinder.keyBinder.setKey('U', { thisArg: this.gameState, func: this.gameState.undoAction, argVal: true })
    KeyBinder.keyBinder.setKey('p', { thisArg: this, func: this.saveState, argVal: true })
    KeyBinder.keyBinder.setKey('P', { thisArg: this, func: this.pickState, argVal: true })
    KeyBinder.keyBinder.setKey('C-p', { thisArg: this, func: this.pickState, argVal: false }) // can't use Meta-P
    KeyBinder.keyBinder.setKey('k', () => this.logWriter.showBacklog());
    KeyBinder.keyBinder.setKey('D', () => this.fixit())

    KeyBinder.keyBinder.setKey('C-s', () => {  // C-s START
      blinkAndThen(this.hexMap.mapCont.markCont, () => this.gameSetup.restart({}));
    });

    // diagnostics:
    table.undoShape.on(S.click, () => this.undoMove(), this)
    table.redoShape.on(S.click, () => this.redoMove(), this)
  }

  /** enter debugger, with interesting values in local scope */
  fixit() {
    const table = this.table, player = this.curPlayer
    const hexMap = this.hexMap
    console.log(stime(this, `.fixit:`), { player, table, hexMap });
    table.toggleText(true);
    debugger;
    return;
  }

  /** when turnNumber auto-increments. */
  override newTurn(): void {
  }

  readFileState() {
    document.getElementById('fsReadFileButton')?.click();
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

  backStates: Array<SetupElt> = [];
  /** setNextPlayer->startTurn (or Key['p']) */
  saveState() {
    if (this.nstate !== 0) {
      this.backStates = this.backStates.slice(this.nstate); // remove ejected states
      this.nstate = 0;
    }

    const state = this.gameSetup.scenarioParser.saveState(this);
    this.backStates.unshift(state);
    console.log(stime(this, `.saveState -------- #${this.nstate}:${this.backStates.length-1} turn=${state.turn}`), state);
  }
  // TODO: setup undo index to go fwd and back? wire into undoCont?
  nstate = 0;
  /** move nstate to older(back=true, S-P) or newer(back=false, C-P) states in backStates */
  pickState(back = true) {
    this.nstate = back ? Math.min(this.backStates.length - 1, this.nstate + 1) : Math.max(0, this.nstate - 1);
    const state = this.backStates[this.nstate];
    console.log(stime(this, `.pickState -------- #${this.nstate}:${this.backStates.length-1} turn=${state.turn}:`), state);
    this.gameSetup.parseScenario(state); // typically sets gamePlay.turnNumber
    console.log(stime(this, `.pickState -------- #${this.nstate}:${this.backStates.length-1} turn=${state.turn}:`), state);
    this.setNextPlayer(this.turnNumber);
  }

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
      console.log(stime(this, `.waitPaused: ${p.colorn} ${ident} waiting...`))
      await p.planner?.waitPaused(ident)
      console.log(stime(this, `.waitPaused: ${p.colorn} ${ident} running`))
    }
    this.hexMap.update();
  }
  pauseGame(p = this.curPlayer) {
    p.planner?.pause();
    this.hexMap.update();
    console.log(stime(this, `.pauseGame: ${p.colorn}`))
  }
  resumeGame(p = this.curPlayer) {
    p.planner?.resume();
    this.hexMap.update();
    console.log(stime(this, `.resumeGame: ${p.colorn}`))
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
   * with playerMove() [table.moveStoneToHex()]
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
    console.log(stime(this, `.autoPlay: ${p.colorn}.useRobo=`), p.useRobo)
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

  override setNextPlayer(turnNumber?: number) {
    this.curPlayer.panel.showPlayer(false);
    super.setNextPlayer(turnNumber); // update player.coins
    const fileName = this.gameSetup.logWriter.fileName;
    const [logName, ext] = (fileName ?? this.gameSetup.logTime_js)?.split('.');
    const backLog = this.logWriter.fileName ? '' : ' **';
    const logAt = `${logName}@${this.turnNumber}${backLog}`;
    this.logText(`&file=${logAt} ${this.curPlayer.Aname} ${stime.fs()}`, `GamePlay.setNextPlayer`);
    ; (document.getElementById('readFileName') as HTMLTextAreaElement).value = logAt;
    this.curPlayer.panel.showPlayer(true);
    this.paintForPlayer();
    this.updateCounters(); // beginning of round...
    this.curPlayer.panel.visible = true;
    this.table.showNextPlayer(); // get to nextPlayer, waitPaused when Player tries to make a move.?
    this.hexMap.update();
    this.startTurn();
    this.makeMove();
  }

  /** After setNextPlayer() */
  startTurn() {
  }

  paintForPlayer() {
  }

  /** dropFunc | eval_sendMove -- indicating new Move attempt */
  localMoveEvent(hev: HexEvent) {
    let redo = this.redoMoves.shift()   // pop one Move, maybe pop them all:
    //if (!!redo && redo.hex !== hev.hex) this.redoMoves.splice(0, this.redoMoves.length)
    //this.doPlayerMove(hev.hex, hev.playerColor)
    this.setNextPlayer()
    this.ll(2) && console.log(stime(this, `.localMoveEvent: after doPlayerMove - setNextPlayer =`), this.curPlayer.color)
    return false;
  }

  /** local Player has moved (S.add); network ? (sendMove.then(removeMoveEvent)) : localMoveEvent() */
  playerMoveEvent(hev: HexEvent) {
    this.localMoveEvent(hev)
    return false;
  }
}
