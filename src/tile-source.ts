import { Constructor } from "@thegraid/common-lib";
import { ValueEvent } from "@thegraid/easeljs-lib";
import { NumCounter } from "./counters";
import type { IHex2 } from "./hex";
import { H } from "./hex-intfs";
import { Meeple } from "./meeple";
import type { Player } from "./player";
import { TP } from "./table-params";
import { Tile } from "./tile";

/** a Dispenser of a set of Tiles.
 *
 * Source.hex.tile or Source.hex.meep holds an available Tile, placed by moveTo()
 */
export class TileSource<T extends Tile> {
  static update = 'update';
  readonly Aname: string
  private readonly allUnits: T[] = new Array<T>();
  private readonly available: T[] = new Array<T>();
  readonly counter: NumCounter;   // counter of available units.

  constructor(
    public readonly type: Constructor<T>,
    public readonly player: Player,
    public readonly hex: IHex2,
    counter?: NumCounter,
  ) {
    this.Aname = `${type.name}Source`;
    if (counter === undefined) {
      const cont = hex.map.mapCont.counterCont; // GP.gamePlay.hexMap.mapCont.counterCont;
      const { x, y } = hex.cont.localToLocal(0, TP.hexRad / H.sqrt3, cont);
      counter = this.makeCounter(`${type.name}:${player?.index ?? 'any'}`, this.numAvailable, `lightblue`, TP.hexRad / 2);
      counter.attachToContainer(cont, { x: counter.x + x, y: counter.y + y });
    }
    this.counter = counter;
  }

  /** can override */
  makeCounter(name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColor?: string) {
    return new NumCounter(name, initValue, color, fontSize, fontName, textColor);
  }

  /** length of available[] plus unit on this.hex */
  get numAvailable() { return this.available.length + (this.hex?.tile || this.hex?.meep ? 1 : 0); }

  /** mark unit available for later deployment */
  availUnit(unit: T) {
    if (!this.allUnits.includes(unit)) {
      this.allUnits.push(unit);
      unit.source = this;
    }
    if (!this.available.includes(unit)) {
      this.available.push(unit);
      unit.hex = undefined;
      unit.visible = false;
      unit.x = unit.y = 0;
    }
    this.updateCounter();
  }

  /** is the top available unit, next to be picked. */
  protected isAvailable(unit: Tile) {
    return this.hex.tile === unit;
  }

  /** move unit to undefined, remove from parent container, remove from available and allUnits. */
  deleteUnit(unit: T) {
    if (unit && this.isAvailable(unit)) {
      unit.moveTo(undefined); // --> this.nextUnit();
      unit.parent?.removeChild(unit);
    }
    const ndx = this.allUnits.indexOf(unit);
    if (ndx >= 0) this.allUnits.splice(ndx, 1);
    const adx = this.available.indexOf(unit);
    if (adx > 0) {
      this.available.splice(adx, 1);
      this.updateCounter();
    }
  }

  /** move all units to undefined, and remove from parent container.
   * remove all from available (and allUnits)
   * @return number of units deleted (previous length of allUnits).
   */
  deleteAll(doAlso: (unit: T) => void) {
    const n = this.allUnits.length;
    this.allUnits.forEach(unit => {
      unit.moveTo(undefined); // --> this.nextUnit();
      unit.parent?.removeChild(unit);
      doAlso(unit);
    })
    this.allUnits.length = 0;
    this.available.length = 0;
    this.updateCounter();
    return n;
  }

  filterUnits(pred: (unit: T, ndx?: number) => boolean) { return this.allUnits.filter(pred) }

  get sourceHexUnit() {
    return (this.hex.tile || this.hex.meep) as T; // moveTo puts it somewhere...
  }

  /** programmatic, vs Table.dragStart */
  takeUnit() {
    const unit = this.sourceHexUnit;
    unit?.moveTo(undefined);
    this.nextUnit();
    return unit;
  }

  /** move next available unit to source.hex, make visible */
  nextUnit(unit = this.available.shift()) {
    if (unit) {
      unit.visible = true;
      unit.moveTo(this.hex);     // and try push to available
    }
    this.updateCounter();
    return unit;
  }

  updateCounter() {
    this.counter.parent?.setChildIndex(this.counter, this.counter.parent.numChildren - 1);
    this.counter.setValue(this.numAvailable);
    ValueEvent.dispatchValueEvent(this.counter, TileSource.update, this.numAvailable);
    this.hex?.cont?.updateCache(); // updateCache of counter on hex
    this.hex?.map?.update();       // updateCache of hexMap with hex & counter
  }
}

export class UnitSource<T extends Meeple> extends TileSource<T> {

}
