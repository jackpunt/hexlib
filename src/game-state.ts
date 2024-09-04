import { C, stime } from "@thegraid/common-lib";
// import { json } from "./functions";
import type { GamePlay } from "./game-play";
import { afterUpdate } from "@thegraid/easeljs-lib";


export interface Phase {
  Aname?: string,
  start(...args: any[]): void; // what to do in this phase
  done?: (...args: any[]) => void;          // for async; when done clicked: proceed
  undo?: () => void;
  nextPhase?: string,  // for BastetDeploy
}

export class GameState {

  constructor(public gamePlay: GamePlay, states?: Record<string,Phase>, purge: boolean | string[] = false) {
    if (states) this.defineStates(states, purge);
  }
  defineStates(states = this.states, purge: boolean | string[] = false) {
    if (purge) {
      const keys = (purge === true) ? Object.keys(this.states) : purge;
      keys.forEach((key) => delete this.states[key]);
    }
    Object.keys(states).forEach(key => this.states[key] = states[key])
    Object.keys(this.states).forEach((key) => this.states[key].Aname = key);
  }

  state: Phase;
  get table() { return this.gamePlay?.table; }
  get curPlayer() { return this.gamePlay.curPlayer; }

  saveGame() {
    this.gamePlay.gameSetup.scenarioParser.saveState(this.gamePlay);
  }

  // [eventName, eventSpecial, phase, args]
  /** create gameState component of ScenarioParser.SetupElt */
  saveState(): any[] {
    return []
  }

  parseState(args: any[]) {

  }
  startPhase = 'BeginTurn';
  startArgs = [];
  /** Bootstrap the Scenario: set bastetPlayer and then this.phase(startPhase, ...startArgs). */
  start() {
    this.phase(this.startPhase, ...this.startArgs);
  }

  /** set state and start with given args. */
  phase(phase: string, ...args: any[]) {
    console.log(stime(this, `.phase: ${this.state?.Aname ?? 'Initialize'} -> ${phase}`));
    const state = this.state = this.states[phase];
    if (!state) { alert(`no state named ${phase}`); debugger; }
    state.start(...args);
  }

  /**
   * Set label_text, visible, and paint(color).
   * @param label [undefined] set label; set visible = !!label
   * @param color [curPlayer.color] color to paint button
   * @param afterPopup continuation after stage.update()
   */
  doneButton(label?: string, color = this.curPlayer.color, afterPopup?: () => void) {
    const doneButton = this.table.doneButton;
    doneButton.visible = !!label;
    doneButton.label_text = label;
    doneButton.paint(color, true);
    afterUpdate(doneButton, afterPopup)
  }

  /** proceed to phase(this.donePhase)(...args) if state.done() is not defined */
  donePhase = 'EndAction';
  /**
   * Invoked when 'Done' button clicked. [or whenever phase is 'done' by other means]
   *
   * Call this.state.done(...args);
   *
   * If this.state.done is not defined, proceed to phase(this.donePhase, ...args)
   */
  done(...args: any[]) {
    if (this.state.done) {
      this.state.done(...args)
    } else {
      this.phase(this.donePhase, ...args); // start next Phase
    }
  }
  undoAction() {
    // const action = this.selectedAction;
    // if (!action) return;
    // this.states[action].undo?.();
  }

  readonly states: { [index: string]: Phase } = {
    BeginTurn: {
      start: () => {
        this.saveGame();
        this.phase('ChooseAction');
      },
      done: () => {
        this.phase('ChooseAction');
      }
    },
    Move: {
      start: () => {
        this.doneButton('Move done');
      },
      done: (ok?: boolean) => {
        this.phase('EndAction')
      },
    },
    EndAction: {
      nextPhase: 'ChooseAction',
      start: () => {
        const nextPhase = this.state.nextPhase = 'EndTurn';
        this.phase(nextPhase);     // directl -> nextPhase
      },
      done: () => {
        this.phase(this.state.nextPhase ?? 'Start'); // TS want defined...
      }
    },
    EndTurn: {
      start: () => {
        this.gamePlay.endTurn();
        this.phase('BeginTurn');
      },
    },
  };

}
