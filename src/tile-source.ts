import { Constructor, permute, removeEltFromArray } from "@thegraid/common-lib";
import { ValueEvent } from "@thegraid/easeljs-lib";
import { Point } from "@thegraid/easeljs-module";
import { NumCounter } from "./counters";
import { Hex2, type Hex1 } from "./hex";
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

  /**
   *
   * @param type class of unit sourced from this TileSource
   * @param hex where to place (& display) nextUnit()
   * @param player player.index in name of counter
   * @param counter shows length of available units
   */
  constructor(
    public readonly type: Constructor<T>,
    public readonly hex: Hex1,
    public readonly player?: Player,
    counter?: NumCounter,
  ) {
    this.Aname = `${type.name}Source`;
    if (counter === undefined) {
      const cont = hex.map.mapCont.counterCont; // assumes hexMap ISA HexMap<IHex2>?
      const pt = new Point(0, 0);
      const fs = TP.hexRad / 2, yoff = TP.hexRad / H.sqrt3; // TODO: adjust for NS vs EW topo?
      if (Hex2.isIHex2(hex)) {
        hex.cont.localToLocal(0, yoff, cont, pt);
      }
      counter = this.makeCounter(`${type.name}:${player?.index ?? 'any'}`, this.numAvailable, `lightblue`, fs);
      counter.attachToContainer(cont, { x: counter.x + pt.x, y: counter.y + pt.y });
    }
    this.counter = counter;
  }

  /** can override */
  makeCounter(name: string, initValue: number, color: string, fontSize: number, fontName?: string, textColors?: string[]) {
    return new NumCounter(name, initValue, color, fontSize, fontName, textColors);
  }

  /** length of available[] plus sourceHexUnit */
  get numAvailable() { return this.available.length + (this.sourceHexUnit ? 1 : 0); }

  /**
   * Make unit available for later deployment as nextUnit.
   * @param unit stack unit in available (& allUnits)
   * @param queue [false] set true to make unit the *last* available
   */
  availUnit(unit: T, queue = false) {
    if (!this.allUnits.includes(unit)) {
      this.allUnits.push(unit);
      unit.source = this;
    }
    if (!this.available.includes(unit)) {
      // 13-dec-2024: default is now push/pop, alt: queue to unshift
      queue ? this.available.unshift(unit) : this.available.push(unit);
      unit.hex = undefined;
      unit.visible = false;
      unit.x = unit.y = 0;
    }
    this.updateCounter();
  }

  /**
   * is unit available on this source?
   * @param unit a potential member of this source
   * @param inSource [false] if true, also check available.includes(unit)
   * @returns (unit === sourceHexUnit) || (inSource && available.includes(unit))
   */
  protected isAvailable(unit: T, inSource = false) {
    return (this.sourceHexUnit === unit) || (inSource && this.available.includes(unit));
  }

  /** shuffle the available units; nextUnit() will get a random unit. */
  permuteAvailable() {
    permute(this.available);
  }

  /** move unit to undefined, remove from parent container, remove from available and allUnits. */
  deleteUnit(unit: T, unparent = true) {
    if (unit && this.isAvailable(unit)) {
      unit.moveTo(undefined);
      unparent && unit.parent?.removeChild(unit);
    }
    const ndx = this.allUnits.indexOf(unit);
    if (ndx >= 0) this.allUnits.splice(ndx, 1);
    const adx = this.available.indexOf(unit);
    if (adx >= 0) {
      this.available.splice(adx, 1);
      this.updateCounter();
    }
  }

  /** move ALL units to undefined, and remove from parent container.
   * remove all from available (and allUnits)
   * @param doAlso invoke doAlso(unit) after removing from source
   * @return number of units deleted (previous length of allUnits).
   */
  deleteAll(doAlso = (unit: T) => { }, unparent = true) {
    const n = this.allUnits.length;
    this.allUnits.forEach(unit => {
      unit.moveTo(undefined); // --> this.nextUnit();
      unparent && unit.parent?.removeChild(unit);
      doAlso(unit);
    })
    this.allUnits.length = 0;
    this.available.length = 0;
    this.updateCounter();
    return n;
  }

  /**
   * Extract elements from allUnits (or available, in reverse order)
   * @param pred [(unit, ndx) => true] filter function
   * @param searchAll [true] if false, search only available
   * @returns Array of allUnits satisfying predicate
   */
  filterUnits(pred = (unit: T, ndx?: number) => this.isAvailable(unit, true), searchAll = true) {
    const src = searchAll ? this.allUnits : this.available;
    return src.filter(pred)
  }

  get sourceHexUnit() {
    return (this.hex.tile ?? this.hex.meep) as T | undefined; // moveTo puts it somewhere...
  }

  /** programmatic, vs Table.dragStart
   * @param next [true] if true invoke nextUnit();
   * @return sourceHexUnit, replacing it with nextUnit
   */
  takeUnit(next = true) {
    const unit = this.sourceHexUnit;
    unit?.moveTo(undefined);
    if (next) this.nextUnit();
    return unit;
  }

  /** move [next available] unit to source.hex, make visible */
  nextUnit(unit?: T) {
    if (unit) {
      this.availUnit(unit);     // include in allUnits & available
      removeEltFromArray(unit, this.available); // remove from available
    } else {
      unit = this.available.pop()
    }
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
    if (Hex2.isIHex2(this.hex)) {
      this.hex.cont?.updateCache(); // updateCache of counter on hex
      this.hex.map?.update();       // updateCache of hexMap with hex & counter
    }
  }
}

export class UnitSource<T extends Meeple> extends TileSource<T> {

}
