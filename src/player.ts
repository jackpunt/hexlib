import { Constructor, stime } from "@thegraid/common-lib";
import { NumCounter } from "./counters";
import type { GamePlay } from "./game-play";
import { HexDir } from "./hex-intfs";
import { Meeple } from "./meeple";
import { IPlanner, newPlanner } from "./plan-proxy";
import type { PlayerPanel } from "./player-panel";
import { TP } from "./table-params";
import { MapTile, Tile, } from "./tile";

export class Player {
  static allPlayers: Player[] = [];
  // PlayerLib uses type string, client can make a restricted type
  static colorScheme: Record<string, string> = { red: 'Red', blue: 'Blue', green: 'darkgreen', violet: 'Violet', gold: 'gold', purple: 'purple' };
  /**
   * Can use canonical color name, is mapped to arbitrary HTML color.
   * @param ndx number or (keyof typeof Player.colorScheme)
   * @returns colorScheme[ndx]
   */
  static playerColor(ndx: number | string) {
    if (typeof ndx === 'number') ndx = Object.keys(Player.colorScheme)[ndx] as keyof typeof Player.colorScheme;
    return Player.colorScheme[ndx as keyof typeof Player.colorScheme];
  }
  static colorName(color: string) {
    return Object.keys(Player.colorScheme).find(k => Player.playerColor(k) === color)
  }

  readonly Aname: string;
  constructor(
    readonly index: number,
    public readonly gamePlay: GamePlay, // for headless, allow GamePlay0
  ) {
    Player.allPlayers[index] = this;
    TP.numPlayers = Player.allPlayers.length; // incrementing up to gamePlay.nPlayers
    this.color = Player.playerColor(index);
    const cname = Player.colorName(this.color)
    this.Aname = `P${index}:${cname}`;
    console.log(stime(this, `.new:`), this.Aname);
  }

  _color: string;
  get color() { return this._color; }
  set color(c: string) { this._color = c; }
  /** now used as 'nominal' in log to identify player, never used as a COLOR */
  get plyrId(): string { return `Plyr${this.index}`; }
  // Player shall paint their pieces to their color as necessary;
  // Other code shall operate using player.index;

  /** much useful context about this Player. */
  panel: PlayerPanel;

  allOf<T extends Tile>(claz: Constructor<T>) { return (Tile.allTiles as T[]).filter(t => t instanceof claz && t.player === this); }
  allOnMap<T extends Tile>(claz: Constructor<T>) { return this.allOf(claz).filter(t => t.hex?.isOnMap); }
  /** Resi/Busi/PS/Lake/Civics in play on Map */
  get mapTiles() { return this.allOf(MapTile) as MapTile[] }
  // Player's Leaders, Police & Criminals
  get meeples() { return Meeple.allMeeples.filter(meep => meep.player == this) };

  _score: number = 0;
  get score() { return this._score }
  set score(score: number) {
    this._score = Math.floor(score);
  }

  // Created in masse by Table.layoutCounter
  coinCounter: NumCounter; // set by layoutCounters: `${'Coin'}Counter`
  get coins() { return this.coinCounter?.value; }
  set coins(v: number) { this.coinCounter?.updateValue(v); }

  /** @deprecated only works for 2-players; use nthPlayer() */
  get otherPlayer() { return Player.allPlayers[1 - this.index] }
  nthPlayer(nth = 1) { return Player.allPlayers[(this.index + nth) % Player.allPlayers.length] }

  planner?: IPlanner;
  /** if true then invoke plannerMove */
  useRobo: boolean = false;

  readonly startDir: HexDir;

  /** make Civics, Leaders & Police; also makeLeaderHex() */
  makePlayerBits() {
    this.coinCounter = new NumCounter('coins', 0)
  }

  endGame(): void {
    this.planner?.terminate()
    this.planner = undefined
  }
  static remotePlayer = 1 // temporary, bringup-debug: index of 'remotePlayer' (see below)
  /**
   * Before start each new game.
   *
   * [make newPlanner for this Player]
   */
  newGame(gamePlay: GamePlay, url = TP.networkUrl) {
    this.planner?.terminate()
    // this.hgClient = (this.index == Player.remotePlayer) ? new HgClient(url, (hgClient) => {
    //   console.log(stime(this, `.hgClientOpen!`), hgClient)
    // }) : undefined
    // this.planner = newPlanner(gamePlay.hexMap, this.index)
  }

  newTurn() {
    // faceUp and record start location:
    this.meeples.forEach(meep => meep.faceUp(undefined, false)); // set meep.startHex for unMove
    this.gamePlay.hexMap.update();
  }

  stopMove() {
    this.planner?.roboMove(false)
  }
  /** if Planner is not running, maybe start it; else wait for GUI */ // TODO: move Table.dragger to HumanPlanner
  playerMove(useRobo = this.useRobo, incb = 0) {
    let running = this.plannerRunning
    // feedback for KeyMove:

    TP.log > 0 && console.log(stime(this, `(${this.plyrId}).playerMove(${useRobo}): useRobo=${this.useRobo}, running=${running}`))
    if (running) return
    if (useRobo || this.useRobo) {
    // start plannerMove from top of stack:
    // setTimeout(() => this.plannerMove(incb))
    }
    return      // robo or GUI will invoke gamePlay.doPlayerMove(...)
  }
  plannerRunning = false
  plannerMove(incb = 0) {
    this.planner?.roboMove(true)
    this.plannerRunning = true
    // let iHistory = this.table.gamePlay.iHistory
    // let ihexPromise = this.planner.makeMove(sc, iHistory, incb)
    // ihexPromise.then((ihex: IHex) => {
    //   this.plannerRunning = false
    //   this.table.moveTileToHex(ihex, sc)
    // })
  }
}
class RemotePlayer extends Player {
  override newGame(gamePlay: GamePlay) {
    this.planner?.terminate()
    // this.hgClient = (this.index == RemotePlayer.remotePlayer) ? new HgClient() : undefined
    // this.planner = newPlanner(gamePlay.hexMap, this.index, gamePlay.logWriter)
  }
}
