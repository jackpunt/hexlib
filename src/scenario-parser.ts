
// TODO: namespace or object for GameState names

import { S, stime } from "@thegraid/common-lib";
import { KeyBinder } from "@thegraid/easeljs-lib";
import type { GamePlay } from "./game-play";
import { Hex, HexMap, IHex2 } from "./hex";

export interface SetupElt {
  Aname?: string;        // {orig-scene}@{turn}
  turn?: number;         // default to 0; (or 1...)
  gameState?: any[];     // GameState contribution
  coins?: number[];
  scores?: number[];
}
export type StartElt = { start: { time: string, scene: string, turn: number } };
export type LogElts = [ StartElt, ...SetupElt[]];

export class ScenarioParser {

  constructor(public map: HexMap<Hex>, public gamePlay: GamePlay) {

  }

  // coins, score, actions, events, AnkhPowers, Guardians in stable; specials for Amun, Bastet, Horus, ...
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

  saveState(gamePlay: GamePlay, silent = false) { // TODO: save Bastet 'deployed' state, so start: does not redploy; also: save conflictRegion! when current-event/phase is Conflict
    const turn = Math.max(0, gamePlay.turnNumber);
    const coins = gamePlay.allPlayers.map(p => p.coins);
    const time = stime.fs();

    const gameState = this.gamePlay.gameState.saveState();
    const setupElt = { turn, time, coins, gameState, } as SetupElt;
    this.logState(setupElt);
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
    KeyBinder.keyBinder.setKey('x', {
      func: () => {
        const cells = map.filterEachHex(hex => hex.isLegal);
        const list = cells.map(hex => `${hex.rcs},`);
        console.log(''.concat(...list));
      }
    });
  }
}

