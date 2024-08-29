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

  constructor(public gamePlay: GamePlay) {
    Object.keys(this.states).forEach((key) => this.states[key].Aname = key);
  }

  state: Phase;
  get table() { return this.gamePlay?.table; }
  get curPlayer() { return this.gamePlay.curPlayer; }

  saveGame() {
    this.gamePlay.gameSetup.scenarioParser.saveState(this.gamePlay);
  }

  // [eventName, eventSpecial, phase, args]
  saveState() {
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
    this.state = this.states[phase];
    this.state.start(...args);
  }

  /** set label & paint button with color;
   * empty label hides & disables.
   * optional continuation function on 'drawend'.
   */
  doneButton(label?: string, color = this.curPlayer.color, afterPopup?: () => void) {
    const doneButton = this.table.doneButton;
    doneButton.visible = !!label;
    doneButton.label_text = label;
    doneButton.paint(color, true);
    afterUpdate(doneButton, afterPopup)
  }

  /** invoked when 'Done' button clicked. [or whenever phase is 'done' by other means] */
  done(...args: any[]) {
    (this.state.done ?? ((...args: any[]) => { alert('no done method') }))(...args);
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
    Summon: { // recruit
      start: () => {
        this.doneButton('Summon done');
      },
      done: () => {
        this.phase('EndAction');
      },
    },
    EndAction: {
      nextPhase: 'ChooseAction',
      start: () => {
        const nextPhase = this.state.nextPhase = 'Event';
        this.phase(nextPhase);     // directl -> nextPhase
      },
      done: () => {
        this.phase(this.state.nextPhase ?? 'Start'); // TS want defined...
      }
    },
    Conflict: {
      start: () => {
      },
    },
    ConflictRegionDone: {
      start: () => {
        this.phase('ConflictNextRegion');
      }
    },
    ConflictDone: {
      start: () => {
        this.phase('EventDone');
      },
      // TODO: coins from Scales to Toth, add Devotion(Scales)
    },
    EndTurn: {
      start: () => {
        this.gamePlay.endTurn();
        this.phase('BeginTurn');
      },
    },
    /** Hathor: after addFollowers() Ankh-Event, BuildMonument, Worshipful, Summon-AnubisRansom */
  };

  setup() {

  }
}
