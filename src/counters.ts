import { S, XY } from "@thegraid/common-lib";
import { RectShape, ValueCounter, ValueEvent, type PaintableShape } from "@thegraid/easeljs-lib";
import { MouseEvent, Text } from "@thegraid/easeljs-module";

/** ValueCounter in a Rectangle. */ // TODO: RectWithText
export class ValueCounterBox extends ValueCounter {

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    const width = text.getMeasuredWidth();
    const height = text.getMeasuredLineHeight();
    const high = height * 1.1;                   // change from ellispe margins
    const wide = Math.max(width * 1.1, high);    // change from ellispe margins
    return { width: wide, height: high };
  }

  protected override makeBox(color: string, high: number, wide: number): PaintableShape {
    return new RectShape({ x: -wide / 2, y: -high / 2, w: wide, h: high }, color, '');
  }
}

export class ButtonBox extends ValueCounterBox {
  constructor(name: string, initValue?: string, color?: string, fontSize?: number, fontName?: string, textColor?: string[]) {
    super(name, initValue, color, fontSize, fontName, textColor);
    this.mouseEnabled = true;
  }
}

/** ValueCounter specifically for number values (not string), includes ValueEvent('incr') and clickToInc() */
export class NumCounter extends ValueCounter {

  override get value() { return this._value as number }
  override set value(value: number) { super.value = value }

  // override for signature: number
  // override getValue(): number { return this.value ?? 0 }
  override setValue(value?: number, color?: string, fontSize?: number, fontName?: string, textColor?: string): void {
      super.setValue(value, color, fontSize, fontName, textColor)
  }

  /** increment by incr value & dispatch 'incr' event */
  incValue(incr: number) {
    this.updateValue(this.value + incr);
    this.dispatchEvent(new ValueEvent('incr', incr));
  }

  /** invoke incValue(value based on click event)
   * @param evt has nativeEvent with ctrl & shift state (ctrl negates value)
   * @param shiftVal [10] provide alternate increment value when shift is down
   * @param baseVal [1] basic increment value (when not shift)
   */
  incValueOnClick(evt: MouseEvent, shiftVal = 10, baseVal = 1) {
    const nevt = evt.nativeEvent;
    const incr = (nevt?.ctrlKey ? -1 : 1) * (nevt?.shiftKey ? shiftVal : baseVal);
    this.incValue(incr); // --> dispatchEvent('incr', incr)
  }

  /**
   * addListener: on(click) & maybe: on('incr') -> incr.incValue(evt.value)
   * @param incr configure click/incValue:
   * - false: click does nothing
   * - !false: click -> this.incValueOnClick()
   * - NumCounter: this.incValue(x) -> incr.incValue(x)
   * @param shiftVal see - incValueOnClick
   * @param baseVal see - incValueOnClick
   */
  clickToInc(incr: NumCounter | boolean = true, shiftVal?: number, baseVal?: number) {
    if (!incr) return;
    this.mouseEnabled = true;
    // clickToInc.name = 'clickToInc' so we can find on _listeners.
    const clickToInc = (evt: Object) => this.incValueOnClick(evt as MouseEvent, shiftVal, baseVal);
    this.addEventListener(S.click, clickToInc);
    if (incr instanceof NumCounter) {
      this.on('incr', (evt: Object) => incr.incValue((evt as ValueEvent).value as number));
    }
  }
}

/**
 * NumCounterBoxLabeled: larger box to include the label.
 */
export class NumCounterBox extends NumCounter {
  labelH = 0;
  override setLabel(label: string | Text, offset?: XY, fontSize?: number): void {
    fontSize = fontSize ?? this.labelFontSize;
    offset = offset ?? { x: this.label?.x ?? 0, y: this.label?.y || (fontSize / 2) };
    super.setLabel(label, offset, fontSize);
    this.labelH = this.label?.text ? this.labelFontSize ?? 0 : 0;
    this.wide = -1; // force new box
    this.setBoxWithValue(this.value);
  }

  protected makeBox0(color: string, high: number, wide: number): PaintableShape {
    return new RectShape({ x: -wide / 2, y: -high / 2, w: wide, h: high }, color, '')
  }

  // a little bit taller than basic text box, room for label
  protected override makeBox(color: string, high: number, wide: number) {
    const yinc = this.label ? this.labelFontSize / 2 : 0; // dubious math; but works for now...
    const shape = this.makeBox0(color, high + yinc, wide); // 4 px beneath for label
    shape.y += yinc / 2;
    return shape;
  }

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    const width = text.getMeasuredWidth();
    const height = text.getMeasuredLineHeight();
    const high = height * 1.1;                   // change from ellispe margins
    const wide = Math.max(width * 1.1, high);    // change from ellispe margins
    return { width: wide, height: high };
  }
}

/** NoZeroCounter: Display '' when value is numerically 0 */
export class NoZeroCounter extends NumCounter {
  protected override setBoxWithValue(value: number): void {
    super.setBoxWithValue(value || '');
  }
}

export class DecimalCounter extends NumCounterBox {
  decimal = 0;
  constructor(name: string, initValue?: number, color?: string, fontSize?: number, fontName?: string) {
    super(name, initValue, color, fontSize, fontName);
  }

  override setBoxWithValue(value: number): void {
    super.setBoxWithValue(value.toFixed(this.decimal));
  }
}
