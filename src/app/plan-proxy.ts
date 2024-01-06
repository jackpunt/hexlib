import { stime } from "@thegraid/common-lib";
import type { Hex1, Hex2, HexMap } from "./hex";

/** Local/Direct methods of Planner */
export interface IPlanner extends IPlannerMethods {
  waitPaused(ident?: string): Promise<void>
}

/** Local & Remote methods of Planner */
interface IPlannerMethods {
  pause(): void
  resume():void
  /** enable Planner to continue/stop searching */
  roboMove(run: boolean): void;
  /** provoke Planner to search for next Move */
  //makeMove(playerColor: PlayerColor, history: IMove[], incb?: number): Promise<IHex>;
  /** permanently stop this IPlanner */
  terminate(): void;
}

class mockPlanner implements IPlanner {
  waitPaused(ident?: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  pause(): void {
    throw new Error("Method not implemented.");
  }
  resume(): void {
    throw new Error("Method not implemented.");
  }
  roboMove(run: boolean): void {
    throw new Error("Method not implemented.");
  }
  terminate(): void {
    console.log(stime(this, `.terminate: TBD`))
  }
}
export class Planner extends mockPlanner {
  pauseP: { resolved: boolean};
}

/**
 * IPlanner factory method, invoked from Player.newGame()
 * @param hexMap from the main GamePlay, location of Hex for makeMove
 * @param index player.index [0 -> 'b', 1 -> 'w']
 * @returns Planner or PlannerProxy
 */
export function newPlanner(hexMap: HexMap<Hex1>, index: number): IPlanner {
  // let planner = TP.pWorker
  //   ? new PlannerProxy(hexMap.mh, hexMap.nh, index, logWriter)    // -> Remote Planner [no Parallel]
  //   : new Planner(hexMap.mh, hexMap.nh, index, logWriter) // -> Local ParallelPlanner *or* Planner
  return new mockPlanner();
}

