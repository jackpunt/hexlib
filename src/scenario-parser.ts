
import { S, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import type { GamePlay } from "./game-play";
import { Hex, HexMap, IHex2 } from "./hex";

// may need to declare module to 'extend' this interface...
// Scenario is StartElt &| SetupElt
// initialScenario produces a StartElt; for parseScenario(SetupElt)
// clips from file@turn are SetupElt; also for parseScenario(SetupElt)
// SetupElt is the main use of Scenario
export interface SetupElt {
  Aname?: string;        // {orig-scene}@{turn} or {filename}@{turn} ?
  turn?: number;         // default to 0; (or 1...)
  coins?: number[];      // Player has some coins, maybe also some VPs?
  gameState?: any[];     // GameState contribution
}
/** Reading from a logfile: [{start: StartElt},...SetupElt[]]
 * - first element is {start: StartElt}
 * - the rest is the SetupElt[]
 */
export type LogElts = [{ start: StartElt }, ...SetupElt[]];
// StartElt = { Aname, n? }; the initial conditions of the Scenario.
// other SetupElt in the logfile have intermediate states as the game progresses.
export type StartElt = {
  Aname: string,
  n?: number,            // number of Players; from qParams
  time?: string,
  turn?: number,         // usually start turn=0 or maybe -1 if auto-incr..
  scene?: string,        // reference name of Scenario (ala Ankh)
}
// export type StartElt = { start: StartBody };

export class ScenarioParser {

  constructor(public map: HexMap<Hex>, public gamePlay: GamePlay) {
    return;
  }

  /** parse json to recreate all the needed bits (see Ankh.parseScenario). */
  parseScenario(setup: SetupElt) {
    if (!setup) return;
    // console.log(stime(this, `.parseScenario: curState =`), this.saveState(this.gamePlay, true)); // log current state for debug...
    console.log(stime(this, `.parseScenario: newState =`), setup);

    const { gameState, turn } = setup;
    const map = this.map, gamePlay = this.gamePlay, allPlayers = gamePlay.allPlayers, table = gamePlay.table;
    const turnSet = (turn !== undefined); // indicates a Saved Scenario: assign & place everything
    if (turnSet) {
      gamePlay.turnNumber = turn;
      table.logText(`turn = ${turn}`, `parseScenario`);
      this.gamePlay.allTiles.forEach(tile => tile.hex?.isOnMap ? tile.sendHome() : undefined); // clear existing map
    }
    if (gameState) {
      this.gamePlay.gameState.parseState(gameState);
    }
    this.gamePlay.hexMap.update();
  }

  /** add any optional game-specific bits to SetupElt */
  addStateElements(setupElt: SetupElt) {
    setupElt.gameState = this.gamePlay.gameState.saveState();
    return setupElt;
  }

  /** override/replace to create a SetupElt and logState(logWriter) */
  saveState(gamePlay: GamePlay, logWriter = this.gamePlay.logWriter): SetupElt {
    const turn = Math.max(0, gamePlay.turnNumber);
    const coins = gamePlay.allPlayers.map(p => p.coins);
    const time = stime.fs();
    const setupElt = this.addStateElements({ turn, time, coins, } as SetupElt);
    if (logWriter) this.logState(setupElt, logWriter);
    return setupElt;
  }

  /** write each component of SetupElt on a line, wrapped between '{' ... '\n}' */
  logState(state: SetupElt, logWriter = this.gamePlay.logWriter) {
    let lines = '{', keys = Object.keys(state) as (keyof SetupElt)[], n = keys.length - 1;
    keys.forEach((key, ndx) => {
      const line = JSON.stringify(state[key]);
      lines = `${lines}\n  ${key}: ${line}${ndx < n ? ',' : ''}`;
    })
    lines = `${lines}\n},`
    logWriter.writeLine(lines);
  }

  /** debug utility */
  identCells(map: HexMap<IHex2>) {
    map.forEachHex(hex => {
      const hc = hex.cont;
      hc.mouseEnabled = true;
      hc.on(S.click, () => {
        hex.isLegal = !hex.isLegal;
        map.update();
      });
    });
    KeyBinder.keyBinder.setKey('x', () => {
      const cells = map.filterEachHex(hex => hex.isLegal);
      const list = cells.map(hex => `${hex.rcs},`);
      console.log(''.concat(...list));
    });
  }
}

